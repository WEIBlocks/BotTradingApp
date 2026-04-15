interface AssetRanking {
    symbol: string;
    name: string;
    price: number;
    change24h: number;
    volume24h: number;
    volumeScore: number;
    momentumScore: number;
    overallScore: number;
}
interface StockQuote {
    symbol: string;
    price: number;
    change: number;
    changePercent: number;
    volume: number;
    high: number;
    low: number;
    open: number;
    previousClose: number;
    timestamp: string;
}
export declare function getStockQuotes(symbols: string[]): Promise<StockQuote[]>;
export declare function getStockQuote(symbol: string): Promise<StockQuote | null>;
export declare function extractStockTickers(message: string): string[];
export declare function extractCryptoPairs(message: string): string[];
export declare function extractStockSymbols(message: string): string[];
export declare function getTopAssets(limit?: number, _type?: 'crypto' | 'all'): Promise<AssetRanking[]>;
export interface DexToken {
    symbol: string;
    name: string;
    price: number;
    change24h: number;
    volume24h: number;
    liquidity: number;
    marketCap: number;
    chain: string;
    dexName: string;
    pairAddress: string;
    baseAddress: string;
    priceUsd: string;
    txns24h: {
        buys: number;
        sells: number;
    };
}
/**
 * Search DexScreener for a token by symbol or name.
 * Returns the top matching pairs sorted by liquidity (most liquid = most reliable price).
 */
export declare function searchDexScreener(query: string): Promise<DexToken[]>;
/**
 * Get best DexScreener price for a token (most liquid pair).
 */
export declare function getDexPrice(symbolOrName: string): Promise<DexToken | null>;
export interface ResolvedPrice {
    symbol: string;
    name?: string;
    price: number;
    change24h: number;
    volume24h?: number;
    liquidity?: number;
    marketCap?: number;
    chain?: string;
    source: 'binance' | 'dexscreener';
}
/**
 * Try Binance/KuCoin first (fast, reliable for top coins).
 * If not listed, fall back to DexScreener (covers all DEX tokens).
 * Results cached 30s to reduce API calls.
 */
export declare function resolveTokenPrice(symbol: string): Promise<ResolvedPrice | null>;
export declare function getPrice(symbol: string): Promise<{
    price: number;
    change24h: number;
} | null>;
export declare function getMarketOverview(): Promise<{
    totalMarketCap: string;
    btcDominance: string;
    topGainers: AssetRanking[];
    topLosers: AssetRanking[];
    topVolume: AssetRanking[];
}>;
export {};
