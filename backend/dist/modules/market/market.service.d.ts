export declare function getCandles(symbol: string, timeframe?: string, limit?: number, exchange?: string): Promise<any>;
export declare function getLivePrice(symbol: string, exchange?: string): Promise<{
    price: number;
    source: string;
} | null>;
