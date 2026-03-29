import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import * as marketService from './market.service.js';

const candlesQuerySchema = z.object({
  symbol: z.string().min(1), // e.g., BTC/USDT
  timeframe: z.string().default('4h'),
  limit: z.coerce.number().int().min(10).max(500).default(100),
});

const dataResponseSchema = z.object({ data: z.any() });

export async function marketRoutes(app: FastifyInstance) {
  const zApp = app.withTypeProvider<ZodTypeProvider>();
  zApp.addHook('preHandler', authenticate);

  // GET /candles?symbol=BTC/USDT&timeframe=4h&limit=100
  zApp.get('/candles', {
    schema: {
      querystring: candlesQuerySchema,
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, _reply) => {
    const { symbol, timeframe, limit } = request.query;
    const candles = await marketService.getCandles(symbol, timeframe, limit);
    return { data: candles };
  });
}
