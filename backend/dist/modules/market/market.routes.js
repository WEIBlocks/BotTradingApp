import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import * as marketService from './market.service.js';
const candlesQuerySchema = z.object({
    symbol: z.string().min(1),
    timeframe: z.string().default('4h'),
    limit: z.coerce.number().int().min(10).max(2000).default(200),
    exchange: z.string().optional(), // 'binance' | 'kraken' | 'coinbase' | 'alpaca'
});
const livePriceQuerySchema = z.object({
    symbol: z.string().min(1),
    exchange: z.string().optional(),
});
const dataResponseSchema = z.object({ data: z.any() });
export async function marketRoutes(app) {
    const zApp = app.withTypeProvider();
    zApp.addHook('preHandler', authenticate);
    // GET /market/candles?symbol=BTC/USDT&timeframe=4h&limit=100&exchange=kraken
    zApp.get('/candles', {
        schema: {
            querystring: candlesQuerySchema,
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request, _reply) => {
        const { symbol, timeframe, limit, exchange } = request.query;
        const result = await marketService.getCandles(symbol, timeframe, limit, exchange);
        return { data: result };
    });
    // GET /market/price?symbol=BTC/USDT&exchange=kraken
    zApp.get('/price', {
        schema: {
            querystring: livePriceQuerySchema,
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request, _reply) => {
        const { symbol, exchange } = request.query;
        const result = await marketService.getLivePrice(symbol, exchange);
        return { data: result };
    });
}
