import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { authenticate } from '../../middleware/authenticate.js';
import * as subscriptionsService from './subscriptions.service.js';
import { subscribeBodySchema, dataResponseSchema } from './subscriptions.schema.js';

export async function subscriptionsRoutes(app: FastifyInstance) {
  const zApp = app.withTypeProvider<ZodTypeProvider>();

  // GET /plans (no auth)
  zApp.get('/plans', {
    schema: {
      response: { 200: dataResponseSchema },
    },
  }, async (_request, _reply) => {
    const plans = await subscriptionsService.getPlans();
    return { data: plans };
  });

  // GET /current (auth)
  zApp.get('/current', {
    preHandler: [authenticate],
    schema: {
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, _reply) => {
    const subscription = await subscriptionsService.getCurrentSubscription(request.user.userId);
    return { data: subscription };
  });

  // POST /subscribe (auth)
  zApp.post('/subscribe', {
    preHandler: [authenticate],
    schema: {
      body: subscribeBodySchema,
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, _reply) => {
    const { planId } = request.body;
    const subscription = await subscriptionsService.subscribe(request.user.userId, planId);
    return { data: subscription };
  });

  // POST /cancel (auth)
  zApp.post('/cancel', {
    preHandler: [authenticate],
    schema: {
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, _reply) => {
    const subscription = await subscriptionsService.cancel(request.user.userId);
    return { data: subscription };
  });

  // GET /is-pro — lightweight check: is this user currently Pro?
  zApp.get('/is-pro', {
    preHandler: [authenticate],
    schema: {
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, _reply) => {
    const isPro = await subscriptionsService.isUserPro(request.user.userId);
    return { data: { isPro } };
  });
}
