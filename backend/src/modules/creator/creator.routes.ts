import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { authenticate } from '../../middleware/authenticate.js';
import * as creatorService from './creator.service.js';
import {
  monthlyRevenueQuerySchema,
  botIdParamsSchema,
  dataResponseSchema,
} from './creator.schema.js';

export async function creatorRoutes(app: FastifyInstance) {
  const zApp = app.withTypeProvider<ZodTypeProvider>();
  // All routes require auth
  zApp.addHook('preHandler', authenticate);

  // GET /stats
  zApp.get('/stats', {
    schema: {
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, _reply) => {
    const stats = await creatorService.getStats(request.user.userId);
    return { data: stats };
  });

  // GET /revenue/monthly
  zApp.get('/revenue/monthly', {
    schema: {
      querystring: monthlyRevenueQuerySchema,
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, _reply) => {
    const { months } = request.query;
    const revenue = await creatorService.getMonthlyRevenue(request.user.userId, months);
    return { data: revenue };
  });

  // GET /bots
  zApp.get('/bots', {
    schema: {
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, _reply) => {
    const bots = await creatorService.getCreatorBots(request.user.userId);
    return { data: bots };
  });

  // POST /bots/:id/publish
  zApp.post('/bots/:id/publish', {
    schema: {
      params: botIdParamsSchema,
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, _reply) => {
    const { id } = request.params;
    const bot = await creatorService.publishBot(request.user.userId, id);
    return { data: bot };
  });

  // GET /earnings — full earnings summary with breakdown
  zApp.get('/earnings', {
    schema: {
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, _reply) => {
    const earnings = await creatorService.getEarningsSummary(request.user.userId);
    return { data: earnings };
  });

  // GET /earnings/projection — projections based on current subscribers
  zApp.get('/earnings/projection', {
    schema: {
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, _reply) => {
    const projection = await creatorService.getEarningsProjection(request.user.userId);
    return { data: projection };
  });

  // GET /ai-suggestions
  zApp.get('/ai-suggestions', {
    schema: {
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, _reply) => {
    const suggestions = await creatorService.getAISuggestions(request.user.userId);
    return { data: suggestions };
  });
}
