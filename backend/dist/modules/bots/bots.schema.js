import { z } from 'zod';
export const botIdParamsSchema = z.object({
    id: z.string().min(1),
});
export const createBotBodySchema = z.object({
    name: z.string().min(1),
    strategy: z.string().min(1),
    category: z.string().optional(),
    risk_level: z.string().optional(),
    pairs: z.array(z.string()).optional(),
    stopLoss: z.number().optional(),
    takeProfit: z.number().optional(),
    maxPositionSize: z.number().optional(),
    tradingMode: z.string().optional(),
    tradeDirection: z.enum(['buy', 'sell', 'both']).optional().default('both'),
    dailyLossLimit: z.number().min(0).max(100).optional(),
    orderType: z.enum(['market', 'limit']).optional().default('market'),
    creatorFeePercent: z.number().min(0).max(50).optional(),
    prompt: z.string().max(5000).optional(),
    tradingFrequency: z.enum(['conservative', 'balanced', 'aggressive', 'max']).optional(),
    maxHoldsBeforeAI: z.number().int().min(1).max(10).optional(),
    aiConfidenceThreshold: z.number().min(50).max(90).optional(),
    aiMode: z.enum(['rules_only', 'hybrid', 'full_ai']).optional(),
    customEntryConditions: z.array(z.object({
        indicator: z.string(),
        operator: z.enum(['<', '>', '<=', '>=', 'crosses_above', 'crosses_below']),
        value: z.number(),
        weight: z.number().min(0).max(1),
    })).max(5).optional(),
    customExitConditions: z.array(z.object({
        indicator: z.string(),
        operator: z.enum(['<', '>', '<=', '>=', 'crosses_above', 'crosses_below']),
        value: z.number(),
        weight: z.number().min(0).max(1),
    })).max(5).optional(),
    maxOpenPositions: z.number().int().min(1).max(5).optional(),
    tradingSchedule: z.enum(['24_7', 'us_hours', 'custom']).optional(),
});
export const updateBotBodySchema = z.object({
    name: z.string().min(1).optional(),
    strategy: z.string().min(1).optional(),
    category: z.string().optional(),
    risk_level: z.string().optional(),
    pairs: z.array(z.string()).optional(),
    stopLoss: z.number().optional(),
    takeProfit: z.number().optional(),
    maxPositionSize: z.number().optional(),
    tradeDirection: z.enum(['buy', 'sell', 'both']).optional(),
    dailyLossLimit: z.number().min(0).max(100).optional(),
    orderType: z.enum(['market', 'limit']).optional(),
    creatorFeePercent: z.number().min(0).max(50).optional(),
    prompt: z.string().max(5000).optional(),
    tradingFrequency: z.enum(['conservative', 'balanced', 'aggressive', 'max']).optional(),
    maxHoldsBeforeAI: z.number().int().min(1).max(10).optional(),
    aiConfidenceThreshold: z.number().min(50).max(90).optional(),
    aiMode: z.enum(['rules_only', 'hybrid', 'full_ai']).optional(),
    customEntryConditions: z.array(z.object({
        indicator: z.string(),
        operator: z.enum(['<', '>', '<=', '>=', 'crosses_above', 'crosses_below']),
        value: z.number(),
        weight: z.number().min(0).max(1),
    })).max(5).optional(),
    customExitConditions: z.array(z.object({
        indicator: z.string(),
        operator: z.enum(['<', '>', '<=', '>=', 'crosses_above', 'crosses_below']),
        value: z.number(),
        weight: z.number().min(0).max(1),
    })).max(5).optional(),
    maxOpenPositions: z.number().int().min(1).max(5).optional(),
    tradingSchedule: z.enum(['24_7', 'us_hours', 'custom']).optional(),
});
export const purchaseBotBodySchema = z.object({
    mode: z.enum(['live', 'paper']).default('live'),
    allocatedAmount: z.number().positive().optional(),
});
export const shadowModeBodySchema = z.object({
    virtualBalance: z.number().positive(),
    durationDays: z.number().int().min(0).optional(),
    durationMinutes: z.number().int().positive().optional(),
    enableRiskLimits: z.boolean().optional(),
    enableRealisticFees: z.boolean().optional(),
}).refine(data => (data.durationDays && data.durationDays > 0) || (data.durationMinutes && data.durationMinutes > 0), {
    message: 'Either durationDays or durationMinutes must be provided',
});
export const reviewBodySchema = z.object({
    rating: z.number().int().min(1).max(5),
    text: z.string().min(1),
});
export const backtestBodySchema = z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    initialBalance: z.number().optional(),
});
export const paperTradingSetupBodySchema = z.object({
    initialFunds: z.number().positive().optional(),
});
export const dataResponseSchema = z.object({
    data: z.any(),
});
export const updateUserConfigBodySchema = z.object({
    riskMultiplier: z.union([z.literal(0.5), z.literal(1), z.literal(1.5), z.literal(2)]).optional(),
    maxDailyLoss: z.number().min(0).max(100).optional(),
    autoStopBalance: z.number().min(0).optional(),
    autoStopDays: z.number().int().min(1).optional(),
    autoStopLossPercent: z.number().min(0).max(100).optional(),
    compoundProfits: z.boolean().optional(),
    notificationLevel: z.enum(['all', 'wins_only', 'losses_only', 'summary']).optional(),
});
export const subscriptionIdParamsSchema = z.object({
    subscriptionId: z.string().uuid(),
});
