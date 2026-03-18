import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import * as iapService from './iap.service.js';

const verifyReceiptBodySchema = z.object({
  purchaseToken: z.string().min(1),
  productId: z.string().min(1),
  packageName: z.string().min(1),
  type: z.enum(['subscription', 'bot_purchase']),
  itemId: z.string().optional(),
});

const dataResponseSchema = z.object({
  data: z.any(),
});

export async function iapRoutes(app: FastifyInstance) {
  const zApp = app.withTypeProvider<ZodTypeProvider>();
  zApp.addHook('preHandler', authenticate);

  // POST /verify - verify a Google Play IAP receipt
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
