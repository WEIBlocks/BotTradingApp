/**
 * Trainer Agent Service
 *
 * Sits "on top" of the bot engine and continuously monitors performance.
 * When triggered, uses Claude to analyze trade history and generate
 * an improved bot prompt + config, then shadow-validates before promoting.
 *
 * Feature 2: Trainer on top of bot
 * Feature 4: Auto training and strategy fixing, automated
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
}
export interface TrainerInsight {
    ts: string;
    type: 'info' | 'warning' | 'improvement' | 'retrain';
    message: string;
    action?: string;
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
}
export declare const DEFAULT_TRAINER_CONFIG: TrainerConfig;
export declare function analyzeBotPerformance(botId: string): Promise<BotPerformanceSnapshot>;
export declare function runTrainerAgent(botId: string): Promise<{
    improvedPrompt: string;
    configChanges: Record<string, any>;
    insights: string[];
    diagnosis: string;
    expectedImpact: string;
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
}>;
export declare function runAutoTrainerCheck(botId: string): Promise<void>;
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
