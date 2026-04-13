/**
 * Bot Trading Engine — Hybrid AI Decision System v2
 *
 * Fixes in v2:
 * - Positions persisted to DB (survive restarts)
 * - P&L calculated from actual position close (not regex)
 * - Paper mode removed (only shadow + live)
 * - HOLD decisions NOT stored (only BUY/SELL logged)
 * - Redis publish errors logged properly
 * - Rate limiting on AI calls per bot
 * - Risk level impacts rule aggressiveness
 * - RAG training data injected into decisions
 * - Bot learns from past decision outcomes
 * - Concurrent trade protection via Redis locks
 * - Live subscription expiry enforcement
 * - DCA/Grid strategies bypass AI (pure rule execution)
 */
export interface TradingRules {
    entryConditions: RuleCondition[];
    exitConditions: RuleCondition[];
    stopLossPercent: number;
    takeProfitPercent: number;
    maxPositionPercent: number;
    cooldownMinutes: number;
}
export interface RuleCondition {
    indicator: string;
    operator: '<' | '>' | '<=' | '>=' | 'crosses_above' | 'crosses_below';
    value: number;
    weight: number;
}
export interface EngineDecision {
    action: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    reasoning: string;
    indicators: Record<string, number | string | null>;
    aiCalled: boolean;
    tokensCost: number;
    price: number;
    symbol: string;
    sizePercent?: number;
    pnl?: number;
    pnlPercent?: number;
}
export declare function generateRules(botPrompt: string, strategy: string, riskLevel: string, stopLoss?: number, takeProfit?: number, maxPosition?: number): Promise<TradingRules>;
export declare function processSymbol(opts: {
    sessionKey: string;
    symbol: string;
    botId: string;
    userId: string;
    botPrompt: string;
    strategy: string;
    riskLevel: string;
    balance: number;
    stopLoss?: number;
    takeProfit?: number;
    maxPositionPct?: number;
    tradeDirection?: 'buy' | 'sell' | 'both';
    dailyLossLimit?: number;
    orderType?: 'market' | 'limit';
    mode: 'paper' | 'live';
    exchangeConnId?: string;
    subscriptionId?: string;
    shadowSessionId?: string;
    aiMode?: 'rules_only' | 'hybrid' | 'full_ai';
    aiConfidenceThreshold?: number;
    maxHoldsBeforeAI?: number;
    tradingFrequency?: 'conservative' | 'balanced' | 'aggressive' | 'max';
    customEntryConditions?: RuleCondition[];
    customExitConditions?: RuleCondition[];
    maxOpenPositions?: number;
    riskMultiplier?: number;
}): Promise<EngineDecision>;
export declare function executeLiveTrade(decision: EngineDecision, userId: string, botId: string, subscriptionId: string, exchangeConnId: string, orderType?: 'market' | 'limit'): Promise<{
    success: boolean;
    orderId?: string;
    error?: string;
}>;
export declare function rollbackPosition(botId: string, symbol: string, userId: string, subscriptionId?: string): Promise<boolean>;
export declare function invalidateRulesCache(botId: string): void;
export declare function summarizeSessionLearnings(botId: string): Promise<string>;
