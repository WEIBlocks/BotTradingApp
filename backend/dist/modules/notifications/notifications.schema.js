import { z } from 'zod';
export const notificationsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const notificationIdParamsSchema = z.object({
    id: z.string().min(1),
});
export const updateNotificationSettingsBodySchema = z.object({
    tradeAlerts: z.boolean().optional(),
    systemUpdates: z.boolean().optional(),
    priceAlerts: z.boolean().optional(),
    pushEnabled: z.boolean().optional(),
    emailEnabled: z.boolean().optional(),
});
export const dataResponseSchema = z.object({
    data: z.any(),
});
