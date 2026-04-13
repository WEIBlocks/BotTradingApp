export declare function startPortfolioUpdateJob(): Promise<void>;
/**
 * Trigger immediate portfolio refresh for a specific user (called after every live trade).
 * Fetches real balances, saves snapshot, then publishes a portfolio_update event to Redis
 * so the /ws/app WebSocket can push it to the mobile client instantly.
 */
export declare function refreshUserPortfolio(userId: string): Promise<void>;
