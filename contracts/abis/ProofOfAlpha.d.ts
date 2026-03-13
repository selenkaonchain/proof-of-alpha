import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------
export type PredictionCommittedEvent = {
    readonly committer: Address;
    readonly hash: bigint;
    readonly deadline: bigint;
};
export type PredictionRevealedEvent = {
    readonly committer: Address;
    readonly hash: bigint;
    readonly outcome: number;
};

// ------------------------------------------------------------------
// Call Results
// ------------------------------------------------------------------

/**
 * @description Represents the result of the commitPrediction function call.
 */
export type CommitPrediction = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<PredictionCommittedEvent>[]
>;

/**
 * @description Represents the result of the revealPrediction function call.
 */
export type RevealPrediction = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<PredictionRevealedEvent>[]
>;

/**
 * @description Represents the result of the getCommitment function call.
 */
export type GetCommitment = CallResult<
    {
        owner: bigint;
        timestamp: bigint;
        deadline: bigint;
        outcome: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getUserStats function call.
 */
export type GetUserStats = CallResult<
    {
        total: bigint;
        correct: bigint;
        wrong: bigint;
        streak: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getTotalCommitments function call.
 */
export type GetTotalCommitments = CallResult<
    {
        total: bigint;
    },
    OPNetEvent<never>[]
>;

// ------------------------------------------------------------------
// IProofOfAlpha
// ------------------------------------------------------------------
export interface IProofOfAlpha extends IOP_NETContract {
    commitPrediction(hash: Uint8Array, deadline: bigint): Promise<CommitPrediction>;
    revealPrediction(hash: Uint8Array, outcome: number): Promise<RevealPrediction>;
    getCommitment(hash: Uint8Array): Promise<GetCommitment>;
    getUserStats(user: Address): Promise<GetUserStats>;
    getTotalCommitments(): Promise<GetTotalCommitments>;
}
