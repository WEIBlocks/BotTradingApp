import { authenticate } from '../../middleware/authenticate.js';
import { requireSubscription } from '../../middleware/requireSubscription.js';
import * as creatorService from './creator.service.js';
import { monthlyRevenueQuerySchema, botIdParamsSchema, botIdAnalyticsParamsSchema, experimentIdParamsSchema, createExperimentSchema, engagementQuerySchema, dataResponseSchema, } from './creator.schema.js';
export async function creatorRoutes(app) {
    const zApp = app.withTypeProvider();
    // All creator routes require auth + active Pro subscription
    zApp.addHook('preHandler', authenticate);
    zApp.addHook('preHandler', requireSubscription);
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
    // ─── Analytics Endpoints ───────────────────────────────────────────────
    // GET /analytics/engagement
    zApp.get('/analytics/engagement', {
        schema: {
            querystring: engagementQuerySchema,
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request, _reply) => {
        const { days } = request.query;
        const data = await creatorService.getEngagementMetrics(request.user.userId, days);
        return { data };
    });
    // GET /analytics/user-profitability
    zApp.get('/analytics/user-profitability', {
        schema: {
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request, _reply) => {
        const data = await creatorService.getUserProfitability(request.user.userId);
        return { data };
    });
    // GET /analytics/churn
    zApp.get('/analytics/churn', {
        schema: {
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request, _reply) => {
        const data = await creatorService.getChurnAnalysis(request.user.userId);
        return { data };
    });
    // GET /analytics/revenue-projection
    zApp.get('/analytics/revenue-projection', {
        schema: {
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request, _reply) => {
        const data = await creatorService.getEnhancedRevenueProjection(request.user.userId);
        return { data };
    });
    // GET /analytics/marketing
    zApp.get('/analytics/marketing', {
        schema: {
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request, _reply) => {
        const data = await creatorService.getMarketingMetrics(request.user.userId);
        return { data };
    });
    // GET /bots/:botId/patterns — AI-powered pattern detection
    zApp.get('/bots/:botId/patterns', {
        schema: {
            params: botIdAnalyticsParamsSchema,
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request, _reply) => {
        const { botId } = request.params;
        const data = await creatorService.getBotPatternAnalysis(botId, request.user.userId);
        return { data };
    });
    // GET /bots/:botId/subscribers — detailed per-subscriber stats for a bot
    zApp.get('/bots/:botId/subscribers', {
        schema: {
            params: botIdAnalyticsParamsSchema,
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request, _reply) => {
        const { botId } = request.params;
        const data = await creatorService.getBotSubscriberDetails(botId, request.user.userId);
        return { data };
    });
    // GET /bots/:botId/trade-summary — all trades summary for a bot across all users
    zApp.get('/bots/:botId/trade-summary', {
        schema: {
            params: botIdAnalyticsParamsSchema,
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request, _reply) => {
        const { botId } = request.params;
        const data = await creatorService.getBotTradeSummary(botId, request.user.userId);
        return { data };
    });
    // ─── A/B Experiments ──────────────────────────────────────────────────
    // POST /experiments — create A/B test
    zApp.post('/experiments', {
        schema: {
            body: createExperimentSchema,
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request, _reply) => {
        const data = await creatorService.createExperiment(request.user.userId, request.body);
        return { data };
    });
    // GET /experiments — list experiments
    zApp.get('/experiments', {
        schema: {
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request, _reply) => {
        const data = await creatorService.getExperiments(request.user.userId);
        return { data };
    });
    // GET /experiments/:id/results
    zApp.get('/experiments/:id/results', {
        schema: {
            params: experimentIdParamsSchema,
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request, _reply) => {
        const { id } = request.params;
        const data = await creatorService.getExperimentResults(id, request.user.userId);
        return { data };
    });
    // PUT /experiments/:id/stop
    zApp.put('/experiments/:id/stop', {
        schema: {
            params: experimentIdParamsSchema,
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request, _reply) => {
        const { id } = request.params;
        const data = await creatorService.stopExperiment(id, request.user.userId);
        return { data };
    });
}
