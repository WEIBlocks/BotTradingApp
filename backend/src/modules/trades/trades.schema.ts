import { z } from 'zod';

export const recentTradesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export const tradeHistoryQuerySchema = z.object({
  symbol: z.string().optional(),
  side: z.string().optional(),
  is_paper: z.string().optional(),
  mode: z.string().optional(),
  botId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(20),
});

export const dataResponseSchema = z.object({
  data: z.any(),
});
