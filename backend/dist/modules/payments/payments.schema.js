import { z } from 'zod';
export const addPaymentMethodBodySchema = z.object({
    type: z.enum(['card', 'crypto']),
    label: z.string().optional(),
    last4: z.string().optional(),
    network: z.string().optional(),
    cryptoAddress: z.string().optional(),
});
export const paymentMethodIdParamsSchema = z.object({
    id: z.string().min(1),
});
export const checkoutConfirmBodySchema = z.object({
    type: z.enum(['bot_purchase', 'subscription', 'deposit', 'withdrawal']),
    itemId: z.string().optional(),
    amount: z.string().min(1),
    paymentMethodId: z.string().optional(),
});
export const dataResponseSchema = z.object({
    data: z.any(),
});
export const messageResponseSchema = z.object({
    message: z.string(),
});
