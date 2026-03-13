/**
 * Hash utility — SHA-256 hashing for prediction commitments.
 * Uses the Web Crypto API (browser-native, no external deps).
 */

export async function sha256(message: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function truncateAddress(addr: string): string {
    if (!addr || addr.length < 16) return addr;
    return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

export function formatSats(sats: bigint | number): string {
    const n = typeof sats === 'bigint' ? Number(sats) : sats;
    return (n / 1e8).toFixed(4) + ' BTC';
}

export function timeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

export function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}
