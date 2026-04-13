import { z } from 'zod';
export declare const monthlyRevenueQuerySchema: z.ZodObject<{
    months: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    months: number;
}, {
    months?: number | undefined;
}>;
export declare const botIdParamsSchema: z.ZodObject<{
    id: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
}, {
    id: string;
}>;
export declare const dataResponseSchema: z.ZodObject<{
    data: z.ZodAny;
}, "strip", z.ZodTypeAny, {
    data?: any;
}, {
    data?: any;
}>;
export declare const engagementQuerySchema: z.ZodObject<{
    days: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    days: number;
}, {
    days?: number | undefined;
}>;
export declare const botIdAnalyticsParamsSchema: z.ZodObject<{
    botId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    botId: string;
}, {
    botId: string;
}>;
export declare const experimentIdParamsSchema: z.ZodObject<{
    id: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
}, {
    id: string;
}>;
export declare const createExperimentSchema: z.ZodObject<{
    botId: z.ZodString;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    variantAConfig: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    variantBConfig: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    botId: string;
    description?: string | undefined;
    variantAConfig?: Record<string, any> | undefined;
    variantBConfig?: Record<string, any> | undefined;
}, {
    name: string;
    botId: string;
    description?: string | undefined;
    variantAConfig?: Record<string, any> | undefined;
    variantBConfig?: Record<string, any> | undefined;
}>;
