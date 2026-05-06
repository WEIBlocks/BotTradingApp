import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { authenticate } from '../../middleware/authenticate.js';
import { requireSubscription, getActiveProSubscription } from '../../middleware/requireSubscription.js';
import { SubscriptionRequiredError } from '../../middleware/requireSubscription.js';
import { createBot, updateBot, deleteBot, setBotAvatar, addFavorite, removeFavorite, isFavorited, getUserFavorites, getBotForEdit, pauseBot, stopBot, resumeBot, purchaseBot, startShadowMode, pauseShadowSession, resumeShadowSession, stopShadowSession, getShadowResults, getUserShadowSessions, getUserActiveBots, addReview, backtestBot, getPaperTradingStatus, activateLiveMode, getBotDecisions, getLeaderboard, compareBots, startCopyTrading, stopCopyTrading, getBotEquityCurve, getBotTradeMarkers, updateUserConfig, getSubscription, getBotFeedStats, getPublicLiveStats, getShadowSessionLiveStats, getMyLiveStats, } from './bots.service.js';
import { botIdParamsSchema, createBotBodySchema, updateBotBodySchema, purchaseBotBodySchema, shadowModeBodySchema, reviewBodySchema, backtestBodySchema, paperTradingSetupBodySchema, dataResponseSchema, updateUserConfigBodySchema, subscriptionIdParamsSchema, } from './bots.schema.js';
// ─── Uploads directory (shared with the training module) ───────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, '..', '..', '..', 'uploads');
const ALLOWED_AVATAR_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);
// ─── Simple in-memory cache for getUserActiveBots (per user, 30s TTL) ────────
const activeBotsCache = new Map();
const ACTIVE_BOTS_TTL = 30_000;
function getActiveBotsCache(userId) {
    const entry = activeBotsCache.get(userId);
    if (entry && Date.now() - entry.at < ACTIVE_BOTS_TTL)
        return entry.data;
    return null;
}
function setActiveBotsCache(userId, data) {
    activeBotsCache.set(userId, { data, at: Date.now() });
}
export function invalidateActiveBotsCache(userId) {
    activeBotsCache.delete(userId);
}
export async function botsRoutes(app) {
    const zApp = app.withTypeProvider();
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
    // DELETE /:id - Delete a bot (creator only, blocked if anyone is running it)
    zApp.delete('/:id', {
        schema: {
            params: botIdParamsSchema,
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request, reply) => {
        const { id } = request.params;
        const result = await deleteBot(request.user.userId, id);
        invalidateActiveBotsCache(request.user.userId);
        return { data: result };
    });
    // POST /:id/avatar - Upload an image for the bot (creator only).
    //
    // Multipart body with a single image file. Saves to /uploads/ and updates
    // bots.avatarUrl. Returns the updated bot. Old avatar files are left on
    // disk (cheap; the row only ever references one URL at a time).
    app.post('/:id/avatar', {
        preHandler: [authenticate],
    }, async (request, reply) => {
        const { id } = request.params;
        const data = await request.file();
        if (!data)
            return reply.status(400).send({ error: 'No file provided' });
        const mime = (data.mimetype || '').toLowerCase();
        if (!ALLOWED_AVATAR_MIME.has(mime)) {
            return reply.status(400).send({ error: 'Only JPEG, PNG, WebP, or GIF images are allowed' });
        }
        if (!fs.existsSync(UPLOADS_DIR))
            fs.mkdirSync(UPLOADS_DIR, { recursive: true });
        const safeName = path.basename(data.filename || 'avatar.jpg');
        const ext = path.extname(safeName) || (mime === 'image/png' ? '.png' : '.jpg');
        const uniqueName = `bot-${id}-${randomUUID()}${ext}`;
        const filePath = path.join(UPLOADS_DIR, uniqueName);
        const writeStream = fs.createWriteStream(filePath);
        await new Promise((resolve, reject) => {
            data.file.pipe(writeStream);
            data.file.on('error', reject);
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
        });
        const url = `/uploads/${uniqueName}`;
        const bot = await setBotAvatar(request.user.userId, id, url);
        return { data: bot };
    });
    // DELETE /:id/avatar - Remove the bot's image, fall back to letter+color.
    app.delete('/:id/avatar', {
        preHandler: [authenticate],
    }, async (request) => {
        const { id } = request.params;
        const bot = await setBotAvatar(request.user.userId, id, null);
        return { data: bot };
    });
    // ─── Favorites ────────────────────────────────────────────────────────
    // GET /user/favorites - list this user's favorited bots (with stats).
    // Placed BEFORE /:id routes so the literal path takes precedence.
    zApp.get('/user/favorites', {
        schema: { response: { 200: dataResponseSchema }, security: [{ bearerAuth: [] }] },
    }, async (request) => {
        const favorites = await getUserFavorites(request.user.userId);
        return { data: favorites };
    });
    // POST /:id/favorite - add the bot to favorites (idempotent).
    zApp.post('/:id/favorite', {
        schema: {
            params: botIdParamsSchema,
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request) => {
        const { id } = request.params;
        const result = await addFavorite(request.user.userId, id);
        return { data: result };
    });
    // DELETE /:id/favorite - remove the bot from favorites.
    zApp.delete('/:id/favorite', {
        schema: {
            params: botIdParamsSchema,
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request) => {
        const { id } = request.params;
        const result = await removeFavorite(request.user.userId, id);
        return { data: result };
    });
    // GET /:id/favorite - check whether this bot is in the user's favorites.
    zApp.get('/:id/favorite', {
        schema: {
            params: botIdParamsSchema,
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request) => {
        const { id } = request.params;
        const result = await isFavorited(request.user.userId, id);
        return { data: result };
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
        const { mode, allocatedAmount, minOrderValue, exchangeConnId } = request.body;
        // Live mode requires an active Pro subscription
        if (mode === 'live') {
            const sub = await getActiveProSubscription(request.user.userId);
            if (!sub)
                throw new SubscriptionRequiredError();
        }
        const result = await purchaseBot(request.user.userId, id, mode, allocatedAmount, minOrderValue, exchangeConnId);
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
        const cached = getActiveBotsCache(uid);
        if (cached)
            return { data: cached };
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
    // POST /:id/activate-live - Activate live trading (Pro only)
    zApp.post('/:id/activate-live', {
        schema: {
            params: botIdParamsSchema,
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
        preHandler: [requireSubscription],
    }, async (request, reply) => {
        const { id } = request.params;
        const { exchangeConnId, allocatedAmount } = request.body;
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
        const { limit, offset, mode } = request.query;
        const result = await getBotDecisions(request.user.userId, id, limit, offset, mode);
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
        const { mode } = request.query;
        const result = await getBotFeedStats(request.user.userId, id, mode);
        return { data: result };
    });
    // GET /:id/public-live-stats - Aggregated live stats for all live users of this bot
    zApp.get('/:id/public-live-stats', {
        schema: {
            params: botIdParamsSchema,
            response: { 200: dataResponseSchema },
        },
    }, async (request, reply) => {
        const { id } = request.params;
        const result = await getPublicLiveStats(id);
        return { data: result };
    });
    // GET /shadow-sessions/:id/live-stats - Current user's shadow session detailed stats
    zApp.get('/shadow-sessions/:id/live-stats', {
        schema: {
            params: botIdParamsSchema,
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request, reply) => {
        const { id } = request.params;
        const result = await getShadowSessionLiveStats(request.user.userId, id);
        return { data: result };
    });
    // GET /:id/my-live-stats - Current user's personal live trading stats for a bot
    zApp.get('/:id/my-live-stats', {
        schema: {
            params: botIdParamsSchema,
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request, reply) => {
        const { id } = request.params;
        const result = await getMyLiveStats(request.user.userId, id);
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
        const { ids } = request.query;
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
        const { allocationPercent, isPaper } = request.body;
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
        const { days } = request.query;
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
        const { symbol, days } = request.query;
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
        const result = await updateUserConfig(request.user.userId, subscriptionId, request.body);
        return { data: result };
    });
}
