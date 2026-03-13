/**
 * ProofOfAlpha — OP_NET Smart Contract (AssemblyScript)
 *
 * Deployed on Bitcoin L1 via OP_NET. Stores prediction hash commitments
 * on-chain and tracks reveal outcomes for verifiable reputation.
 *
 * Storage:
 *   - commitments: mapping(bytes32 hash => Commitment struct)
 *   - userStats: mapping(address => UserStats struct)
 *   - totalCommitments: uint256 counter
 *
 * Functions:
 *   - commitPrediction(hash: bytes32, deadline: uint64) → stores hash + timestamp
 *   - revealPrediction(hash: bytes32, outcome: uint8) → marks outcome (1=correct, 2=wrong)
 *   - getCommitment(hash: bytes32) → returns commitment data
 *   - getUserStats(address) → returns user's total/correct/wrong/streak
 *
 * Events:
 *   - PredictionCommitted(committer, hash, deadline)
 *   - PredictionRevealed(committer, hash, outcome)
 *
 * NOTE: This file is the contract SOURCE for reference/deployment.
 *       It must be compiled with @btc-vision/btc-runtime (OP_NET AS compiler).
 *       The frontend interacts via the ABI defined in src/contracts/ProofOfAlphaABI.ts
 */

import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    OP_NET,
    Blockchain,
    Address,
    Calldata,
    BytesWriter,
    StoredU256,
    StoredMapU256,
    AddressMemoryMap,
    Revert,
    NetEvent,
} from '@btc-vision/btc-runtime/runtime';

// ─── Constants ───
const OUTCOME_CORRECT: u8 = 1;
const OUTCOME_WRONG: u8 = 2;

const ADDRESS_BYTE_LENGTH: u32 = 32;
const U256_BYTE_LENGTH: u32 = 32;

// Zero sentinel
const ZERO = u256.Zero;

// ─── Events ───

@final
class PredictionCommittedEvent extends NetEvent {
    constructor(committer: Address, hash: u256, deadline: u64) {
        const data = new BytesWriter(ADDRESS_BYTE_LENGTH + U256_BYTE_LENGTH + 8);
        data.writeAddress(committer);
        data.writeU256(hash);
        data.writeU64(deadline);
        super('PredictionCommitted', data);
    }
}

@final
class PredictionRevealedEvent extends NetEvent {
    constructor(committer: Address, hash: u256, outcome: u8) {
        const data = new BytesWriter(ADDRESS_BYTE_LENGTH + U256_BYTE_LENGTH + 1);
        data.writeAddress(committer);
        data.writeU256(hash);
        data.writeU8(outcome);
        super('PredictionRevealed', data);
    }
}

// ─── Contract ───

@final
export class ProofOfAlpha extends OP_NET {
    // ── Storage Pointers ──
    // Commitment data: hash → { owner (address), timestamp (u64), deadline (u64), outcome (u8) }
    // We store each field in a separate map keyed by the hash for simplicity.
    private commitOwnerPointer: u16 = Blockchain.nextPointer;
    private commitTimestampPointer: u16 = Blockchain.nextPointer;
    private commitDeadlinePointer: u16 = Blockchain.nextPointer;
    private commitOutcomePointer: u16 = Blockchain.nextPointer;

    // User stats: address → { total, correct, wrong, streak }
    private userTotalPointer: u16 = Blockchain.nextPointer;
    private userCorrectPointer: u16 = Blockchain.nextPointer;
    private userWrongPointer: u16 = Blockchain.nextPointer;
    private userStreakPointer: u16 = Blockchain.nextPointer;

    // Global counter
    private totalCommitmentsPointer: u16 = Blockchain.nextPointer;

    // ── Storage Instances ──
    private commitOwner: StoredMapU256;
    private commitTimestamp: StoredMapU256;
    private commitDeadline: StoredMapU256;
    private commitOutcome: StoredMapU256;

    private userTotal: AddressMemoryMap;
    private userCorrect: AddressMemoryMap;
    private userWrong: AddressMemoryMap;
    private userStreak: AddressMemoryMap;

    private _totalCommitments: StoredU256;

    public constructor() {
        super();

        this.commitOwner = new StoredMapU256(this.commitOwnerPointer);
        this.commitTimestamp = new StoredMapU256(this.commitTimestampPointer);
        this.commitDeadline = new StoredMapU256(this.commitDeadlinePointer);
        this.commitOutcome = new StoredMapU256(this.commitOutcomePointer);

        this.userTotal = new AddressMemoryMap(this.userTotalPointer);
        this.userCorrect = new AddressMemoryMap(this.userCorrectPointer);
        this.userWrong = new AddressMemoryMap(this.userWrongPointer);
        this.userStreak = new AddressMemoryMap(this.userStreakPointer);

        this._totalCommitments = new StoredU256(
            this.totalCommitmentsPointer,
            u256.Zero,
        );
    }

