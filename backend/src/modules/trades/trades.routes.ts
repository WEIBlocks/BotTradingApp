import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { authenticate } from '../../middleware/authenticate.js';
import { getRecentTrades, getTradeHistory, getTradeSummary } from './trades.service.js';
import {
  recentTradesQuerySchema,
  tradeHistoryQuerySchema,
  dataResponseSchema,
} from './trades.schema.js';

export async function tradesRoutes(app: FastifyInstance) {
  const zApp = app.withTypeProvider<ZodTypeProvider>();
  zApp.addHook('onRequest', authenticate);

  // GET /recent
  zApp.get('/recent', {
    schema: {
      querystring: recentTradesQuerySchema,
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { limit } = request.query;
    const result = await getRecentTrades(request.user.userId, limit);
    return { data: result };
  });

  // GET /summary — per-mode stats (live, shadow, arena, all)
  zApp.get('/summary', {
    schema: { response: { 200: dataResponseSchema }, security: [{ bearerAuth: [] }] },
  }, async (request) => {
    const result = await getTradeSummary(request.user.userId);
    return { data: result };
  });

  // GET /history
  zApp.get('/history', {
    schema: {
      querystring: tradeHistoryQuerySchema,
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const query = request.query;
    const result = await getTradeHistory(request.user.userId, {
      symbol: query.symbol,
      side: query.side,
      is_paper: query.is_paper,
      mode: (query as any).mode,
      botId: query.botId,
      page: query.page,
      limit: query.limit,
    });
    return result;
  });
}
