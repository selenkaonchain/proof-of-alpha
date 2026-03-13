/**
 * ProofOfAlpha — OP_NET Smart Contract
 *
 * Stores prediction hash commitments on Bitcoin L1 via OP_NET.
 * Tracks reveal outcomes for verifiable on-chain reputation.
 *
 * Functions:
 *   - commitPrediction(hash, deadline) — stores hash + timestamp on-chain
 *   - revealPrediction(hash, outcome) — only committer can reveal (1=correct, 2=wrong)
 *   - getCommitment(hash) — read commitment data
 *   - getUserStats(address) — read user's on-chain reputation
 *   - getTotalCommitments() — global commitment count
 */

import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    OP_NET,
    Blockchain,
    Calldata,
    BytesWriter,
    NetEvent,
    StoredU256,
    Address,
    Revert,
} from '@btc-vision/btc-runtime/runtime';
import { StoredMapU256 } from '@btc-vision/btc-runtime/runtime';
import { AddressMemoryMap } from '@btc-vision/btc-runtime/runtime';
import { EMPTY_POINTER } from '@btc-vision/btc-runtime/runtime/math/bytes';
import {
    ADDRESS_BYTE_LENGTH,
    BOOLEAN_BYTE_LENGTH,
    U256_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime/utils';

// ─── Events ───

export class PredictionCommitted extends NetEvent {
    constructor(committer: Address, hash: u256, deadline: u64) {
        const data = new BytesWriter(ADDRESS_BYTE_LENGTH + U256_BYTE_LENGTH + 8);
        data.writeAddress(committer);
        data.writeU256(hash);
        data.writeU64(deadline);
        super('PredictionCommitted', data);
    }
}

export class PredictionRevealed extends NetEvent {
    constructor(committer: Address, hash: u256, outcome: u8) {
        const data = new BytesWriter(ADDRESS_BYTE_LENGTH + U256_BYTE_LENGTH + 1);
        data.writeAddress(committer);
        data.writeU256(hash);
        data.writeU8(outcome);
        super('PredictionRevealed', data);
    }
}

// ─── Storage Pointers ───

const ptrCommitOwner: u16 = Blockchain.nextPointer;
const ptrCommitTimestamp: u16 = Blockchain.nextPointer;
const ptrCommitDeadline: u16 = Blockchain.nextPointer;
const ptrCommitOutcome: u16 = Blockchain.nextPointer;

const ptrUserTotal: u16 = Blockchain.nextPointer;
const ptrUserCorrect: u16 = Blockchain.nextPointer;
const ptrUserWrong: u16 = Blockchain.nextPointer;
const ptrUserStreak: u16 = Blockchain.nextPointer;

const ptrTotalCommitments: u16 = Blockchain.nextPointer;

// ─── Contract ───

@final
export class ProofOfAlpha extends OP_NET {
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

        this.commitOwner = new StoredMapU256(ptrCommitOwner);
        this.commitTimestamp = new StoredMapU256(ptrCommitTimestamp);
        this.commitDeadline = new StoredMapU256(ptrCommitDeadline);
        this.commitOutcome = new StoredMapU256(ptrCommitOutcome);

        this.userTotal = new AddressMemoryMap(ptrUserTotal);
        this.userCorrect = new AddressMemoryMap(ptrUserCorrect);
        this.userWrong = new AddressMemoryMap(ptrUserWrong);
        this.userStreak = new AddressMemoryMap(ptrUserStreak);

        this._totalCommitments = new StoredU256(ptrTotalCommitments, EMPTY_POINTER);
    }

    public override onDeployment(_calldata: Calldata): void {
        this._totalCommitments.value = u256.Zero;
    }

    // ── commitPrediction ──
    @method(
        { name: 'hash', type: ABIDataTypes.BYTES32 },
        { name: 'deadline', type: ABIDataTypes.UINT64 },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('PredictionCommitted')
    public commitPrediction(calldata: Calldata): BytesWriter {
        const hash: u256 = calldata.readU256();
        const deadline: u64 = calldata.readU64();

        // Verify not already committed
        const existingTimestamp: u256 = this.commitTimestamp.get(hash);
        if (existingTimestamp != u256.Zero) {
            throw new Revert('Hash already committed');
        }

        const sender: Address = Blockchain.tx.sender;

        // Store commitment data
        this.commitOwner.set(hash, u256.fromUint8ArrayBE(sender));
        this.commitTimestamp.set(hash, u256.fromU64(Blockchain.block.number));
        this.commitDeadline.set(hash, u256.fromU64(deadline));
        this.commitOutcome.set(hash, u256.Zero); // 0 = pending

        // Increment user total
        const prevTotal: u256 = this.userTotal.get(sender);
        this.userTotal.set(sender, u256.add(prevTotal, u256.One));

        // Increment global counter
        this._totalCommitments.value = u256.add(
            this._totalCommitments.value,
            u256.One,
        );

        // Emit event
        this.emitEvent(new PredictionCommitted(sender, hash, deadline));

        const writer: BytesWriter = new BytesWriter(BOOLEAN_BYTE_LENGTH);
        writer.writeBoolean(true);
        return writer;
    }

    // ── revealPrediction ──
    @method(
        { name: 'hash', type: ABIDataTypes.BYTES32 },
        { name: 'outcome', type: ABIDataTypes.UINT8 },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    @emit('PredictionRevealed')
    public revealPrediction(calldata: Calldata): BytesWriter {
        const hash: u256 = calldata.readU256();
        const outcome: u8 = calldata.readU8();

        // Validate outcome (1=correct, 2=wrong)
        if (outcome != 1 && outcome != 2) {
            throw new Revert('Invalid outcome');
        }

        // Verify commitment exists
        const storedTimestamp: u256 = this.commitTimestamp.get(hash);
        if (storedTimestamp == u256.Zero) {
            throw new Revert('Commitment not found');
        }

        // Verify sender is original committer
        const sender: Address = Blockchain.tx.sender;
        const ownerU256: u256 = this.commitOwner.get(hash);
        if (ownerU256 != u256.fromUint8ArrayBE(sender)) {
            throw new Revert('Not the committer');
        }

        // Verify not already revealed
        const currentOutcome: u256 = this.commitOutcome.get(hash);
        if (currentOutcome != u256.Zero) {
            throw new Revert('Already revealed');
        }

        // Store outcome
        this.commitOutcome.set(hash, u256.fromU32(<u32>outcome));

        // Update user stats
        if (outcome == 1) {
            const prevCorrect: u256 = this.userCorrect.get(sender);
            this.userCorrect.set(sender, u256.add(prevCorrect, u256.One));
            const prevStreak: u256 = this.userStreak.get(sender);
            this.userStreak.set(sender, u256.add(prevStreak, u256.One));
        } else {
            const prevWrong: u256 = this.userWrong.get(sender);
            this.userWrong.set(sender, u256.add(prevWrong, u256.One));
            this.userStreak.set(sender, u256.Zero);
        }

        // Emit event
        this.emitEvent(new PredictionRevealed(sender, hash, outcome));

        const writer: BytesWriter = new BytesWriter(BOOLEAN_BYTE_LENGTH);
        writer.writeBoolean(true);
        return writer;
    }

    // ── getCommitment ──
    @view
    @method({ name: 'hash', type: ABIDataTypes.BYTES32 })
    @returns(
        { name: 'owner', type: ABIDataTypes.UINT256 },
        { name: 'timestamp', type: ABIDataTypes.UINT256 },
        { name: 'deadline', type: ABIDataTypes.UINT256 },
        { name: 'outcome', type: ABIDataTypes.UINT256 },
    )
    public getCommitment(calldata: Calldata): BytesWriter {
        const hash: u256 = calldata.readU256();

        const owner: u256 = this.commitOwner.get(hash);
        const timestamp: u256 = this.commitTimestamp.get(hash);
        const deadline: u256 = this.commitDeadline.get(hash);
        const outcome: u256 = this.commitOutcome.get(hash);

        const writer: BytesWriter = new BytesWriter(U256_BYTE_LENGTH * 4);
        writer.writeU256(owner);
        writer.writeU256(timestamp);
        writer.writeU256(deadline);
        writer.writeU256(outcome);
        return writer;
    }

    // ── getUserStats ──
    @view
    @method({ name: 'user', type: ABIDataTypes.ADDRESS })
    @returns(
        { name: 'total', type: ABIDataTypes.UINT256 },
        { name: 'correct', type: ABIDataTypes.UINT256 },
        { name: 'wrong', type: ABIDataTypes.UINT256 },
        { name: 'streak', type: ABIDataTypes.UINT256 },
    )
    public getUserStats(calldata: Calldata): BytesWriter {
        const addr: Address = calldata.readAddress();

        const total: u256 = this.userTotal.get(addr);
        const correct: u256 = this.userCorrect.get(addr);
        const wrong: u256 = this.userWrong.get(addr);
        const streak: u256 = this.userStreak.get(addr);

        const writer: BytesWriter = new BytesWriter(U256_BYTE_LENGTH * 4);
        writer.writeU256(total);
        writer.writeU256(correct);
        writer.writeU256(wrong);
        writer.writeU256(streak);
        return writer;
    }

    // ── getTotalCommitments ──
    @view
    @method()
    @returns({ name: 'total', type: ABIDataTypes.UINT256 })
    public getTotalCommitments(_calldata: Calldata): BytesWriter {
        const writer: BytesWriter = new BytesWriter(U256_BYTE_LENGTH);
        writer.writeU256(this._totalCommitments.value);
        return writer;
    }
}
