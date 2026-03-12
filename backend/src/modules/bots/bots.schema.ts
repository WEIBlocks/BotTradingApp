import { z } from 'zod';

export const botIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const createBotBodySchema = z.object({
  name: z.string().min(1),
  strategy: z.string().min(1),
  category: z.string().optional(),
  risk_level: z.string().optional(),
  pairs: z.array(z.string()).optional(),
  stopLoss: z.number().optional(),
  takeProfit: z.number().optional(),
  maxPositionSize: z.number().optional(),
  tradingMode: z.string().optional(),
});

export const purchaseBotBodySchema = z.object({
  mode: z.enum(['live', 'paper']),
});

export const shadowModeBodySchema = z.object({
  virtualBalance: z.number().positive(),
  durationDays: z.number().int().positive(),
  enableRiskLimits: z.boolean().optional(),
  enableRealisticFees: z.boolean().optional(),
});

export const reviewBodySchema = z.object({
  rating: z.number().int().min(1).max(5),
  text: z.string().min(1),
});

export const backtestBodySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  initialBalance: z.number().optional(),
});

export const paperTradingSetupBodySchema = z.object({
  initialFunds: z.number().positive().optional(),
});

export const dataResponseSchema = z.object({
  data: z.any(),
});
