import { z } from 'zod';
export declare const createSessionBodySchema: z.ZodObject<{
    botIds: z.ZodArray<z.ZodString, "many">;
    durationSeconds: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    unlimited: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    mode: z.ZodDefault<z.ZodOptional<z.ZodEnum<["shadow", "live"]>>>;
    virtualBalance: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    cryptoBalance: z.ZodOptional<z.ZodNumber>;
    stockBalance: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    mode: "shadow" | "live";
    virtualBalance: number;
    durationSeconds: number;
    unlimited: boolean;
    botIds: string[];
    cryptoBalance?: number | undefined;
    stockBalance?: number | undefined;
}, {
    botIds: string[];
    mode?: "shadow" | "live" | undefined;
    virtualBalance?: number | undefined;
    durationSeconds?: number | undefined;
    unlimited?: boolean | undefined;
    cryptoBalance?: number | undefined;
    stockBalance?: number | undefined;
}>;
export declare const sessionIdParamsSchema: z.ZodObject<{
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
export declare const getBotsQuerySchema: z.ZodObject<{
    search: z.ZodOptional<z.ZodString>;
    page: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    pageSize: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    assetClass: z.ZodDefault<z.ZodOptional<z.ZodEnum<["crypto", "stocks", "all"]>>>;
}, "strip", z.ZodTypeAny, {
    assetClass: "crypto" | "stocks" | "all";
    page: number;
    pageSize: number;
    search?: string | undefined;
}, {
    search?: string | undefined;
    assetClass?: "crypto" | "stocks" | "all" | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
}>;
