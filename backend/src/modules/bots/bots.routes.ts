import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { authenticate } from '../../middleware/authenticate.js';
import {
  createBot,
  updateBot,
  getBotForEdit,
  pauseBot,
  stopBot,
  resumeBot,
  purchaseBot,
  startShadowMode,
  pauseShadowSession,
  resumeShadowSession,
  stopShadowSession,
  getShadowResults,
  getUserShadowSessions,
  getUserActiveBots,
  addReview,
  backtestBot,
  getPaperTradingStatus,
  activateLiveMode,
  getBotDecisions,
  getLeaderboard,
  compareBots,
  startCopyTrading,
  stopCopyTrading,
  getBotEquityCurve,
  getBotTradeMarkers,
  updateUserConfig,
  getSubscription,
  getBotFeedStats,
} from './bots.service.js';
import {
  botIdParamsSchema,
  createBotBodySchema,
  updateBotBodySchema,
  purchaseBotBodySchema,
  shadowModeBodySchema,
  reviewBodySchema,
  backtestBodySchema,
  paperTradingSetupBodySchema,
  dataResponseSchema,
  updateUserConfigBodySchema,
  subscriptionIdParamsSchema,
} from './bots.schema.js';

// ─── Simple in-memory cache for getUserActiveBots (per user, 30s TTL) ────────
const activeBotsCache = new Map<string, { data: unknown; at: number }>();
const ACTIVE_BOTS_TTL = 30_000;
function getActiveBotsCache<T>(userId: string): T | null {
  const entry = activeBotsCache.get(userId);
  if (entry && Date.now() - entry.at < ACTIVE_BOTS_TTL) return entry.data as T;
  return null;
}
function setActiveBotsCache(userId: string, data: unknown) {
  activeBotsCache.set(userId, { data, at: Date.now() });
}
export function invalidateActiveBotsCache(userId: string) {
  activeBotsCache.delete(userId);
}

