import { z } from 'zod';
export declare const recentTradesQuerySchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit: number;
}, {
    limit?: number | undefined;
}>;
export declare const tradeHistoryQuerySchema: z.ZodObject<{
    symbol: z.ZodOptional<z.ZodString>;
    side: z.ZodOptional<z.ZodString>;
    is_paper: z.ZodOptional<z.ZodString>;
    mode: z.ZodOptional<z.ZodString>;
    botId: z.ZodOptional<z.ZodString>;
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    page: number;
    symbol?: string | undefined;
    mode?: string | undefined;
    botId?: string | undefined;
    side?: string | undefined;
    is_paper?: string | undefined;
}, {
    symbol?: string | undefined;
    mode?: string | undefined;
    limit?: number | undefined;
    botId?: string | undefined;
    page?: number | undefined;
    side?: string | undefined;
    is_paper?: string | undefined;
}>;
export declare const dataResponseSchema: z.ZodObject<{
    data: z.ZodAny;
}, "strip", z.ZodTypeAny, {
    data?: any;
}, {
    data?: any;
}>;
