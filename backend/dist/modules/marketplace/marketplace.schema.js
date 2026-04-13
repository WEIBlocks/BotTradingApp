import { z } from 'zod';
export const listBotsQuerySchema = z.object({
    category: z.string().optional(),
    risk: z.string().optional(),
    search: z.string().optional(),
    sort: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const trendingQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(50).default(5),
});
export const botIdParamsSchema = z.object({
    id: z.string().min(1),
});
export const botResponseSchema = z.object({
    data: z.any(),
});
export const botsListResponseSchema = z.object({
    data: z.array(z.any()),
    total: z.number().optional(),
    page: z.number().optional(),
    limit: z.number().optional(),
});
