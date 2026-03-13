/**
 * Pyth Oracle — Fetch real-time crypto prices via Hermes REST API.
 * No SDK needed — pure HTTP calls to Pyth's public Hermes endpoint.
 */

const HERMES_URL = 'https://hermes.pyth.network';

// Pyth price feed IDs (mainnet stable IDs)
export const PRICE_FEEDS: Record<string, { id: string; label: string; icon: string }> = {
    BTC: {
        id: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
        label: 'BTC/USD',
        icon: '₿',
    },
    ETH: {
        id: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
        label: 'ETH/USD',
        icon: 'Ξ',
    },
    SOL: {
        id: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
        label: 'SOL/USD',
        icon: '◎',
    },
    OP: {
        id: '0x385f64d993f7b77d8182ed5003d97c60aa3361f3cecfe711544d2d59165e9bdf',
        label: 'OP/USD',
        icon: '🔴',
    },
    DOGE: {
        id: '0xdcef50dd0a4cd2dcc17e45df1676dcb336a11a61c69df7a0299b0150c672d25c',
        label: 'DOGE/USD',
        icon: '🐕',
    },
    PEPE: {
        id: '0xd69731a2e74ac1ce884fc3890f7ee324b6deb66147055249568869ed700882e4',
        label: 'PEPE/USD',
        icon: '🐸',
    },
};

export const SUPPORTED_ASSETS = Object.keys(PRICE_FEEDS);

export interface PythPrice {
    asset: string;
    price: number;
    confidence: number;
    timestamp: number;
}

/**
 * Fetch the latest price for an asset from Pyth Hermes.
 */
export async function fetchPrice(asset: string): Promise<PythPrice> {
    const feed = PRICE_FEEDS[asset];
    if (!feed) throw new Error(`Unknown asset: ${asset}`);

    const url = `${HERMES_URL}/v2/updates/price/latest?ids[]=${feed.id}&parsed=true`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Pyth API error: ${res.status}`);

    const data = await res.json();
    const parsed = data.parsed?.[0];
    if (!parsed) throw new Error('No price data returned');

    const priceData = parsed.price;
    const price = Number(priceData.price) * Math.pow(10, priceData.expo);
    const confidence = Number(priceData.conf) * Math.pow(10, priceData.expo);

    return {
        asset,
        price,
        confidence,
        timestamp: parsed.price.publish_time * 1000,
    };
}

/**
 * Fetch prices for multiple assets in one call.
 */
export async function fetchPrices(assets: string[]): Promise<Map<string, PythPrice>> {
    const ids = assets
        .map((a) => PRICE_FEEDS[a]?.id)
        .filter(Boolean);

    if (ids.length === 0) return new Map();

    const params = ids.map((id) => `ids[]=${id}`).join('&');
    const url = `${HERMES_URL}/v2/updates/price/latest?${params}&parsed=true`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Pyth API error: ${res.status}`);

    const data = await res.json();
    const result = new Map<string, PythPrice>();

    for (const parsed of data.parsed || []) {
        const feedId = '0x' + parsed.id;
        const asset = assets.find((a) => PRICE_FEEDS[a]?.id === feedId);
        if (!asset) continue;

        const priceData = parsed.price;
        const price = Number(priceData.price) * Math.pow(10, priceData.expo);
        const confidence = Number(priceData.conf) * Math.pow(10, priceData.expo);

        result.set(asset, {
            asset,
            price,
            confidence,
            timestamp: priceData.publish_time * 1000,
        });
    }

    return result;
}

/**
 * Format price for display.
 */
export function formatPrice(price: number, asset: string): string {
    if (asset === 'PEPE' || asset === 'DOGE') {
        return '$' + price.toFixed(6);
    }
    if (price < 1) return '$' + price.toFixed(4);
    if (price < 100) return '$' + price.toFixed(2);
    return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
