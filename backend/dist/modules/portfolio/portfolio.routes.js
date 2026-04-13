import { authenticate } from '../../middleware/authenticate.js';
import { getSummary, getAssets, getAllocation, getEquityHistory, getPnlByBot, getConnectedModes } from './portfolio.service.js';
import { dataResponseSchema } from './portfolio.schema.js';
export async function portfolioRoutes(app) {
    const zApp = app.withTypeProvider();
    zApp.addHook('onRequest', authenticate);
    // GET /modes — returns which modes (live/testnet) user has connected
    zApp.get('/modes', {
        schema: { security: [{ bearerAuth: [] }] },
    }, async (request) => {
        const result = await getConnectedModes(request.user.userId);
        return { data: result };
    });
    // GET /summary?mode=live|testnet
    zApp.get('/summary', {
        schema: {
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request, reply) => {
        const mode = request.query?.mode;
        const result = await getSummary(request.user.userId, mode);
        return { data: result };
    });
    // GET /assets?mode=live|testnet
    zApp.get('/assets', {
        schema: {
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request, reply) => {
        const mode = request.query?.mode;
        const result = await getAssets(request.user.userId, mode);
        return { data: result };
    });
    // GET /allocation?mode=live|testnet
    zApp.get('/allocation', {
        schema: {
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request) => {
        const mode = request.query?.mode;
        const result = await getAllocation(request.user.userId, mode);
        return { data: result };
    });
    // GET /equity-history
    zApp.get('/equity-history', {
        schema: {
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request) => {
        const days = Number(request.query?.days) || 30;
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
