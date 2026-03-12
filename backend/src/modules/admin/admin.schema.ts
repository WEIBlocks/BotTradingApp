import { z } from 'zod';

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const usersQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional(),
});

export const botsQuerySchema = paginationQuerySchema.extend({
  status: z.string().optional(),
});

export const userIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const botIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const updateUserBodySchema = z.object({
  role: z.string().optional(),
  isActive: z.boolean().optional(),
  name: z.string().optional(),
});

export const rejectBotBodySchema = z.object({
  reason: z.string().optional(),
});

export const updateSettingsBodySchema = z.object({}).passthrough();

export const dataResponseSchema = z.object({
  data: z.any(),
});

export const messageResponseSchema = z.object({
  message: z.string(),
});
