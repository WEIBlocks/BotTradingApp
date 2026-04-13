import { authenticate } from '../../middleware/authenticate.js';
import { getRecentTrades, getTradeHistory } from './trades.service.js';
import { recentTradesQuerySchema, tradeHistoryQuerySchema, dataResponseSchema, } from './trades.schema.js';
export async function tradesRoutes(app) {
    const zApp = app.withTypeProvider();
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
            mode: query.mode,
            botId: query.botId,
            page: query.page,
            limit: query.limit,
        });
        return result;
    });
}
