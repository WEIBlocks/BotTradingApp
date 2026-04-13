import { z } from 'zod';
export declare const createSessionBodySchema: z.ZodObject<{
    botIds: z.ZodArray<z.ZodString, "many">;
    durationSeconds: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    mode: z.ZodDefault<z.ZodOptional<z.ZodEnum<["shadow", "live"]>>>;
    virtualBalance: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    cryptoBalance: z.ZodOptional<z.ZodNumber>;
    stockBalance: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    mode: "shadow" | "live";
    virtualBalance: number;
    durationSeconds: number;
    botIds: string[];
    cryptoBalance?: number | undefined;
    stockBalance?: number | undefined;
}, {
    botIds: string[];
    mode?: "shadow" | "live" | undefined;
    virtualBalance?: number | undefined;
    durationSeconds?: number | undefined;
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
