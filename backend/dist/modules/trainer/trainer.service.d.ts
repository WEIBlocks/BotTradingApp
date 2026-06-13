/**
 * Intelligent Trainer Agent Service
 *
 * A proper agentic AI trainer with:
 * - Full trade history fed via chunked RAG-style passes (no 30-trade limit)
 * - Planning loop: observe → diagnose → decide → act
 * - Adaptive decisions: knows when to change vs when to leave alone
 * - Live market context (price, regime, volatility)
 * - Dynamic SL/TP trailing when bot is profitable
 * - Human-readable timestamped insight logs
 * - Trainer memory: remembers past decisions + outcomes
 * - Retry/loop until confident or exhausted
 */
export interface TrainerConfig {
    trainingMode: 'auto' | 'suggestions' | 'off';
    autoRetrain: boolean;
    retrainMode: 'time' | 'performance' | 'combined';
    retrainIntervalDays: number;
    profitFactorFloor: number;
    winRateDropThreshold: number;
    consecutiveLossLimit: number;
    shadowValidationHours: number;
    lastRetrainAt: string | null;
    trainerScore: number | null;
    trainerStatus: 'idle' | 'monitoring' | 'retraining' | 'shadow_validating';
    pendingPrompt: string | null;
    pendingConfig: Record<string, any> | null;
    lastInsightAt: string | null;
    insights: TrainerInsight[];
    trainerMemory?: TrainerMemoryEntry[];
}
export interface TrainerInsight {
    ts: string;
    type: 'info' | 'warning' | 'improvement' | 'retrain' | 'decision' | 'market';
    message: string;
    action?: string;
    decision?: 'changed' | 'kept' | 'adjusted' | 'skipped';
    changedFields?: string[];
    beforeValues?: Record<string, any>;
    afterValues?: Record<string, any>;
}
export interface TrainerMemoryEntry {
    ts: string;
    cycleNumber: number;
    decision: 'changed' | 'kept' | 'adjusted' | 'skipped';
    diagnosis: string;
    changesSummary: string;
    perfSnapshot: {
        totalTrades: number;
        winRate: number;
        profitFactor: number;
        trainerScore: number;
        consecutiveLosses: number;
    };
    outcome?: 'improved' | 'declined' | 'stable' | 'pending';
    outcomeMeasuredAt?: string;
}
export interface BotPerformanceSnapshot {
    botId: string;
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    profitFactor: number;
    avgWinPct: number;
    avgLossPct: number;
    maxDrawdown: number;
    consecutiveLosses: number;
    recentWinRate: number;
    sharpeEstimate: number;
    trainerScore: number;
    needsRetrain: boolean;
    retrainReason: string | null;
    trendDirection: 'improving' | 'declining' | 'stable';
    recentPnlTrend: number;
    profitStreak: number;
}
export declare const DEFAULT_TRAINER_CONFIG: TrainerConfig;
export declare function analyzeBotPerformance(botId: string): Promise<BotPerformanceSnapshot>;
export declare function runTrainerAgent(botId: string): Promise<{
    decision: 'changed' | 'adjusted' | 'kept' | 'skipped';
    improvedPrompt: string | null;
    configChanges: Record<string, any>;
    insights: string[];
    diagnosis: string;
    reasoning: string;
    expectedImpact: string;
    changesSummary: string;
    confidence: number;
} | null>;
export declare function getTrainerStatus(botId: string, callerId?: string): Promise<{
    config: TrainerConfig;
    performance: BotPerformanceSnapshot;
    redisStatus: string | null;
    isCreator: boolean;
}>;
export declare function updateTrainerConfig(botId: string, userId: string, updates: Partial<TrainerConfig>): Promise<TrainerConfig>;
export declare function triggerRetrain(botId: string, userId: string): Promise<{
    success: boolean;
    message: string;
    trainerResult?: Awaited<ReturnType<typeof runTrainerAgent>>;
}>;
export declare function promotePendingChanges(botId: string, userId: string): Promise<{
    success: boolean;
    message: string;
    newPrompt?: string;
}>;
export declare function runAutoTrainerCheck(botId: string): Promise<{
    fired: boolean;
}>;
export declare function getAllTrainerStatuses(): Promise<Array<{
    botId: string;
    botName: string;
    trainerScore: number | null;
    trainerStatus: string;
    lastRetrainAt: string | null;
    totalTrades: number;
    winRate: number;
    needsAttention: boolean;
}>>;
