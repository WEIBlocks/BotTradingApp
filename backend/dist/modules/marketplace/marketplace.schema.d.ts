import { z } from 'zod';
export declare const listBotsQuerySchema: z.ZodObject<{
    category: z.ZodOptional<z.ZodString>;
    risk: z.ZodOptional<z.ZodString>;
    search: z.ZodOptional<z.ZodString>;
    sort: z.ZodOptional<z.ZodString>;
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    page: number;
    sort?: string | undefined;
    search?: string | undefined;
    category?: string | undefined;
    risk?: string | undefined;
}, {
    sort?: string | undefined;
    search?: string | undefined;
    limit?: number | undefined;
    category?: string | undefined;
    page?: number | undefined;
    risk?: string | undefined;
}>;
export declare const trendingQuerySchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit: number;
}, {
    limit?: number | undefined;
}>;
export declare const botIdParamsSchema: z.ZodObject<{
    id: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
}, {
    id: string;
}>;
export declare const botResponseSchema: z.ZodObject<{
    data: z.ZodAny;
}, "strip", z.ZodTypeAny, {
    data?: any;
}, {
    data?: any;
}>;
export declare const botsListResponseSchema: z.ZodObject<{
    data: z.ZodArray<z.ZodAny, "many">;
    total: z.ZodOptional<z.ZodNumber>;
    page: z.ZodOptional<z.ZodNumber>;
    limit: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    data: any[];
    limit?: number | undefined;
    page?: number | undefined;
    total?: number | undefined;
}, {
    data: any[];
    limit?: number | undefined;
    page?: number | undefined;
    total?: number | undefined;
}>;
