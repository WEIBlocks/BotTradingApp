/** Returns which modes (live / testnet) the user has connected exchanges for. */
export declare function getConnectedModes(userId: string): Promise<{
    hasLive: boolean;
    hasTestnet: boolean;
}>;
export declare function getSummary(userId: string, mode?: 'live' | 'testnet'): Promise<{
    totalValue: string;
    change24h: string;
    change24hPercent: string;
    totalRealizedPnl: string;
    closedPositions: number;
    openPositions: number;
}>;
export declare function getAssets(userId: string, mode?: 'live' | 'testnet'): Promise<{
    id: string;
    symbol: string;
    name: string | null;
    amount: string;
    valueUsd: string | null;
    change24h: string | null;
    allocation: string | null;
    iconColor: string | null;
    provider: string;
    sandbox: boolean | null;
}[]>;
export declare function getEquityHistory(userId: string, days?: number, granularity?: 'hourly' | 'daily'): Promise<{
    equityData: number[];
    dates: Date[];
    detailed: {
        date: Date;
        value: number;
        change: number;
        changePercent: number;
    }[];
    shadowEquityData: number[];
    shadowDates: (string | Date)[];
    days: number;
    isRealData: boolean;
}>;
export declare function getAllocation(userId: string, mode?: 'live' | 'testnet'): Promise<{
    symbol: string;
    name: string | null;
    amount: number;
    value: string;
    percentage: string;
    iconColor: string | null;
}[]>;
/**
 * Get total P&L breakdown by bot
 */
export declare function getPnlByBot(userId: string): Promise<Record<string, unknown>[]>;
