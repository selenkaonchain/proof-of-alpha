import { useState, useCallback, useEffect } from 'react';
import { useBlockchain } from './hooks/useBlockchain';
import { usePredictions, type Prediction, type PredictionOutcome } from './hooks/usePredictions';
import { truncateAddress, timeAgo, formatDate } from './utils/helpers';
import { PRICE_FEEDS, SUPPORTED_ASSETS, fetchPrice, fetchPrices, formatPrice } from './utils/pyth';

type Tab = 'predict' | 'history' | 'leaderboard';
type Filter = 'all' | 'pending' | 'correct' | 'wrong';

const DEADLINE_OPTIONS = [
    { value: 5, label: '5m' },
    { value: 15, label: '15m' },
    { value: 30, label: '30m' },
    { value: 45, label: '45m' },
    { value: 60, label: '60m' },
    { value: 120, label: '2h' },
    { value: 240, label: '4h' },
];

const OPSCAN_TX_URL = 'https://opscan.org/transactions';

export default function App() {
    const bc = useBlockchain();
    const { predictions, stats, leaderboard, hashPrediction, createPrediction, autoResolve } =
        usePredictions(bc.walletAddress);

    const [tab, setTab] = useState<Tab>('predict');
    const [filter, setFilter] = useState<Filter>('all');
    const [selectedAsset, setSelectedAsset] = useState('BTC');
    const [direction, setDirection] = useState<'long' | 'short'>('long');
    const [deadline, setDeadline] = useState(30);
    const [submitting, setSubmitting] = useState(false);
    const [livePrice, setLivePrice] = useState<number | null>(null);
    const [priceLoading, setPriceLoading] = useState(false);

    const filteredPredictions =
        filter === 'all'
            ? predictions
            : predictions.filter((p) => p.outcome === filter);

    // Fetch live price when asset changes
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setPriceLoading(true);
            try {
                const data = await fetchPrice(selectedAsset);
                if (!cancelled) setLivePrice(data.price);
            } catch {
                if (!cancelled) setLivePrice(null);
            } finally {
                if (!cancelled) setPriceLoading(false);
            }
        };
        load();
        const interval = setInterval(load, 10000);
        return () => { cancelled = true; clearInterval(interval); };
    }, [selectedAsset]);

    // Auto-resolve expired predictions via Pyth oracle
    useEffect(() => {
        const check = async () => {
            const pending = predictions.filter((p) => p.outcome === 'pending' && p.deadline < Date.now());
            if (pending.length === 0) return;
            const assets = [...new Set(pending.map((p) => p.asset))];
            try {
                const prices = await fetchPrices(assets);
                const priceMap = new Map<string, number>();
                for (const [asset, data] of prices) {
                    priceMap.set(asset, data.price);
                }
                autoResolve(priceMap);
            } catch (err) {
                console.error('Auto-resolve failed:', err);
            }
        };
        check();
        const interval = setInterval(check, 15000);
        return () => clearInterval(interval);
    }, [predictions, autoResolve]);

    const handleSubmit = useCallback(async () => {
        if (!livePrice || submitting || !bc.connected) return;
        setSubmitting(true);
        try {
            const entryPrice = livePrice;
            const { hash, timestamp } = await hashPrediction(selectedAsset, direction, entryPrice);
            const deadlineMs = timestamp + deadline * 60 * 1000;

            const txId = await bc.commitPrediction(hash, deadlineMs);
            if (!txId) return;

            await createPrediction(selectedAsset, direction, deadline, entryPrice, txId, hash, timestamp);
            setTab('history');
        } catch (err) {
            console.error('Submit failed:', err);
        } finally {
            setSubmitting(false);
        }
    }, [selectedAsset, direction, deadline, livePrice, submitting, bc, hashPrediction, createPrediction]);

    const sharePrediction = useCallback((prediction: Prediction) => {
        const feed = PRICE_FEEDS[prediction.asset];
        const dirEmoji = prediction.direction === 'long' ? '📈' : '📉';
        const outcomeEmoji = prediction.outcome === 'correct' ? '✅' : prediction.outcome === 'wrong' ? '❌' : '⏳';
        const priceDelta = prediction.exitPrice
            ? ` → ${formatPrice(prediction.exitPrice, prediction.asset)}`
            : '';
        const text = encodeURIComponent(
            `${outcomeEmoji} ${dirEmoji} ${feed?.label || prediction.asset} ${prediction.direction.toUpperCase()}\n\nEntry: ${formatPrice(prediction.entryPrice, prediction.asset)}${priceDelta}\n\nHash: ${prediction.hash.slice(0, 12)}...\n\n🧠 Proof of Alpha — oracle-verified on Bitcoin L1\n#ProofOfAlpha #Bitcoin #OP_NET`,
        );
        window.open(`https://x.com/intent/tweet?text=${text}`, '_blank', 'noopener,noreferrer');
    }, []);

    // ── Landing (not connected) ──
    if (!bc.connected) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
                <header className="header">
                    <div className="header-logo">
                        <span className="brain">🧠</span>
                        <span>
                            Proof of <span className="accent">Alpha</span>
                        </span>
                    </div>
                    <button className="btn btn-accent" onClick={bc.connect}>
                        Connect Wallet
                    </button>
                </header>

                <div className="hero">
                    <div className="hero-brain">🧠</div>
                    <h1>
                        Prove Your <span className="accent">Alpha</span>
                        <br />
                        On-Chain
                    </h1>
                    <p className="subtitle">
                        Timestamp trade predictions on Bitcoin L1 before they happen. Get it right, build your
                        reputation. All verified on-chain via OP_NET.
                    </p>

                    <div className="hero-features">
                        <div className="hero-feature">
                            <span className="icon">🔒</span>
                            Commit prediction hash
                        </div>
                        <div className="hero-feature">
                            <span className="icon">⛓️</span>
                            Timestamped on Bitcoin
                        </div>
                        <div className="hero-feature">
                            <span className="icon">🏆</span>
                            Build reputation
                        </div>
                        <div className="hero-feature">
                            <span className="icon">📊</span>
                            Climb the leaderboard
                        </div>
                    </div>

                    <div className="hero-cta">
                        <button className="btn btn-accent" onClick={bc.connect}>
                            🧠 Connect Wallet to Start
                        </button>
                        <a
                            className="btn btn-outline"
                            href="https://chromewebstore.google.com/detail/opwallet/pmbjpcmaaladnfpacpmhmnfmpklgbdjb?hl=en"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Get OPWallet →
                        </a>
                    </div>
                </div>

                <footer className="footer">
                    Built on{' '}
                    <a href="https://opnet.org" target="_blank" rel="noopener noreferrer">
                        OP_NET
                    </a>{' '}
                    · Bitcoin Layer 1 · Built with{' '}
                    <a href="https://ai.opnet.org" target="_blank" rel="noopener noreferrer">
                        BOB
                    </a>
                </footer>
            </div>
        );
    }

    // ── Main App (connected) ──
    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <header className="header">
                <div className="header-logo">
                    <span className="brain">🧠</span>
                    <span>
                        Proof of <span className="accent">Alpha</span>
                    </span>
                </div>
                <div className="header-wallet">
                    <div className="wallet-info">
                        <span className="balance">{bc.btcBalance} BTC</span>
                        <span className="pill-bal">{bc.tokenBalance} PILL</span>
                        <span className="address">{truncateAddress(bc.walletAddress)}</span>
                    </div>
                    <button className="btn btn-outline btn-sm" onClick={bc.disconnect}>
                        Disconnect
                    </button>
                </div>
            </header>

            {/* TX Status */}
            {bc.txStatus && (
                <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px 28px 0', width: '100%' }}>
                    <div className={`tx-status ${bc.txStatus.type}`}>
                        {bc.txStatus.type === 'pending' && '⏳'}
                        {bc.txStatus.type === 'success' && '✅'}
                        {bc.txStatus.type === 'error' && '❌'}
                        {bc.txStatus.message}
                    </div>
                </div>
            )}

            {/* Main Layout */}
            <div className="app-layout fade-in">
                {/* LEFT COLUMN */}
                <div>
                    {/* Tabs */}
                    <div className="tabs">
                        <button
                            className={`tab ${tab === 'predict' ? 'active' : ''}`}
                            onClick={() => setTab('predict')}
                        >
                            🧠 Predict
                        </button>
                        <button
                            className={`tab ${tab === 'history' ? 'active' : ''}`}
                            onClick={() => setTab('history')}
                        >
                            📜 History ({predictions.length})
                        </button>
                        <button
                            className={`tab ${tab === 'leaderboard' ? 'active' : ''}`}
                            onClick={() => setTab('leaderboard')}
                        >
                            🏆 Leaderboard
                        </button>
                    </div>

                    {/* ── PREDICT TAB ── */}
                    {tab === 'predict' && (
                        <div className="card">
                            <div className="card-title">
                                <span className="icon">🔮</span>
                                Make a Prediction
                            </div>
                            <div className="predict-form">
                                {/* Asset Selection */}
                                <div className="asset-selector">
                                    {SUPPORTED_ASSETS.map((asset) => (
                                        <button
                                            key={asset}
                                            className={`asset-chip ${selectedAsset === asset ? 'active' : ''}`}
                                            onClick={() => setSelectedAsset(asset)}
                                            disabled={submitting}
                                        >
                                            {PRICE_FEEDS[asset].icon} {asset}
                                        </button>
                                    ))}
                                </div>

                                {/* Live Price */}
                                <div className="live-price">
                                    <span className="live-dot" />
                                    <span className="live-label">Pyth Oracle</span>
                                    <span className="live-value">
                                        {priceLoading
                                            ? '...'
                                            : livePrice
                                                ? formatPrice(livePrice, selectedAsset)
                                                : 'N/A'}
                                    </span>
                                </div>

                                {/* Direction */}
                                <div className="direction-selector">
                                    <button
                                        className={`direction-btn long ${direction === 'long' ? 'active' : ''}`}
                                        onClick={() => setDirection('long')}
                                        disabled={submitting}
                                    >
                                        📈 LONG
                                    </button>
                                    <button
                                        className={`direction-btn short ${direction === 'short' ? 'active' : ''}`}
                                        onClick={() => setDirection('short')}
                                        disabled={submitting}
                                    >
                                        📉 SHORT
                                    </button>
                                </div>

                                {/* Deadline */}
                                <div className="deadline-selector">
                                    {DEADLINE_OPTIONS.map((opt) => (
                                        <button
                                            key={opt.value}
                                            className={`deadline-chip ${deadline === opt.value ? 'active' : ''}`}
                                            onClick={() => setDeadline(opt.value)}
                                            disabled={submitting}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>

                                <button
                                    className="btn btn-accent"
                                    onClick={handleSubmit}
                                    disabled={!livePrice || submitting || bc.loading}
                                    style={{ width: '100%', padding: '14px' }}
                                >
                                    {submitting
                                        ? '⏳ Committing on-chain...'
                                        : `🧠 ${direction === 'long' ? '📈' : '📉'} Commit ${PRICE_FEEDS[selectedAsset].label} ${direction.toUpperCase()}`}
                                </button>
                            </div>

                            <div
                                style={{
                                    marginTop: 20,
                                    padding: 16,
                                    background: 'var(--bg3)',
                                    borderRadius: 'var(--radius-sm)',
                                    fontSize: 13,
                                    color: 'var(--text2)',
                                    lineHeight: 1.7,
                                }}
                            >
                                <strong style={{ color: 'var(--text)' }}>How it works:</strong>
                                <br />
                                1. Pick asset & direction (LONG/SHORT)
                                <br />
                                2. Entry price from Pyth oracle → SHA-256 hash committed on Bitcoin L1
                                <br />
                                3. When deadline expires, Pyth oracle checks exit price automatically
                                <br />
                                4. Correct calls boost your rank 🏆
                            </div>
                        </div>
                    )}

                    {/* ── HISTORY TAB ── */}
                    {tab === 'history' && (
                        <div className="card">
                            <div className="card-title">
                                <span className="icon">📜</span>
                                Your Predictions
                            </div>

                            <div className="filter-row">
                                {(['all', 'pending', 'correct', 'wrong'] as Filter[]).map(
                                    (f) => (
                                        <button
                                            key={f}
                                            className={`filter-pill ${filter === f ? 'active' : ''}`}
                                            onClick={() => setFilter(f)}
                                        >
                                            {f === 'all' && `All (${predictions.length})`}
                                            {f === 'pending' &&
                                                `⏳ Pending (${predictions.filter((p) => p.outcome === 'pending').length})`}
                                            {f === 'correct' &&
                                                `✅ Correct (${predictions.filter((p) => p.outcome === 'correct').length})`}
                                            {f === 'wrong' &&
                                                `❌ Wrong (${predictions.filter((p) => p.outcome === 'wrong').length})`}
                                        </button>
                                    ),
                                )}
                            </div>

                            {filteredPredictions.length === 0 ? (
                                <div className="empty-state">
                                    <div className="icon">🔍</div>
                                    <p>No predictions yet. Make your first call!</p>
                                </div>
                            ) : (
                                <div className="prediction-list">
                                    {filteredPredictions.map((p) => (
                                        <PredictionCard
                                            key={p.id}
                                            prediction={p}
                                            onShare={sharePrediction}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── LEADERBOARD TAB ── */}
                    {tab === 'leaderboard' && (
                        <div className="card">
                            <div className="card-title">
                                <span className="icon">🏆</span>
                                Alpha Leaderboard
                            </div>

                            {leaderboard.length === 0 ? (
                                <div className="empty-state">
                                    <div className="icon">📊</div>
                                    <p>No predictions resolved yet. Be the first!</p>
                                </div>
                            ) : (
                                <table className="leaderboard-table">
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>Trader</th>
                                            <th>Calls</th>
                                            <th>Correct</th>
                                            <th>Accuracy</th>
                                            <th>Streak</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {leaderboard.map((entry, i) => (
                                            <tr
                                                key={entry.address}
                                                className={
                                                    entry.address === bc.walletAddress
                                                        ? 'leaderboard-you'
                                                        : ''
                                                }
                                            >
                                                <td>
                                                    <span
                                                        className={`leaderboard-rank ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}`}
                                                    >
                                                        {i + 1}
                                                    </span>
                                                </td>
                                                <td>
                                                    {truncateAddress(entry.address)}
                                                    {entry.address === bc.walletAddress && (
                                                        <span
                                                            style={{
                                                                marginLeft: 6,
                                                                fontSize: 10,
                                                                color: 'var(--accent)',
                                                            }}
                                                        >
                                                            YOU
                                                        </span>
                                                    )}
                                                </td>
                                                <td>{entry.total}</td>
                                                <td style={{ color: 'var(--green)' }}>
                                                    {entry.correct}
                                                </td>
                                                <td className="leaderboard-accuracy">
                                                    {entry.accuracy}%
                                                </td>
                                                <td>🔥 {entry.streak}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}
                </div>

                {/* RIGHT SIDEBAR */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Accuracy Ring */}
                    <div className="card" style={{ textAlign: 'center' }}>
                        <div className="card-title" style={{ justifyContent: 'center' }}>
                            <span className="icon">🎯</span>
                            Your Alpha Score
                        </div>
                        <div
                            className="accuracy-ring"
                            style={{
                                background: `conic-gradient(var(--green) ${stats.accuracy * 3.6}deg, var(--bg3) 0deg)`,
                            }}
                        >
                            <div
                                style={{
                                    width: 76,
                                    height: 76,
                                    borderRadius: '50%',
                                    background: 'var(--bg2)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexDirection: 'column',
                                }}
                            >
                                <span className="value">{stats.accuracy}</span>
                                <span className="pct">%</span>
                            </div>
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="card">
                        <div className="card-title">
                            <span className="icon">📊</span>
                            Stats
                        </div>
                        <div className="stats-grid">
                            <div className="stat-box">
                                <div className="stat-value accent">{stats.totalPredictions}</div>
                                <div className="stat-label">Total Calls</div>
                            </div>
                            <div className="stat-box">
                                <div className="stat-value green">{stats.correct}</div>
                                <div className="stat-label">Correct</div>
                            </div>
                            <div className="stat-box">
                                <div className="stat-value red">{stats.wrong}</div>
                                <div className="stat-label">Wrong</div>
                            </div>
                            <div className="stat-box">
                                <div className="stat-value blue">{stats.pending}</div>
                                <div className="stat-label">Pending</div>
                            </div>
                            <div className="stat-box">
                                <div className="stat-value purple">🔥 {stats.streak}</div>
                                <div className="stat-label">Streak</div>
                            </div>
                            <div className="stat-box">
                                <div className="stat-value" style={{ color: 'var(--yellow)' }}>
                                    ⭐ {stats.bestStreak}
                                </div>
                                <div className="stat-label">Best Streak</div>
                            </div>
                        </div>
                    </div>

                    {/* How It Works */}
                    <div className="card">
                        <div className="card-title">
                            <span className="icon">ℹ️</span>
                            How It Works
                        </div>
                        <div
                            style={{
                                fontSize: 13,
                                color: 'var(--text2)',
                                lineHeight: 1.8,
                            }}
                        >
                            <div style={{ marginBottom: 8 }}>
                                <strong style={{ color: 'var(--accent)' }}>1.</strong> Pick asset &
                                direction (LONG/SHORT)
                            </div>
                            <div style={{ marginBottom: 8 }}>
                                <strong style={{ color: 'var(--accent)' }}>2.</strong> Entry price
                                hashed & committed to Bitcoin via OP_NET
                            </div>
                            <div style={{ marginBottom: 8 }}>
                                <strong style={{ color: 'var(--accent)' }}>3.</strong> Pyth oracle
                                auto-verifies at deadline
                            </div>
                            <div>
                                <strong style={{ color: 'var(--accent)' }}>4.</strong> Correct
                                predictions boost your rank 🏆
                            </div>
                        </div>
                    </div>

                    {/* Contract Info */}
                    <div className="card">
                        <div className="card-title">
                            <span className="icon">⛓️</span>
                            Smart Contract
                        </div>
                        <div
                            style={{
                                fontSize: 11,
                                fontFamily: 'var(--mono)',
                                color: 'var(--text2)',
                                wordBreak: 'break-all',
                                lineHeight: 1.8,
                            }}
                        >
                            <div>
                                <span style={{ color: 'var(--text3)' }}>Network:</span>{' '}
                                <span style={{ color: 'var(--accent)' }}>OP_NET Testnet</span>
                            </div>
                            <div>
                                <span style={{ color: 'var(--text3)' }}>Contract:</span>{' '}
                                ProofOfAlpha
                            </div>
                            <div>
                                <span style={{ color: 'var(--text3)' }}>Functions:</span>{' '}
                                commitPrediction, revealPrediction
                            </div>
                            <div>
                                <span style={{ color: 'var(--text3)' }}>Storage:</span>{' '}
                                On-chain hash + stats
                            </div>
                            <div>
                                <span style={{ color: 'var(--text3)' }}>RPC:</span>{' '}
                                testnet.opnet.org
                            </div>
                            {bc.onChainStats && (
                                <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                                    <div style={{ color: 'var(--text)', fontWeight: 600, marginBottom: 4 }}>
                                        On-Chain Stats:
                                    </div>
                                    <div>
                                        <span style={{ color: 'var(--green)' }}>
                                            {bc.onChainStats.correct}
                                        </span>{' '}
                                        correct /{' '}
                                        <span style={{ color: 'var(--red)' }}>
                                            {bc.onChainStats.wrong}
                                        </span>{' '}
                                        wrong /{' '}
                                        <span style={{ color: 'var(--accent)' }}>
                                            🔥 {bc.onChainStats.streak}
                                        </span>{' '}
                                        streak
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <footer className="footer">
                Proof of Alpha · Built on{' '}
                <a href="https://opnet.org" target="_blank" rel="noopener noreferrer">
                    OP_NET
                </a>{' '}
                · Bitcoin Layer 1 · Built with{' '}
                <a href="https://ai.opnet.org" target="_blank" rel="noopener noreferrer">
                    BOB
                </a>
            </footer>
        </div>
    );
}

/* ─────────── Prediction Card Component ─────────── */

function PredictionCard({
    prediction,
    onShare,
}: {
    prediction: Prediction;
    onShare: (prediction: Prediction) => void;
}) {
    const remaining = prediction.deadline - Date.now();
    const feed = PRICE_FEEDS[prediction.asset];

    const formatCountdown = (ms: number): string => {
        if (ms <= 0) return 'Resolving...';
        const hours = Math.floor(ms / (1000 * 60 * 60));
        const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((ms % (1000 * 60)) / 1000);
        if (hours > 0) return `${hours}h ${minutes}m left`;
        if (minutes > 0) return `${minutes}m ${seconds}s left`;
        return `${seconds}s left`;
    };

    const priceDelta = prediction.exitPrice
        ? ((prediction.exitPrice - prediction.entryPrice) / prediction.entryPrice * 100)
        : null;

    const badgeClass: Record<PredictionOutcome, string> = {
        pending: 'badge-pending',
        correct: 'badge-correct',
        wrong: 'badge-wrong',
    };

    const badgeText: Record<PredictionOutcome, string> = {
        pending: '⏳ Pending',
        correct: '✅ Correct',
        wrong: '❌ Wrong',
    };

    return (
        <div className={`prediction-card outcome-${prediction.outcome}`}>
            <div className="prediction-header">
                <div className="prediction-asset-info">
                    <span className="asset-tag">{feed?.icon} {feed?.label || prediction.asset}</span>
                    <span className={`direction-tag ${prediction.direction}`}>
                        {prediction.direction === 'long' ? '📈 LONG' : '📉 SHORT'}
                    </span>
                </div>
                <span className={`prediction-badge ${badgeClass[prediction.outcome]}`}>
                    {badgeText[prediction.outcome]}
                </span>
            </div>

            <div className="prediction-prices">
                <span>Entry: <strong>{formatPrice(prediction.entryPrice, prediction.asset)}</strong></span>
                {prediction.exitPrice ? (
                    <span>
                        → Exit: <strong>{formatPrice(prediction.exitPrice, prediction.asset)}</strong>
                        <span className={`price-delta ${priceDelta && priceDelta >= 0 ? 'positive' : 'negative'}`}>
                            {priceDelta !== null ? ` (${priceDelta >= 0 ? '+' : ''}${priceDelta.toFixed(2)}%)` : ''}
                        </span>
                    </span>
                ) : prediction.outcome === 'pending' ? (
                    <span className={`countdown ${remaining <= 0 ? 'expired' : ''}`}>
                        ⏱ {formatCountdown(remaining)}
                    </span>
                ) : null}
            </div>

            <div className="prediction-meta">
                <span>{timeAgo(prediction.createdAt)}</span>
                <span>·</span>
                <span className="hash" title={prediction.hash}>
                    #{prediction.hash.slice(0, 10)}
                </span>
                {prediction.txId && (
                    <>
                        <span>·</span>
                        <a
                            className="tx-link"
                            href={`${OPSCAN_TX_URL}/${prediction.txId}?network=op_testnet`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={prediction.txId}
                        >
                            TX: {prediction.txId.slice(0, 8)}... ↗
                        </a>
                    </>
                )}
            </div>

            {/* Share for resolved predictions */}
            {(prediction.outcome === 'correct' || prediction.outcome === 'wrong') && (
                <div className="prediction-actions">
                    <button className="share-btn" onClick={() => onShare(prediction)}>
                        𝕏 Share on X
                    </button>
                    <span style={{ fontSize: 11, color: 'var(--text3)', alignSelf: 'center' }}>
                        {formatDate(prediction.resolvedAt || prediction.createdAt)}
                    </span>
                </div>
            )}
        </div>
    );
}
