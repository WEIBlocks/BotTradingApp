import { z } from 'zod';
export const uploadFileBodySchema = z.object({
    botId: z.string().min(1),
    type: z.enum(['image', 'video', 'document']),
    name: z.string().min(1),
    fileUrl: z.string().url(),
    fileSize: z.number().optional(),
});
export const uploadsParamsSchema = z.object({
    botId: z.string().min(1),
});
export const startTrainingBodySchema = z.object({
    botId: z.string().min(1),
});
export const dataResponseSchema = z.object({
    data: z.any(),
});
