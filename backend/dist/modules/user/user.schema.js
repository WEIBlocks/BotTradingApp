import { z } from 'zod';
export const updateProfileSchema = {
    body: z.object({
        name: z.string().min(1).optional(),
        risk_tolerance: z.number().int().min(0).max(100).optional(),
        investment_goal: z.string().optional(),
        avatar_color: z.string().max(9).optional(),
        avatar_initials: z.string().max(4).optional(),
    }),
};
export const updateSettingsSchema = {
    body: z.object({
        trade_alerts: z.boolean().optional(),
        system_updates: z.boolean().optional(),
        price_alerts: z.boolean().optional(),
        push_enabled: z.boolean().optional(),
        email_enabled: z.boolean().optional(),
    }),
};
export const paginationQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const quizBodySchema = z.object({
    riskTolerance: z.number().int().min(0).max(100),
    investmentGoal: z.string().optional(),
    timeHorizon: z.string().optional(),
});
export const dataResponseSchema = z.object({
    data: z.any(),
});
export const profileResponseSchema = z.any();
