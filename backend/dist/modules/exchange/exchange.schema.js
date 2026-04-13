import { z } from 'zod';
export const connectBodySchema = z.object({
    provider: z.string().min(1),
    apiKey: z.string().min(1),
    apiSecret: z.string().min(1),
    sandbox: z.boolean().optional().default(false),
});
export const oauthInitiateBodySchema = z.object({
    provider: z.string().min(1),
});
export const oauthCallbackBodySchema = z.object({
    provider: z.string().min(1),
    code: z.string().min(1),
});
export const exchangeIdParamsSchema = z.object({
    id: z.string().min(1),
});
export const dataResponseSchema = z.object({
    data: z.any(),
});
