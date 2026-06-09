export declare function getPrice(symbol: string): Promise<{
    price: number;
    change24h: number;
    volume: number;
    high24h: number;
    low24h: number;
    timestamp: number;
} | null>;
/** Check if US stock market is currently open */
export declare function isUSMarketOpen(): Promise<boolean>;
/**
 * Returns real historical close prices for a symbol (up to `count` values),
 * newest-last (oldest→newest order for indicator computation).
 * Called by bot-engine's seedPriceHistoryFromReal().
 */
export declare function getPriceHistory(symbol: string, count?: number): Promise<number[] | null>;
export declare function startPriceSyncJob(): Promise<void>;
