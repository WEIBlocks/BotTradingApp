import { z } from 'zod';
export const postMessageSchema = {
    body: z.object({
        content: z.string().min(1, 'Message cannot be empty').max(500, 'Message too long (max 500 chars)'),
    }),
};
export const getMessagesSchema = {
    querystring: z.object({
        limit: z.coerce.number().int().min(1).max(100).default(50),
        before: z.string().optional(), // cursor-based: fetch messages before this ID
    }),
};
export const deleteMessageSchema = {
    params: z.object({
        id: z.string().min(1),
    }),
};
