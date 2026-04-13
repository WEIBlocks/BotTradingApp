import { z } from 'zod';
export declare const connectBodySchema: z.ZodObject<{
    provider: z.ZodString;
    apiKey: z.ZodString;
    apiSecret: z.ZodString;
    sandbox: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    provider: string;
    sandbox: boolean;
    apiKey: string;
    apiSecret: string;
}, {
    provider: string;
    apiKey: string;
    apiSecret: string;
    sandbox?: boolean | undefined;
}>;
export declare const oauthInitiateBodySchema: z.ZodObject<{
    provider: z.ZodString;
}, "strip", z.ZodTypeAny, {
    provider: string;
}, {
    provider: string;
}>;
export declare const oauthCallbackBodySchema: z.ZodObject<{
    provider: z.ZodString;
    code: z.ZodString;
}, "strip", z.ZodTypeAny, {
    code: string;
    provider: string;
}, {
    code: string;
    provider: string;
}>;
export declare const exchangeIdParamsSchema: z.ZodObject<{
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
