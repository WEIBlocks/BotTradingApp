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
  tradeDirection: z.enum(['buy', 'sell', 'both']).optional().default('both'),
  dailyLossLimit: z.number().min(0).max(100).optional(),
  orderType: z.enum(['market', 'limit']).optional().default('market'),
  creatorFeePercent: z.number().min(0).max(50).optional(),
  prompt: z.string().max(2000).optional(),
});

export const updateBotBodySchema = z.object({
  name: z.string().min(1).optional(),
  strategy: z.string().min(1).optional(),
  category: z.string().optional(),
  risk_level: z.string().optional(),
  pairs: z.array(z.string()).optional(),
  stopLoss: z.number().optional(),
  takeProfit: z.number().optional(),
  maxPositionSize: z.number().optional(),
  tradeDirection: z.enum(['buy', 'sell', 'both']).optional(),
  dailyLossLimit: z.number().min(0).max(100).optional(),
  orderType: z.enum(['market', 'limit']).optional(),
  creatorFeePercent: z.number().min(0).max(50).optional(),
  prompt: z.string().max(2000).optional(),
});

export const purchaseBotBodySchema = z.object({
  mode: z.enum(['live', 'paper']).default('live'),
  allocatedAmount: z.number().positive().optional(),
});

export const shadowModeBodySchema = z.object({
  virtualBalance: z.number().positive(),
  durationDays: z.number().int().min(0).optional(),
  durationMinutes: z.number().int().positive().optional(),
  enableRiskLimits: z.boolean().optional(),
  enableRealisticFees: z.boolean().optional(),
}).refine(data => (data.durationDays && data.durationDays > 0) || (data.durationMinutes && data.durationMinutes > 0), {
  message: 'Either durationDays or durationMinutes must be provided',
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
