import { z } from 'zod';

export const createSessionBodySchema = z.object({
  botIds: z.array(z.string()).min(2),
  durationSeconds: z.number().int().positive().optional(),
});

export const sessionIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const dataResponseSchema = z.object({
  data: z.any(),
});
