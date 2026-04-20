export declare function getRecentTrades(userId: string, limit?: number): Promise<any[]>;
interface TradeHistoryFilters {
    symbol?: string;
    side?: string;
    is_paper?: string;
    mode?: string;
    botId?: string;
    page: number;
    limit: number;
}
export declare function getTradeHistory(userId: string, filters: TradeHistoryFilters): Promise<{
    data: any[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    };
}>;
/** Per-mode summary stats — totalPnl, totalTrades, winRate for each mode separately */
export declare function getTradeSummary(userId: string): Promise<{
    live: {
        totalPnl: number;
        totalTrades: number;
        winRate: number;
    };
    shadow: {
        totalPnl: number;
        totalTrades: number;
        winRate: number;
    };
    arena: {
        totalPnl: number;
        totalTrades: number;
        winRate: number;
    };
    all: {
        totalPnl: number;
        totalTrades: number;
        winRate: number;
    };
}>;
export {};
