/**
 * ProofOfAlpha Smart Contract — ABI & Interface
 *
 * This defines the on-chain contract interface for the Proof of Alpha
 * prediction reputation system deployed on OP_NET (Bitcoin L1).
 *
 * Contract address should be set to the deployed contract address on testnet.
 */

import { ABIDataTypes, type BitcoinInterfaceAbi, BitcoinAbiTypes, type CallResult } from 'opnet';
import type { BaseContractProperties } from 'opnet';

// ── Contract Address (testnet deployment — hex pubkey format required by getContract) ──
export const PROOF_OF_ALPHA_CONTRACT =
    '0xbd63d3cd3fb3ce694240619cd3a347bdfd743a911a49340cdd9222fd6691a73e';

// ── ABI ──
export const PROOF_OF_ALPHA_ABI: BitcoinInterfaceAbi = [
    // ─── State-Changing Functions ───
    {
        name: 'commitPrediction',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'hash', type: ABIDataTypes.BYTES32 },
            { name: 'deadline', type: ABIDataTypes.UINT64 },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
    },
    {
        name: 'revealPrediction',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'hash', type: ABIDataTypes.BYTES32 },
            { name: 'outcome', type: ABIDataTypes.UINT8 },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
    },

    // ─── Read-Only Functions ───
    {
        name: 'getCommitment',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [{ name: 'hash', type: ABIDataTypes.BYTES32 }],
        outputs: [
            { name: 'owner', type: ABIDataTypes.UINT256 },
            { name: 'timestamp', type: ABIDataTypes.UINT256 },
            { name: 'deadline', type: ABIDataTypes.UINT256 },
            { name: 'outcome', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'getUserStats',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [{ name: 'user', type: ABIDataTypes.ADDRESS }],
        outputs: [
            { name: 'total', type: ABIDataTypes.UINT256 },
            { name: 'correct', type: ABIDataTypes.UINT256 },
            { name: 'wrong', type: ABIDataTypes.UINT256 },
            { name: 'streak', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'getTotalCommitments',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [{ name: 'total', type: ABIDataTypes.UINT256 }],
    },

    // ─── Events ───
    {
        name: 'PredictionCommitted',
        type: BitcoinAbiTypes.Event,
        values: [
            { name: 'committer', type: ABIDataTypes.ADDRESS },
            { name: 'hash', type: ABIDataTypes.BYTES32 },
            { name: 'deadline', type: ABIDataTypes.UINT64 },
        ],
    },
    {
        name: 'PredictionRevealed',
        type: BitcoinAbiTypes.Event,
        values: [
            { name: 'committer', type: ABIDataTypes.ADDRESS },
            { name: 'hash', type: ABIDataTypes.BYTES32 },
            { name: 'outcome', type: ABIDataTypes.UINT8 },
        ],
    },
];

// ── TypeScript interface for typed contract calls ──
export interface IProofOfAlphaContract extends BaseContractProperties {
    commitPrediction(
        hash: Uint8Array,
        deadline: bigint,
    ): Promise<CallResult<{ success: boolean }>>;

    revealPrediction(
        hash: Uint8Array,
        outcome: number,
    ): Promise<CallResult<{ success: boolean }>>;

    getCommitment(
        hash: Uint8Array,
    ): Promise<
        CallResult<{
            owner: bigint;
            timestamp: bigint;
            deadline: bigint;
            outcome: bigint;
        }>
    >;

    getUserStats(
        user: string,
    ): Promise<
        CallResult<{
            total: bigint;
            correct: bigint;
            wrong: bigint;
            streak: bigint;
        }>
    >;

    getTotalCommitments(): Promise<CallResult<{ total: bigint }>>;
}
