/**
 * usePredictions — Local state management for structured oracle-verified predictions.
 *
 * Flow: pick asset + direction → fetch entry price from Pyth → hash → commit on-chain → store.
 * Auto-resolution: when deadline passes, Pyth oracle checks exit price → determines outcome.
 */

import { useState, useEffect, useCallback } from 'react';
import { sha256 } from '../utils/helpers';

export type PredictionOutcome = 'pending' | 'correct' | 'wrong';

export interface Prediction {
    id: string;
    asset: string;
    direction: 'long' | 'short';
    entryPrice: number;
    exitPrice: number | null;
    hash: string;
    createdAt: number;
    resolvedAt: number | null;
    outcome: PredictionOutcome;
    txId: string | null;
    walletAddress: string;
    deadline: number; // timestamp when prediction expires
}

export interface UserStats {
    totalPredictions: number;
    correct: number;
    wrong: number;
    pending: number;
    accuracy: number;       // percentage 0-100
    streak: number;         // current correct streak
    bestStreak: number;
}

const STORAGE_KEY = 'proof-of-alpha-predictions-v2';
const LEADERBOARD_KEY = 'proof-of-alpha-leaderboard-v2';

export interface LeaderboardEntry {
    address: string;
    total: number;
    correct: number;
    accuracy: number;
    streak: number;
    lastActive: number;
}

export function usePredictions(walletAddress: string) {
    const [predictions, setPredictions] = useState<Prediction[]>([]);
    const [allPredictions, setAllPredictions] = useState<Prediction[]>([]);

    // Load predictions from localStorage
    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const all: Prediction[] = JSON.parse(stored);
                setAllPredictions(all);
            }
        } catch {
            // corrupted storage, start fresh
        }
    }, []);

    // Filter to current wallet's predictions
    useEffect(() => {
        if (walletAddress) {
            setPredictions(
                allPredictions
                    .filter((p) => p.walletAddress === walletAddress)
                    .sort((a, b) => b.createdAt - a.createdAt),
            );
        } else {
            setPredictions([]);
        }
    }, [walletAddress, allPredictions]);

    // Save to localStorage whenever predictions change
    const saveAll = useCallback((updated: Prediction[]) => {
        setAllPredictions(updated);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        updateLeaderboard(updated);
    }, []);

    const hashPrediction = useCallback(
        async (asset: string, direction: string, entryPrice: number): Promise<{ hash: string; timestamp: number }> => {
            const now = Date.now();
            const hash = await sha256(`${walletAddress}:${asset}:${direction}:${entryPrice}:${now}`);
            return { hash, timestamp: now };
        },
        [walletAddress],
    );

    const createPrediction = useCallback(
        async (
            asset: string,
            direction: 'long' | 'short',
            deadlineMinutes: number,
            entryPrice: number,
            txId: string | null,
            hash: string,
            timestamp: number,
        ): Promise<Prediction> => {
            const prediction: Prediction = {
                id: hash.slice(0, 16),
                asset,
                direction,
                entryPrice,
                exitPrice: null,
                hash,
                createdAt: timestamp,
                resolvedAt: null,
                outcome: 'pending',
                txId,
                walletAddress,
                deadline: timestamp + deadlineMinutes * 60 * 1000,
            };

            const updated = [...allPredictions, prediction];
            saveAll(updated);
            return prediction;
        },
        [walletAddress, allPredictions, saveAll],
    );

    const autoResolve = useCallback((prices: Map<string, number>) => {
        const now = Date.now();
        let changed = false;
        const updated = allPredictions.map((p) => {
            if (p.outcome !== 'pending' || p.deadline > now) return p;
            const currentPrice = prices.get(p.asset);
            if (currentPrice == null) return p;

            const isCorrect = p.direction === 'long'
                ? currentPrice > p.entryPrice
                : currentPrice < p.entryPrice;

            changed = true;
            return {
                ...p,
                outcome: (isCorrect ? 'correct' : 'wrong') as PredictionOutcome,
                exitPrice: currentPrice,
                resolvedAt: now,
            };
        });
        if (changed) saveAll(updated);
    }, [allPredictions, saveAll]);

    // Calculate user stats
    const stats: UserStats = (() => {
        const mine = predictions;
        const correct = mine.filter((p) => p.outcome === 'correct').length;
        const wrong = mine.filter((p) => p.outcome === 'wrong').length;
        const pending = mine.filter((p) => p.outcome === 'pending').length;
        const resolved = correct + wrong;

        // Calculate streak
        let streak = 0;
        let bestStreak = 0;
        let currentStreak = 0;
        const resolved_sorted = mine
            .filter((p) => p.outcome === 'correct' || p.outcome === 'wrong')
            .sort((a, b) => b.createdAt - a.createdAt);

        for (const p of resolved_sorted) {
            if (p.outcome === 'correct') {
                currentStreak++;
                if (currentStreak > bestStreak) bestStreak = currentStreak;
            } else {
                break;
            }
        }
        streak = currentStreak;

        // Recalculate best streak over all history
        currentStreak = 0;
        for (const p of [...resolved_sorted].reverse()) {
            if (p.outcome === 'correct') {
                currentStreak++;
                if (currentStreak > bestStreak) bestStreak = currentStreak;
            } else {
                currentStreak = 0;
            }
        }

        return {
            totalPredictions: mine.length,
            correct,
            wrong,
            pending,
            accuracy: resolved > 0 ? Math.round((correct / resolved) * 100) : 0,
            streak,
            bestStreak,
        };
    })();

    // Leaderboard
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

    useEffect(() => {
        try {
            const stored = localStorage.getItem(LEADERBOARD_KEY);
            if (stored) setLeaderboard(JSON.parse(stored));
        } catch { /* ignore */ }
    }, [allPredictions]);

    return {
        predictions,
        allPredictions,
        stats,
        leaderboard,
        hashPrediction,
        createPrediction,
        autoResolve,
    };
}

function updateLeaderboard(allPredictions: Prediction[]) {
    const byAddress = new Map<string, Prediction[]>();

    for (const p of allPredictions) {
        const existing = byAddress.get(p.walletAddress) || [];
        existing.push(p);
        byAddress.set(p.walletAddress, existing);
    }

    const entries: LeaderboardEntry[] = [];

    for (const [address, preds] of byAddress) {
        const correct = preds.filter((p) => p.outcome === 'correct').length;
        const wrong = preds.filter((p) => p.outcome === 'wrong').length;
        const resolved = correct + wrong;
        const accuracy = resolved > 0 ? Math.round((correct / resolved) * 100) : 0;

        let streak = 0;
        const sorted = preds
            .filter((p) => p.outcome === 'correct' || p.outcome === 'wrong')
            .sort((a, b) => b.createdAt - a.createdAt);
        for (const p of sorted) {
            if (p.outcome === 'correct') streak++;
            else break;
        }

        entries.push({
            address,
            total: preds.length,
            correct,
            accuracy,
            streak,
            lastActive: Math.max(...preds.map((p) => p.createdAt)),
        });
    }

    entries.sort((a, b) => {
        if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
        if (b.correct !== a.correct) return b.correct - a.correct;
        return b.streak - a.streak;
    });

    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(entries.slice(0, 100)));
}
