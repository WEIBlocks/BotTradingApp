import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { authenticate } from '../../middleware/authenticate.js';
import { getSummary, getAssets, getAllocation, getEquityHistory, getPnlByBot } from './portfolio.service.js';
import { dataResponseSchema } from './portfolio.schema.js';

export async function portfolioRoutes(app: FastifyInstance) {
  const zApp = app.withTypeProvider<ZodTypeProvider>();
  zApp.addHook('onRequest', authenticate);

  // GET /summary
  zApp.get('/summary', {
    schema: {
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const result = await getSummary(request.user.userId);
    return { data: result };
  });

  // GET /assets
  zApp.get('/assets', {
    schema: {
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const result = await getAssets(request.user.userId);
    return { data: result };
  });

  // GET /allocation
  zApp.get('/allocation', {
    schema: {
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const result = await getAllocation(request.user.userId);
    return { data: result };
  });

  // GET /equity-history
  zApp.get('/equity-history', {
    schema: {
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const days = Number((request.query as any)?.days) || 30;
    const result = await getEquityHistory(request.user.userId, days);
    return { data: result };
  });

  // GET /pnl — P&L breakdown by bot
  zApp.get('/pnl', {
    schema: {
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const result = await getPnlByBot(request.user.userId);
    return { data: result };
  });
}
