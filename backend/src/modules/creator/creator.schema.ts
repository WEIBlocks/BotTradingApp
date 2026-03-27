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

// ─── Analytics Schemas ──────────────────────────────────────────────────────

export const engagementQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export const botIdAnalyticsParamsSchema = z.object({
  botId: z.string().uuid(),
});

export const experimentIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const createExperimentSchema = z.object({
  botId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  variantAConfig: z.record(z.any()).optional(),
  variantBConfig: z.record(z.any()).optional(),
});
