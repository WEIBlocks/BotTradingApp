import { z } from 'zod';
export const dataResponseSchema = z.object({
    data: z.any(),
});
