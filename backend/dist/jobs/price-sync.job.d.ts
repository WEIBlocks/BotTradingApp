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
export declare function startPriceSyncJob(): Promise<void>;
