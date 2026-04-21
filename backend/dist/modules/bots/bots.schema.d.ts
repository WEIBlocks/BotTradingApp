import { z } from 'zod';
export declare const botIdParamsSchema: z.ZodObject<{
    id: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
}, {
    id: string;
}>;
export declare const createBotBodySchema: z.ZodObject<{
    name: z.ZodString;
    strategy: z.ZodString;
    category: z.ZodOptional<z.ZodString>;
    risk_level: z.ZodOptional<z.ZodString>;
    pairs: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    stopLoss: z.ZodOptional<z.ZodNumber>;
    takeProfit: z.ZodOptional<z.ZodNumber>;
    maxPositionSize: z.ZodOptional<z.ZodNumber>;
    tradingMode: z.ZodOptional<z.ZodString>;
    tradeDirection: z.ZodDefault<z.ZodOptional<z.ZodEnum<["buy", "sell", "both"]>>>;
    dailyLossLimit: z.ZodOptional<z.ZodNumber>;
    orderType: z.ZodDefault<z.ZodOptional<z.ZodEnum<["market", "limit"]>>>;
    creatorFeePercent: z.ZodOptional<z.ZodNumber>;
    prompt: z.ZodOptional<z.ZodString>;
    tradingFrequency: z.ZodOptional<z.ZodEnum<["conservative", "balanced", "aggressive", "max"]>>;
    maxHoldsBeforeAI: z.ZodOptional<z.ZodNumber>;
    aiConfidenceThreshold: z.ZodOptional<z.ZodNumber>;
    aiMode: z.ZodOptional<z.ZodEnum<["rules_only", "hybrid", "full_ai"]>>;
    customEntryConditions: z.ZodOptional<z.ZodArray<z.ZodObject<{
        indicator: z.ZodString;
        operator: z.ZodEnum<["<", ">", "<=", ">=", "crosses_above", "crosses_below"]>;
        value: z.ZodNumber;
        weight: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        value: number;
        indicator: string;
        operator: "<" | ">" | "<=" | ">=" | "crosses_above" | "crosses_below";
        weight: number;
    }, {
        value: number;
        indicator: string;
        operator: "<" | ">" | "<=" | ">=" | "crosses_above" | "crosses_below";
        weight: number;
    }>, "many">>;
    customExitConditions: z.ZodOptional<z.ZodArray<z.ZodObject<{
        indicator: z.ZodString;
        operator: z.ZodEnum<["<", ">", "<=", ">=", "crosses_above", "crosses_below"]>;
        value: z.ZodNumber;
        weight: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        value: number;
        indicator: string;
        operator: "<" | ">" | "<=" | ">=" | "crosses_above" | "crosses_below";
        weight: number;
    }, {
        value: number;
        indicator: string;
        operator: "<" | ">" | "<=" | ">=" | "crosses_above" | "crosses_below";
        weight: number;
    }>, "many">>;
    maxOpenPositions: z.ZodOptional<z.ZodNumber>;
    tradingSchedule: z.ZodOptional<z.ZodEnum<["24_7", "us_hours", "custom"]>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    strategy: string;
    orderType: "limit" | "market";
    tradeDirection: "both" | "buy" | "sell";
    risk_level?: string | undefined;
    prompt?: string | undefined;
    category?: string | undefined;
    creatorFeePercent?: number | undefined;
    stopLoss?: number | undefined;
    takeProfit?: number | undefined;
    pairs?: string[] | undefined;
    maxPositionSize?: number | undefined;
    tradingFrequency?: "max" | "conservative" | "aggressive" | "balanced" | undefined;
    maxHoldsBeforeAI?: number | undefined;
    aiConfidenceThreshold?: number | undefined;
    aiMode?: "rules_only" | "hybrid" | "full_ai" | undefined;
    customEntryConditions?: {
        value: number;
        indicator: string;
        operator: "<" | ">" | "<=" | ">=" | "crosses_above" | "crosses_below";
        weight: number;
    }[] | undefined;
    customExitConditions?: {
        value: number;
        indicator: string;
        operator: "<" | ">" | "<=" | ">=" | "crosses_above" | "crosses_below";
        weight: number;
    }[] | undefined;
    maxOpenPositions?: number | undefined;
    tradingSchedule?: "custom" | "24_7" | "us_hours" | undefined;
    tradingMode?: string | undefined;
    dailyLossLimit?: number | undefined;
}, {
    name: string;
    strategy: string;
    risk_level?: string | undefined;
    prompt?: string | undefined;
    category?: string | undefined;
    creatorFeePercent?: number | undefined;
    stopLoss?: number | undefined;
    takeProfit?: number | undefined;
    orderType?: "limit" | "market" | undefined;
    pairs?: string[] | undefined;
    maxPositionSize?: number | undefined;
    tradingFrequency?: "max" | "conservative" | "aggressive" | "balanced" | undefined;
    maxHoldsBeforeAI?: number | undefined;
    aiConfidenceThreshold?: number | undefined;
    aiMode?: "rules_only" | "hybrid" | "full_ai" | undefined;
    customEntryConditions?: {
        value: number;
        indicator: string;
        operator: "<" | ">" | "<=" | ">=" | "crosses_above" | "crosses_below";
        weight: number;
    }[] | undefined;
    customExitConditions?: {
        value: number;
        indicator: string;
        operator: "<" | ">" | "<=" | ">=" | "crosses_above" | "crosses_below";
        weight: number;
    }[] | undefined;
    maxOpenPositions?: number | undefined;
    tradingSchedule?: "custom" | "24_7" | "us_hours" | undefined;
    tradingMode?: string | undefined;
    tradeDirection?: "both" | "buy" | "sell" | undefined;
    dailyLossLimit?: number | undefined;
}>;
export declare const updateBotBodySchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    strategy: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodString>;
    risk_level: z.ZodOptional<z.ZodString>;
    pairs: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    stopLoss: z.ZodOptional<z.ZodNumber>;
    takeProfit: z.ZodOptional<z.ZodNumber>;
    maxPositionSize: z.ZodOptional<z.ZodNumber>;
    tradeDirection: z.ZodOptional<z.ZodEnum<["buy", "sell", "both"]>>;
    dailyLossLimit: z.ZodOptional<z.ZodNumber>;
    orderType: z.ZodOptional<z.ZodEnum<["market", "limit"]>>;
    creatorFeePercent: z.ZodOptional<z.ZodNumber>;
    prompt: z.ZodOptional<z.ZodString>;
    tradingFrequency: z.ZodOptional<z.ZodEnum<["conservative", "balanced", "aggressive", "max"]>>;
    maxHoldsBeforeAI: z.ZodOptional<z.ZodNumber>;
    aiConfidenceThreshold: z.ZodOptional<z.ZodNumber>;
    aiMode: z.ZodOptional<z.ZodEnum<["rules_only", "hybrid", "full_ai"]>>;
    customEntryConditions: z.ZodOptional<z.ZodArray<z.ZodObject<{
        indicator: z.ZodString;
        operator: z.ZodEnum<["<", ">", "<=", ">=", "crosses_above", "crosses_below"]>;
        value: z.ZodNumber;
        weight: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        value: number;
        indicator: string;
        operator: "<" | ">" | "<=" | ">=" | "crosses_above" | "crosses_below";
        weight: number;
    }, {
        value: number;
        indicator: string;
        operator: "<" | ">" | "<=" | ">=" | "crosses_above" | "crosses_below";
        weight: number;
    }>, "many">>;
    customExitConditions: z.ZodOptional<z.ZodArray<z.ZodObject<{
        indicator: z.ZodString;
        operator: z.ZodEnum<["<", ">", "<=", ">=", "crosses_above", "crosses_below"]>;
        value: z.ZodNumber;
        weight: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        value: number;
        indicator: string;
        operator: "<" | ">" | "<=" | ">=" | "crosses_above" | "crosses_below";
        weight: number;
    }, {
        value: number;
        indicator: string;
        operator: "<" | ">" | "<=" | ">=" | "crosses_above" | "crosses_below";
        weight: number;
    }>, "many">>;
    maxOpenPositions: z.ZodOptional<z.ZodNumber>;
    tradingSchedule: z.ZodOptional<z.ZodEnum<["24_7", "us_hours", "custom"]>>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    risk_level?: string | undefined;
    prompt?: string | undefined;
    strategy?: string | undefined;
    category?: string | undefined;
    creatorFeePercent?: number | undefined;
    stopLoss?: number | undefined;
    takeProfit?: number | undefined;
    orderType?: "limit" | "market" | undefined;
    pairs?: string[] | undefined;
    maxPositionSize?: number | undefined;
    tradingFrequency?: "max" | "conservative" | "aggressive" | "balanced" | undefined;
    maxHoldsBeforeAI?: number | undefined;
    aiConfidenceThreshold?: number | undefined;
    aiMode?: "rules_only" | "hybrid" | "full_ai" | undefined;
    customEntryConditions?: {
        value: number;
        indicator: string;
        operator: "<" | ">" | "<=" | ">=" | "crosses_above" | "crosses_below";
        weight: number;
    }[] | undefined;
    customExitConditions?: {
        value: number;
        indicator: string;
        operator: "<" | ">" | "<=" | ">=" | "crosses_above" | "crosses_below";
        weight: number;
    }[] | undefined;
    maxOpenPositions?: number | undefined;
    tradingSchedule?: "custom" | "24_7" | "us_hours" | undefined;
    tradeDirection?: "both" | "buy" | "sell" | undefined;
    dailyLossLimit?: number | undefined;
}, {
    name?: string | undefined;
    risk_level?: string | undefined;
    prompt?: string | undefined;
    strategy?: string | undefined;
    category?: string | undefined;
    creatorFeePercent?: number | undefined;
    stopLoss?: number | undefined;
    takeProfit?: number | undefined;
    orderType?: "limit" | "market" | undefined;
    pairs?: string[] | undefined;
    maxPositionSize?: number | undefined;
    tradingFrequency?: "max" | "conservative" | "aggressive" | "balanced" | undefined;
    maxHoldsBeforeAI?: number | undefined;
    aiConfidenceThreshold?: number | undefined;
    aiMode?: "rules_only" | "hybrid" | "full_ai" | undefined;
    customEntryConditions?: {
        value: number;
        indicator: string;
        operator: "<" | ">" | "<=" | ">=" | "crosses_above" | "crosses_below";
        weight: number;
    }[] | undefined;
    customExitConditions?: {
        value: number;
        indicator: string;
        operator: "<" | ">" | "<=" | ">=" | "crosses_above" | "crosses_below";
        weight: number;
    }[] | undefined;
    maxOpenPositions?: number | undefined;
    tradingSchedule?: "custom" | "24_7" | "us_hours" | undefined;
    tradeDirection?: "both" | "buy" | "sell" | undefined;
    dailyLossLimit?: number | undefined;
}>;
export declare const purchaseBotBodySchema: z.ZodObject<{
    mode: z.ZodDefault<z.ZodEnum<["live", "paper"]>>;
    allocatedAmount: z.ZodOptional<z.ZodNumber>;
    minOrderValue: z.ZodOptional<z.ZodNumber>;
    exchangeConnId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    mode: "live" | "paper";
    exchangeConnId?: string | undefined;
    allocatedAmount?: number | undefined;
    minOrderValue?: number | undefined;
}, {
    mode?: "live" | "paper" | undefined;
    exchangeConnId?: string | undefined;
    allocatedAmount?: number | undefined;
    minOrderValue?: number | undefined;
}>;
export declare const shadowModeBodySchema: z.ZodEffects<z.ZodObject<{
    virtualBalance: z.ZodNumber;
    durationDays: z.ZodOptional<z.ZodNumber>;
    durationMinutes: z.ZodOptional<z.ZodNumber>;
    enableRiskLimits: z.ZodOptional<z.ZodBoolean>;
    enableRealisticFees: z.ZodOptional<z.ZodBoolean>;
    minOrderValue: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    virtualBalance: number;
    minOrderValue?: number | undefined;
    durationDays?: number | undefined;
    enableRiskLimits?: boolean | undefined;
    enableRealisticFees?: boolean | undefined;
    durationMinutes?: number | undefined;
}, {
    virtualBalance: number;
    minOrderValue?: number | undefined;
    durationDays?: number | undefined;
    enableRiskLimits?: boolean | undefined;
    enableRealisticFees?: boolean | undefined;
    durationMinutes?: number | undefined;
}>, {
    virtualBalance: number;
    minOrderValue?: number | undefined;
    durationDays?: number | undefined;
    enableRiskLimits?: boolean | undefined;
    enableRealisticFees?: boolean | undefined;
    durationMinutes?: number | undefined;
}, {
    virtualBalance: number;
    minOrderValue?: number | undefined;
    durationDays?: number | undefined;
    enableRiskLimits?: boolean | undefined;
    enableRealisticFees?: boolean | undefined;
    durationMinutes?: number | undefined;
}>;
export declare const reviewBodySchema: z.ZodObject<{
    rating: z.ZodNumber;
    text: z.ZodString;
}, "strip", z.ZodTypeAny, {
    rating: number;
    text: string;
}, {
    rating: number;
    text: string;
}>;
export declare const backtestBodySchema: z.ZodObject<{
    startDate: z.ZodOptional<z.ZodString>;
    endDate: z.ZodOptional<z.ZodString>;
    initialBalance: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    startDate?: string | undefined;
    endDate?: string | undefined;
    initialBalance?: number | undefined;
}, {
    startDate?: string | undefined;
    endDate?: string | undefined;
    initialBalance?: number | undefined;
}>;
export declare const paperTradingSetupBodySchema: z.ZodObject<{
    initialFunds: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    initialFunds?: number | undefined;
}, {
    initialFunds?: number | undefined;
}>;
export declare const dataResponseSchema: z.ZodObject<{
    data: z.ZodAny;
}, "strip", z.ZodTypeAny, {
    data?: any;
}, {
    data?: any;
}>;
export declare const updateUserConfigBodySchema: z.ZodObject<{
    riskMultiplier: z.ZodOptional<z.ZodUnion<[z.ZodLiteral<0.5>, z.ZodLiteral<1>, z.ZodLiteral<1.5>, z.ZodLiteral<2>]>>;
    maxDailyLoss: z.ZodOptional<z.ZodNumber>;
    autoStopBalance: z.ZodOptional<z.ZodNumber>;
    autoStopDays: z.ZodOptional<z.ZodNumber>;
    autoStopLossPercent: z.ZodOptional<z.ZodNumber>;
    compoundProfits: z.ZodOptional<z.ZodBoolean>;
    notificationLevel: z.ZodOptional<z.ZodEnum<["all", "wins_only", "losses_only", "summary"]>>;
}, "strip", z.ZodTypeAny, {
    riskMultiplier?: 1 | 2 | 0.5 | 1.5 | undefined;
    maxDailyLoss?: number | undefined;
    autoStopBalance?: number | undefined;
    autoStopDays?: number | undefined;
    autoStopLossPercent?: number | undefined;
    compoundProfits?: boolean | undefined;
    notificationLevel?: "summary" | "all" | "wins_only" | "losses_only" | undefined;
}, {
    riskMultiplier?: 1 | 2 | 0.5 | 1.5 | undefined;
    maxDailyLoss?: number | undefined;
    autoStopBalance?: number | undefined;
    autoStopDays?: number | undefined;
    autoStopLossPercent?: number | undefined;
    compoundProfits?: boolean | undefined;
    notificationLevel?: "summary" | "all" | "wins_only" | "losses_only" | undefined;
}>;
export declare const subscriptionIdParamsSchema: z.ZodObject<{
    subscriptionId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    subscriptionId: string;
}, {
    subscriptionId: string;
}>;
