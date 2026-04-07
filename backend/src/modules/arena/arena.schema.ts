import { z } from 'zod';

export const createSessionBodySchema = z.object({
  botIds: z.array(z.string()).min(2).max(5),
  durationSeconds: z.number().int().min(60).max(86400).optional().default(180),
  mode: z.enum(['shadow', 'live']).optional().default('shadow'),
  // Shadow mode: total virtual balance shared across all bots
  virtualBalance: z.number().min(100).max(10_000_000).optional().default(10000),
  // Mixed session (crypto + stocks): separate balances
  cryptoBalance: z.number().min(0).max(10_000_000).optional(),
  stockBalance: z.number().min(0).max(10_000_000).optional(),
});

export const sessionIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const dataResponseSchema = z.object({
  data: z.any(),
});
