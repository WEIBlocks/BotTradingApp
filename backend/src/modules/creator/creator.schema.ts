import { z } from 'zod';

export const monthlyRevenueQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(24).default(6),
});

export const botIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const dataResponseSchema = z.object({
  data: z.any(),
});
