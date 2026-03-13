import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const ProofOfAlphaEvents = [
    {
        name: 'PredictionCommitted',
        values: [
            { name: 'committer', type: ABIDataTypes.ADDRESS },
            { name: 'hash', type: ABIDataTypes.UINT256 },
            { name: 'deadline', type: ABIDataTypes.UINT64 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'PredictionRevealed',
        values: [
            { name: 'committer', type: ABIDataTypes.ADDRESS },
            { name: 'hash', type: ABIDataTypes.UINT256 },
            { name: 'outcome', type: ABIDataTypes.UINT8 },
        ],
        type: BitcoinAbiTypes.Event,
    },
];

export const ProofOfAlphaAbi = [
    {
        name: 'commitPrediction',
        inputs: [
            { name: 'hash', type: ABIDataTypes.BYTES32 },
            { name: 'deadline', type: ABIDataTypes.UINT64 },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'revealPrediction',
        inputs: [
            { name: 'hash', type: ABIDataTypes.BYTES32 },
            { name: 'outcome', type: ABIDataTypes.UINT8 },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getCommitment',
        constant: true,
        inputs: [{ name: 'hash', type: ABIDataTypes.BYTES32 }],
        outputs: [
            { name: 'owner', type: ABIDataTypes.UINT256 },
            { name: 'timestamp', type: ABIDataTypes.UINT256 },
            { name: 'deadline', type: ABIDataTypes.UINT256 },
            { name: 'outcome', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getUserStats',
        constant: true,
        inputs: [{ name: 'user', type: ABIDataTypes.ADDRESS }],
        outputs: [
            { name: 'total', type: ABIDataTypes.UINT256 },
            { name: 'correct', type: ABIDataTypes.UINT256 },
            { name: 'wrong', type: ABIDataTypes.UINT256 },
            { name: 'streak', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getTotalCommitments',
        constant: true,
        inputs: [],
        outputs: [{ name: 'total', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    ...ProofOfAlphaEvents,
    ...OP_NET_ABI,
];

export default ProofOfAlphaAbi;
