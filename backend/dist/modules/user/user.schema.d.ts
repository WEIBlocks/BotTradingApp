import { z } from 'zod';
export declare const updateProfileSchema: {
    body: z.ZodObject<{
        name: z.ZodOptional<z.ZodString>;
        risk_tolerance: z.ZodOptional<z.ZodNumber>;
        investment_goal: z.ZodOptional<z.ZodString>;
        avatar_color: z.ZodOptional<z.ZodString>;
        avatar_initials: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name?: string | undefined;
        avatar_initials?: string | undefined;
        avatar_color?: string | undefined;
        risk_tolerance?: number | undefined;
        investment_goal?: string | undefined;
    }, {
        name?: string | undefined;
        avatar_initials?: string | undefined;
        avatar_color?: string | undefined;
        risk_tolerance?: number | undefined;
        investment_goal?: string | undefined;
    }>;
};
export declare const updateSettingsSchema: {
    body: z.ZodObject<{
        trade_alerts: z.ZodOptional<z.ZodBoolean>;
        system_updates: z.ZodOptional<z.ZodBoolean>;
        price_alerts: z.ZodOptional<z.ZodBoolean>;
        push_enabled: z.ZodOptional<z.ZodBoolean>;
        email_enabled: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        trade_alerts?: boolean | undefined;
        system_updates?: boolean | undefined;
        price_alerts?: boolean | undefined;
        push_enabled?: boolean | undefined;
        email_enabled?: boolean | undefined;
    }, {
        trade_alerts?: boolean | undefined;
        system_updates?: boolean | undefined;
        price_alerts?: boolean | undefined;
        push_enabled?: boolean | undefined;
        email_enabled?: boolean | undefined;
    }>;
};
export declare const paginationQuery: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    page: number;
}, {
    limit?: number | undefined;
    page?: number | undefined;
}>;
export declare const quizBodySchema: z.ZodObject<{
    riskTolerance: z.ZodNumber;
    investmentGoal: z.ZodOptional<z.ZodString>;
    timeHorizon: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    riskTolerance: number;
    investmentGoal?: string | undefined;
    timeHorizon?: string | undefined;
}, {
    riskTolerance: number;
    investmentGoal?: string | undefined;
    timeHorizon?: string | undefined;
}>;
export declare const dataResponseSchema: z.ZodObject<{
    data: z.ZodAny;
}, "strip", z.ZodTypeAny, {
    data?: any;
}, {
    data?: any;
}>;
export declare const profileResponseSchema: z.ZodAny;
export type UpdateProfileBody = z.infer<typeof updateProfileSchema.body>;
export type UpdateSettingsBody = z.infer<typeof updateSettingsSchema.body>;
export type PaginationQuery = z.infer<typeof paginationQuery>;
