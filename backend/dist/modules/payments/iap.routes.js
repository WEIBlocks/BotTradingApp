import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import * as iapService from './iap.service.js';
const verifyReceiptBodySchema = z.object({
    purchaseToken: z.string().min(1),
    productId: z.string().min(1),
    packageName: z.string().min(1),
    platform: z.enum(['android', 'ios']),
    type: z.enum(['subscription', 'bot_purchase']),
    /** planId from our subscription_plans table — required for type=subscription */
    planId: z.string().uuid().optional(),
});
const dataResponseSchema = z.object({ data: z.any() });
export async function iapRoutes(app) {
    const zApp = app.withTypeProvider();
    zApp.addHook('preHandler', authenticate);
    // POST /payments/iap/verify
    zApp.post('/verify', {
        schema: {
            body: verifyReceiptBodySchema,
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request, _reply) => {
        const result = await iapService.verifyReceipt(request.user.userId, request.body);
        return { data: result };
    });
}