    public override onDeployment(_calldata: Calldata): void {
        // No special deployment logic needed
        this._totalCommitments.value = u256.Zero;
    }

    // ── commitPrediction(hash: bytes32, deadline: uint64) ──
    // Stores the prediction hash on-chain with sender + timestamp + deadline.
    public commitPrediction(calldata: Calldata): BytesWriter {
        const hash = calldata.readU256(); // bytes32 as u256
        const deadline = calldata.readU64();

        // Verify this hash hasn't been committed already
        const existingTimestamp = this.commitTimestamp.get(hash);
        if (existingTimestamp != ZERO) {
            Revert('Hash already committed');
        }

        const sender = Blockchain.tx.sender;
        const now = Blockchain.block.timestamp;

        // Store commitment
        this.commitOwner.set(hash, sender.toU256());
        this.commitTimestamp.set(hash, u256.fromU64(now));
        this.commitDeadline.set(hash, u256.fromU64(deadline));
        this.commitOutcome.set(hash, u256.Zero); // 0 = pending

        // Increment user total
        const prevTotal = this.userTotal.get(sender);
        this.userTotal.set(sender, u256.add(prevTotal, u256.One));

        // Increment global counter
        this._totalCommitments.value = u256.add(
            this._totalCommitments.value,
            u256.One,
        );

        // Emit event
        this.emitEvent(new PredictionCommittedEvent(sender, hash, deadline));

        const writer = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    // ── revealPrediction(hash: bytes32, outcome: uint8) ──
    // Only the original committer can reveal. outcome: 1=correct, 2=wrong
    public revealPrediction(calldata: Calldata): BytesWriter {
        const hash = calldata.readU256();
        const outcome = calldata.readU8();

        // Validate outcome
        if (outcome != OUTCOME_CORRECT && outcome != OUTCOME_WRONG) {
            Revert('Invalid outcome: must be 1 (correct) or 2 (wrong)');
        }

        // Verify commitment exists
        const storedTimestamp = this.commitTimestamp.get(hash);
        if (storedTimestamp == ZERO) {
            Revert('Commitment not found');
        }

        // Verify sender is the original committer
        const sender = Blockchain.tx.sender;
        const ownerU256 = this.commitOwner.get(hash);
        if (ownerU256 != sender.toU256()) {
            Revert('Only the committer can reveal');
        }

        // Verify not already revealed
        const currentOutcome = this.commitOutcome.get(hash);
        if (currentOutcome != ZERO) {
            Revert('Already revealed');
        }

        // Store outcome
        this.commitOutcome.set(hash, u256.fromU32(outcome));

        // Update user stats
        if (outcome == OUTCOME_CORRECT) {
            const prevCorrect = this.userCorrect.get(sender);
            this.userCorrect.set(sender, u256.add(prevCorrect, u256.One));
            const prevStreak = this.userStreak.get(sender);
            this.userStreak.set(sender, u256.add(prevStreak, u256.One));
        } else {
            const prevWrong = this.userWrong.get(sender);
            this.userWrong.set(sender, u256.add(prevWrong, u256.One));
            this.userStreak.set(sender, u256.Zero); // Reset streak
        }

        // Emit event
        this.emitEvent(new PredictionRevealedEvent(sender, hash, outcome));

        const writer = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    // ── getCommitment(hash: bytes32) → (owner, timestamp, deadline, outcome) ──
    public getCommitment(calldata: Calldata): BytesWriter {
        const hash = calldata.readU256();

        const owner = this.commitOwner.get(hash);
        const timestamp = this.commitTimestamp.get(hash);
        const deadline = this.commitDeadline.get(hash);
        const outcome = this.commitOutcome.get(hash);

        const writer = new BytesWriter(U256_BYTE_LENGTH * 4);
        writer.writeU256(owner);
        writer.writeU256(timestamp);
        writer.writeU256(deadline);
        writer.writeU256(outcome);
        return writer;
    }

    // ── getUserStats(address) → (total, correct, wrong, streak) ──
    public getUserStats(calldata: Calldata): BytesWriter {
        const addr = calldata.readAddress();

        const total = this.userTotal.get(addr);
        const correct = this.userCorrect.get(addr);
        const wrong = this.userWrong.get(addr);
        const streak = this.userStreak.get(addr);

        const writer = new BytesWriter(U256_BYTE_LENGTH * 4);
        writer.writeU256(total);
        writer.writeU256(correct);
        writer.writeU256(wrong);
        writer.writeU256(streak);
        return writer;
    }

    // ── getTotalCommitments() → uint256 ──
    public getTotalCommitments(_calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(U256_BYTE_LENGTH);
        writer.writeU256(this._totalCommitments.value);
        return writer;
    }
}