export async function botsRoutes(app: FastifyInstance) {
  const zApp = app.withTypeProvider<ZodTypeProvider>();
  zApp.addHook('onRequest', authenticate);

  // POST /create
  zApp.post('/create', {
    schema: {
      body: createBotBodySchema,
      response: { 201: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const bot = await createBot(request.user.userId, request.body);
    return reply.status(201).send({ data: bot });
  });

  // PUT /:id - Update a bot (creator only)
  zApp.put('/:id', {
    schema: {
      params: botIdParamsSchema,
      body: updateBotBodySchema,
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const bot = await updateBot(request.user.userId, id, request.body);
    return { data: bot };
  });

  // GET /:id/edit - Get bot data for editing (creator only)
  zApp.get('/:id/edit', {
    schema: {
      params: botIdParamsSchema,
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const bot = await getBotForEdit(request.user.userId, id);
    return { data: bot };
  });

  // POST /:id/pause
  zApp.post('/:id/pause', {
    schema: {
      params: botIdParamsSchema,
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const result = await pauseBot(request.user.userId, id);
    return { data: result };
  });

  // POST /:id/stop
  zApp.post('/:id/stop', {
    schema: {
      params: botIdParamsSchema,
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const result = await stopBot(request.user.userId, id);
    return { data: result };
  });

  // POST /:id/resume
  zApp.post('/:id/resume', {
    schema: {
      params: botIdParamsSchema,
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const result = await resumeBot(request.user.userId, id);
    return { data: result };
  });

  // POST /:id/purchase
  zApp.post('/:id/purchase', {
    schema: {
      params: botIdParamsSchema,
      body: purchaseBotBodySchema,
      response: { 201: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { mode, allocatedAmount } = request.body;
    const result = await purchaseBot(request.user.userId, id, mode, allocatedAmount);
    invalidateActiveBotsCache(request.user.userId);
    return reply.status(201).send({ data: result });
  });

  // POST /:id/shadow-mode
  zApp.post('/:id/shadow-mode', {
    schema: {
      params: botIdParamsSchema,
      body: shadowModeBodySchema,
      response: { 201: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const result = await startShadowMode(request.user.userId, id, request.body);
    return reply.status(201).send({ data: result });
  });

  // GET /user/active
  zApp.get('/user/active', {
    schema: {
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const uid = request.user.userId;
    const cached = getActiveBotsCache<unknown[]>(uid);
    if (cached) return { data: cached };
    const result = await getUserActiveBots(uid);
    setActiveBotsCache(uid, result);
    return { data: result };
  });

  // POST /:id/reviews
  zApp.post('/:id/reviews', {
    schema: {
      params: botIdParamsSchema,
      body: reviewBodySchema,
      response: { 201: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { rating, text } = request.body;
    const result = await addReview(request.user.userId, id, rating, text);
    return reply.status(201).send({ data: result });
  });

  // GET /shadow-sessions - List user's shadow trading sessions
  zApp.get('/shadow-sessions', {
    schema: {
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const result = await getUserShadowSessions(request.user.userId);
    return { data: result };
  });

  // GET /shadow-sessions/:id/results - Get shadow mode results
  zApp.get('/shadow-sessions/:id/results', {
    schema: {
      params: botIdParamsSchema,
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const result = await getShadowResults(request.user.userId, id);
    return { data: result };
  });

  // POST /shadow-sessions/:id/pause
  zApp.post('/shadow-sessions/:id/pause', {
    schema: {
      params: botIdParamsSchema,
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const result = await pauseShadowSession(request.user.userId, id);
    return { data: result };
  });

  // POST /shadow-sessions/:id/resume
  zApp.post('/shadow-sessions/:id/resume', {
    schema: {
      params: botIdParamsSchema,
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const result = await resumeShadowSession(request.user.userId, id);
    return { data: result };
  });

  // POST /shadow-sessions/:id/stop
  zApp.post('/shadow-sessions/:id/stop', {
    schema: {
      params: botIdParamsSchema,
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const result = await stopShadowSession(request.user.userId, id);
    invalidateActiveBotsCache(request.user.userId);
    return { data: result };
  });

  // POST /:id/backtest - Run a backtest simulation
  zApp.post('/:id/backtest', {
    schema: {
      params: botIdParamsSchema,
      body: backtestBodySchema,
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const result = await backtestBot(request.user.userId, id, request.body);
    return { data: result };
  });

  // GET /paper-trading/status - Get paper trading status
  zApp.get('/paper-trading/status', {
    schema: {
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const result = await getPaperTradingStatus(request.user.userId);
    return { data: result };
  });

  // POST /:id/activate-live - Activate live trading with exchange connection
  zApp.post('/:id/activate-live', {
    schema: {
      params: botIdParamsSchema,
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { exchangeConnId, allocatedAmount } = request.body as { exchangeConnId: string; allocatedAmount?: number };
    const result = await activateLiveMode(request.user.userId, id, exchangeConnId, allocatedAmount);
    return { data: result };
  });

  // GET /:id/decisions - Get bot decision history (live feed data)
  zApp.get('/:id/decisions', {
    schema: {
      params: botIdParamsSchema,
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { limit, offset, mode } = request.query as { limit?: number; offset?: number; mode?: string };
    const result = await getBotDecisions(request.user.userId, id, limit, offset, mode as 'paper' | 'live' | undefined);
    return { data: result };
  });

  // GET /:id/feed-stats - Get comprehensive feed stats for live feed screen
  zApp.get('/:id/feed-stats', {
    schema: {
      params: botIdParamsSchema,
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { mode } = request.query as { mode?: string };
    const result = await getBotFeedStats(request.user.userId, id, mode as 'paper' | 'live' | undefined);
    return { data: result };
  });

  // GET /leaderboard - Bot performance leaderboard
  zApp.get('/leaderboard', {
    schema: {
      response: { 200: dataResponseSchema },
    },
  }, async (request, reply) => {
    const result = await getLeaderboard();
    return { data: result };
  });

  // GET /compare - Compare bots side by side
  zApp.get('/compare', {
    schema: {
      response: { 200: dataResponseSchema },
    },
  }, async (request, reply) => {
    const { ids } = request.query as { ids?: string };
    const botIds = ids?.split(',').filter(Boolean) ?? [];
    const result = await compareBots(botIds);
    return { data: result };
  });

  // POST /:id/copy - Start copy trading a bot
  zApp.post('/:id/copy', {
    schema: {
      params: botIdParamsSchema,
      response: { 201: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { allocationPercent, isPaper } = request.body as { allocationPercent?: number; isPaper?: boolean };
    const result = await startCopyTrading(request.user.userId, id, allocationPercent, isPaper);
    return reply.status(201).send({ data: result });
  });

  // POST /:id/copy/stop - Stop copy trading
  zApp.post('/:id/copy/stop', {
    schema: {
      params: botIdParamsSchema,
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const result = await stopCopyTrading(request.user.userId, id);
    return { data: result };
  });

  // GET /:id/equity-curve - Get bot equity curve
  zApp.get('/:id/equity-curve', {
    schema: {
      params: botIdParamsSchema,
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { days } = request.query as { days?: number };
    const result = await getBotEquityCurve(id, request.user.userId, days ?? 30);
    return { data: result };
  });

  // GET /:id/trade-markers - Get bot trade markers for candlestick overlay
  zApp.get('/:id/trade-markers', {
    schema: {
      params: botIdParamsSchema,
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { symbol, days } = request.query as { symbol?: string; days?: number };
    if (!symbol) {
      return { data: [] };
    }
    const result = await getBotTradeMarkers(id, symbol, days ?? 30);
    return { data: result };
  });

  // POST /paper-trading/setup - Setup paper trading
  zApp.post('/paper-trading/setup', {
    schema: {
      body: paperTradingSetupBodySchema,
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { initialFunds } = request.body;
    return reply.status(200).send({
      data: {
        success: true,
        virtualBalance: initialFunds || 10_000,
        message: 'Paper trading environment ready. Start a shadow mode on any bot to begin trading.',
      },
    });
  });

  // GET /subscriptions/:subscriptionId
  zApp.get('/subscriptions/:subscriptionId', {
    schema: {
      params: subscriptionIdParamsSchema,
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { subscriptionId } = request.params;
    const result = await getSubscription(request.user.userId, subscriptionId);
    return { data: result };
  });

  // PATCH /subscriptions/:subscriptionId/user-config
  zApp.patch('/subscriptions/:subscriptionId/user-config', {
    schema: {
      params: subscriptionIdParamsSchema,
      body: updateUserConfigBodySchema,
      response: { 200: dataResponseSchema },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { subscriptionId } = request.params;
    const result = await updateUserConfig(request.user.userId, subscriptionId, request.body as Record<string, any>);
    return { data: result };
  });
}
