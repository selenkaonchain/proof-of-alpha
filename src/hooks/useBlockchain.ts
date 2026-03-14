/**
 * useBlockchain — OP_NET wallet connection and on-chain interaction hook.
 * Per BOB / Vibecode Bible: signer always null — OPWallet extension handles signing.
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { networks } from '@btc-vision/bitcoin';
import { JSONRpcProvider, getContract, IOP20Contract, OP_20_ABI } from 'opnet';
import { useWalletConnect } from '@btc-vision/walletconnect';
import {
    PROOF_OF_ALPHA_CONTRACT,
    PROOF_OF_ALPHA_ABI,
    type IProofOfAlphaContract,
} from '../contracts/ProofOfAlphaABI';

const NETWORK = networks.opnetTestnet;
const RPC_URL = 'https://testnet.opnet.org';

// $PILL token for balance display
const PILL_TOKEN_CONTRACT = '0xb09fc29c112af8293539477e23d8df1d3126639642767d707277131352040cbb';

export interface OnChainStats {
    total: number;
    correct: number;
    wrong: number;
    streak: number;
}

export interface BlockchainState {
    connected: boolean;
    walletAddress: string;
    btcBalance: string;
    tokenBalance: string;
    loading: boolean;
    txStatus: { type: 'pending' | 'success' | 'error'; message: string } | null;
    onChainStats: OnChainStats | null;
    connect: () => void;
    disconnect: () => void;
    commitPrediction: (predictionHash: string, deadlineTimestamp: number) => Promise<string | null>;
    revealOnChain: (predictionHash: string, outcome: 'correct' | 'wrong') => Promise<string | null>;
    verifyCommitment: (predictionHash: string) => Promise<{ exists: boolean; timestamp: number; outcome: number } | null>;
    refreshBalance: () => Promise<void>;
    refreshOnChainStats: () => Promise<void>;
}

export function useBlockchain(): BlockchainState {
    const wc = useWalletConnect();
    const providerRef = useRef<JSONRpcProvider | null>(null);
    const [tokenBalance, setTokenBalance] = useState('0');
    const [loading, setLoading] = useState(false);
    const [txStatus, setTxStatus] = useState<BlockchainState['txStatus']>(null);
    const [onChainStats, setOnChainStats] = useState<OnChainStats | null>(null);

    function getProvider(): JSONRpcProvider {
        if (!providerRef.current) {
            providerRef.current = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });
        }
        return providerRef.current;
    }

    function getPoAContract() {
        const provider = getProvider();
        return getContract<IProofOfAlphaContract>(
            PROOF_OF_ALPHA_CONTRACT,
            PROOF_OF_ALPHA_ABI,
            provider,
            NETWORK,
            wc.address ?? undefined,
        );
    }

    // ── Load PILL token balance ──
    const loadBalance = useCallback(async () => {
        if (!wc.address && !wc.walletAddress) return;
        try {
            const provider = getProvider();
            const contract = getContract<IOP20Contract>(
                PILL_TOKEN_CONTRACT,
                OP_20_ABI,
                provider,
                NETWORK,
                wc.address ?? undefined,
            );

            if (wc.address) {
                const result = await contract.balanceOf(wc.address);
                if (!('error' in result)) {
                    const props = result.properties as { balance?: bigint };
                    if (props.balance !== undefined) {
                        const bal = Number(props.balance) / 1e8;
                        setTokenBalance(bal.toFixed(2));
                        return;
                    }
                }
            }

            if (wc.walletAddress) {
                try {
                    const info = await provider.getPublicKeyInfo(wc.walletAddress, false);
                    if (info && 'p2tr' in info) {
                        const p2trAddr = (info as { p2tr: string }).p2tr;
                        const { Address } = await import('@btc-vision/transaction');
                        const addr = new Address(Buffer.from(p2trAddr, 'hex'));
                        const result2 = await contract.balanceOf(addr);
                        if (!('error' in result2)) {
                            const props2 = result2.properties as { balance?: bigint };
                            if (props2.balance !== undefined) {
                                const bal2 = Number(props2.balance) / 1e8;
                                setTokenBalance(bal2.toFixed(2));
                                return;
                            }
                        }
                    }
                } catch {
                    // Strategy B failed
                }
            }
        } catch (err) {
            console.warn('Balance load failed:', err);
        }
    }, [wc.address, wc.walletAddress]);

    // ── Load on-chain user stats from ProofOfAlpha contract ──
    const refreshOnChainStats = useCallback(async () => {
        if (!wc.address && !wc.walletAddress) return;
        try {
            const contract = getPoAContract();
            const addr = wc.address || wc.walletAddress;
            if (!addr) return;

            const result = await contract.getUserStats(addr);
            if (!('error' in result) && result.properties) {
                setOnChainStats({
                    total: Number(result.properties.total),
                    correct: Number(result.properties.correct),
                    wrong: Number(result.properties.wrong),
                    streak: Number(result.properties.streak),
                });
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes('Invalid contract')) {
                console.warn('Contract not yet indexed by OP_NET — will retry later');
            } else {
                console.warn('Failed to load on-chain stats:', err);
            }
        }
    }, [wc.address, wc.walletAddress]);

    useEffect(() => {
        if (wc.walletAddress) {
            loadBalance();
            refreshOnChainStats();
        }
    }, [wc.walletAddress, loadBalance, refreshOnChainStats]);

    // ── Commit prediction hash on-chain via ProofOfAlpha contract ──
    const commitPrediction = useCallback(
        async (predictionHash: string, deadlineTimestamp: number): Promise<string | null> => {
            if (!wc.walletAddress) {
                setTxStatus({ type: 'error', message: 'Wallet not connected' });
                return null;
            }

            setLoading(true);
            setTxStatus({ type: 'pending', message: 'Committing prediction hash on-chain...' });

            try {
                const contract = getPoAContract();

                // Convert hex hash string to bytes
                const hashBytes = new Uint8Array(
                    predictionHash.replace(/^0x/, '').match(/.{2}/g)!.map((b) => parseInt(b, 16)),
                );
                const deadlineBigint = BigInt(Math.floor(deadlineTimestamp / 1000));

                // Simulate the commitPrediction call
                const simulation = await contract.commitPrediction(hashBytes, deadlineBigint);
                if ('error' in simulation) {
                    throw new Error(`Contract call failed: ${(simulation as { error: string }).error}`);
                }
                if (simulation.revert) {
                    throw new Error(`Contract reverted: ${simulation.revert}`);
                }

                // Per BOB / Vibecode Bible: signer null — OPWallet extension signs
                setTxStatus({ type: 'pending', message: 'Approve transaction in OPWallet...' });

                const receipt = await simulation.sendTransaction({
                    signer: null,
                    mldsaSigner: null,
                    refundTo: wc.walletAddress!,
                    maximumAllowedSatToSpend: 100000n,
                    feeRate: 1,
                    network: NETWORK,
                });

                const txId = receipt?.transactionId || 'confirmed';
                const txIdStr = typeof txId === 'string' ? txId : String(txId);

                setTxStatus({
                    type: 'success',
                    message: `Prediction committed on-chain! TX: ${txIdStr.slice(0, 12)}...`,
                });

                setTimeout(() => {
                    loadBalance();
                    refreshOnChainStats();
                }, 3000);

                return txIdStr;
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : 'Transaction failed';
                setTxStatus({ type: 'error', message });
                return null;
            } finally {
                setLoading(false);
            }
        },
        [wc.walletAddress, wc.address, loadBalance, refreshOnChainStats],
    );

    // ── Reveal prediction on-chain ──
    const revealOnChain = useCallback(
        async (predictionHash: string, outcome: 'correct' | 'wrong'): Promise<string | null> => {
            if (!wc.walletAddress) {
                setTxStatus({ type: 'error', message: 'Wallet not connected' });
                return null;
            }

            setLoading(true);
            setTxStatus({ type: 'pending', message: 'Revealing prediction on-chain...' });

            try {
                const contract = getPoAContract();

                const hashBytes = new Uint8Array(
                    predictionHash.replace(/^0x/, '').match(/.{2}/g)!.map((b) => parseInt(b, 16)),
                );
                const outcomeValue = outcome === 'correct' ? 1 : 2;

                const simulation = await contract.revealPrediction(hashBytes, outcomeValue);
                if ('error' in simulation) {
                    throw new Error(`Contract call failed: ${(simulation as { error: string }).error}`);
                }
                if (simulation.revert) {
                    throw new Error(`Contract reverted: ${simulation.revert}`);
                }

                // Per BOB / Vibecode Bible: signer null — OPWallet extension signs
                setTxStatus({ type: 'pending', message: 'Approve transaction in OPWallet...' });

                const receipt = await simulation.sendTransaction({
                    signer: null,
                    mldsaSigner: null,
                    refundTo: wc.walletAddress!,
                    maximumAllowedSatToSpend: 100000n,
                    feeRate: 1,
                    network: NETWORK,
                });

                const txId = receipt?.transactionId || 'confirmed';
                const txIdStr = typeof txId === 'string' ? txId : String(txId);

                setTxStatus({
                    type: 'success',
                    message: `Prediction revealed on-chain! TX: ${txIdStr.slice(0, 12)}...`,
                });

                setTimeout(() => refreshOnChainStats(), 3000);

                return txIdStr;
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : 'Reveal transaction failed';
                setTxStatus({ type: 'error', message });
                return null;
            } finally {
                setLoading(false);
            }
        },
        [wc.walletAddress, wc.address, refreshOnChainStats],
    );

    // ── Verify a commitment exists on-chain ──
    const verifyCommitment = useCallback(
        async (
            predictionHash: string,
        ): Promise<{ exists: boolean; timestamp: number; outcome: number } | null> => {
            try {
                const contract = getPoAContract();
                const hashBytes = new Uint8Array(
                    predictionHash.replace(/^0x/, '').match(/.{2}/g)!.map((b) => parseInt(b, 16)),
                );

                const result = await contract.getCommitment(hashBytes);
                if ('error' in result) return null;

                const timestamp = Number(result.properties.timestamp);
                return {
                    exists: timestamp > 0,
                    timestamp: timestamp * 1000, // convert to ms
                    outcome: Number(result.properties.outcome),
                };
            } catch {
                return null;
            }
        },
        [wc.address, wc.walletAddress],
    );

    // Clear tx status after 6 seconds
    useEffect(() => {
        if (txStatus && txStatus.type !== 'pending') {
            const timer = setTimeout(() => setTxStatus(null), 6000);
            return () => clearTimeout(timer);
        }
    }, [txStatus]);

    return {
        connected: !!wc.walletAddress,
        walletAddress: wc.walletAddress || '',
        btcBalance: wc.walletBalance ? formatSatsBtc(wc.walletBalance) : '0',
        tokenBalance,
        loading,
        txStatus,
        onChainStats,
        connect: wc.openConnectModal,
        disconnect: wc.disconnect,
        commitPrediction,
        revealOnChain,
        verifyCommitment,
        refreshBalance: loadBalance,
        refreshOnChainStats,
    };
}

function formatSatsBtc(sats: bigint | number | string): string {
    const n = typeof sats === 'bigint' ? Number(sats) : typeof sats === 'string' ? Number(sats) : sats;
    return (n / 1e8).toFixed(4);
}
