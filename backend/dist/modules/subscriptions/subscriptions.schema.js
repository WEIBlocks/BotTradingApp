import { z } from 'zod';
export const subscribeBodySchema = z.object({
    planId: z.string().min(1),
});
export const dataResponseSchema = z.object({
    data: z.any(),
});
