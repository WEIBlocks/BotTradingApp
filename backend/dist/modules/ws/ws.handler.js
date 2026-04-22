import { WebSocket } from 'ws';
import { verifyAccessToken } from '../../lib/jwt.js';
import { getSubscriber } from '../../config/redis.js';
import { db } from '../../config/database.js';
import { trades } from '../../db/schema/trades.js';
import { notifications } from '../../db/schema/notifications.js';
import { bots, botSubscriptions } from '../../db/schema/bots.js';
import { eq, desc, and } from 'drizzle-orm';
import { alpacaStream } from '../../lib/alpaca-stream.js';
import { cryptoStream } from '../../lib/crypto-stream.js';
/**
 * Authenticate a WebSocket connection via query param ?token=JWT_TOKEN
 */
function authenticateWs(request) {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const token = url.searchParams.get('token');
    if (!token)
        return null;
    try {
        return verifyAccessToken(token);
    }
    catch {
        return null;
    }
}
function sendJson(socket, data) {
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
    }
}
// ─── Shared subscriber with per-channel listener tracking ────────────────────
// Uses a single Redis subscriber connection for ALL WebSocket clients.
// Each channel maps to a set of listener callbacks.
const channelListeners = new Map();
let subscriberReady = false;
function getSharedSubscriber() {
    const sub = getSubscriber();
    if (!subscriberReady) {
        sub.on('message', (channel, message) => {
            const listeners = channelListeners.get(channel);
            if (listeners) {
                for (const fn of listeners) {
                    try {
                        fn(message);
                    }
                    catch { /* ignore */ }
                }
            }
        });
        subscriberReady = true;
    }
    return sub;
}
async function subscribeChannel(channel, listener) {
    let listeners = channelListeners.get(channel);
    const isNew = !listeners || listeners.size === 0;
    if (!listeners) {
        listeners = new Set();
        channelListeners.set(channel, listeners);
    }
    listeners.add(listener);
    if (isNew) {
        try {
            const sub = getSharedSubscriber();
            await sub.subscribe(channel);
        }
        catch {
            console.warn(`Redis subscribe failed for channel: ${channel}`);
        }
    }
}
async function unsubscribeChannel(channel, listener) {
    const listeners = channelListeners.get(channel);
    if (!listeners)
        return;
    listeners.delete(listener);
    if (listeners.size === 0) {
        channelListeners.delete(channel);
        try {
            const sub = getSharedSubscriber();
            await sub.unsubscribe(channel);
        }
        catch { /* ignore */ }
    }
}
// ─── WebSocket Handlers ──────────────────────────────────────────────────────
/**
 * Live Trades Feed: /ws/trades
 */
export async function handleTradesWs(socket, request) {
    const user = authenticateWs(request);
    if (!user) {
        sendJson(socket, { type: 'error', message: 'Unauthorized' });
        socket.close(4001, 'Unauthorized');
        return;
    }
    // Send recent trades on connection
    try {
        const recentTrades = await db
            .select()
            .from(trades)
            .where(eq(trades.userId, user.userId))
            .orderBy(desc(trades.executedAt))
            .limit(50);
        sendJson(socket, { type: 'initial_trades', data: recentTrades });
    }
    catch (err) {
        console.warn('Failed to fetch recent trades:', err.message);
    }
    // Subscribe to Redis pub/sub for live trade updates
    const channel = `trades:${user.userId}`;
    const listener = (message) => {
        try {
            sendJson(socket, JSON.parse(message));
        }
        catch { /* ignore */ }
    };
    await subscribeChannel(channel, listener);
    const cleanup = async () => {
        await unsubscribeChannel(channel, listener);
    };
    socket.on('close', cleanup);
    socket.on('error', cleanup);
    // Keep-alive ping
    const pingInterval = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
            socket.ping();
        }
        else {
            clearInterval(pingInterval);
        }
    }, 30000);
    socket.on('close', () => clearInterval(pingInterval));
}
/**
 * Arena Live Feed: /ws/arena/:sessionId
 */
export async function handleArenaWs(socket, request) {
    const user = authenticateWs(request);
    if (!user) {
        sendJson(socket, { type: 'error', message: 'Unauthorized' });
        socket.close(4001, 'Unauthorized');
        return;
    }
    const { sessionId } = request.params;
    if (!sessionId) {
        sendJson(socket, { type: 'error', message: 'Missing sessionId' });
        socket.close(4002, 'Missing sessionId');
        return;
    }
    const channel = `arena:${sessionId}`;
    const listener = (message) => {
        try {
            sendJson(socket, JSON.parse(message));
        }
        catch { /* ignore */ }
    };
    await subscribeChannel(channel, listener);
    sendJson(socket, { type: 'connected', sessionId });
    const cleanup = async () => {
        await unsubscribeChannel(channel, listener);
    };
    socket.on('close', cleanup);
    socket.on('error', cleanup);
    const pingInterval = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
            socket.ping();
        }
        else {
            clearInterval(pingInterval);
        }
    }, 30000);
    socket.on('close', () => clearInterval(pingInterval));
}
/**
 * Bot Live Decision Feed: /ws/bot/:botId/decisions
 * Real-time stream of bot trading decisions (BUY/SELL/HOLD with reasoning)
 */
export async function handleBotDecisionsWs(socket, request) {
    const user = authenticateWs(request);
    if (!user) {
        sendJson(socket, { type: 'error', message: 'Unauthorized' });
        socket.close(4001, 'Unauthorized');
        return;
    }
    const { botId } = request.params;
    if (!botId) {
        sendJson(socket, { type: 'error', message: 'Missing botId' });
        socket.close(4002, 'Missing botId');
        return;
    }
    // Send recent decisions on connection
    try {
        const { botDecisions } = await import('../../db/schema/decisions.js');
        const { and, eq, desc } = await import('drizzle-orm');
        const recentDecisions = await db
            .select()
            .from(botDecisions)
            .where(and(eq(botDecisions.botId, botId), eq(botDecisions.userId, user.userId)))
            .orderBy(desc(botDecisions.createdAt))
            .limit(30);
        sendJson(socket, { type: 'initial_decisions', data: recentDecisions.reverse() });
    }
    catch (err) {
        console.warn('Failed to fetch recent decisions:', err.message);
    }
    // Subscribe to Redis pub/sub for live decision updates
    // Use user-specific channel so each user only sees their own decisions
    const channel = `bot:decisions:${botId}:${user.userId}`;
    const fallbackChannel = `bot:decisions:${botId}`;
    const listener = (message) => {
        try {
            const parsed = JSON.parse(message);
            // Only forward if this decision belongs to the current user
            const data = parsed.data || parsed;
            if (!data.userId || data.userId === user.userId) {
                sendJson(socket, parsed);
            }
        }
        catch { /* ignore */ }
    };
    await subscribeChannel(channel, listener);
    await subscribeChannel(fallbackChannel, listener);
    sendJson(socket, { type: 'connected', botId });
    const cleanup = async () => {
        await unsubscribeChannel(channel, listener);
        await unsubscribeChannel(fallbackChannel, listener);
    };
    socket.on('close', cleanup);
    socket.on('error', cleanup);
    const pingInterval = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
            socket.ping();
        }
        else {
            clearInterval(pingInterval);
        }
    }, 30000);
    socket.on('close', () => clearInterval(pingInterval));
}
/**
 * Unified App Feed: /ws/app
 *
 * Single multiplexed WebSocket for the mobile app.
 * All messages use the envelope: { topic: string, payload: unknown }
 *
 * Topics pushed to client:
 *   "trade"                → new trade executed for this user
 *   "equity_update"        → live bot equity curve updated  { botId, equityData?, newPoint?, totalPnl }
 *   "portfolio_update"     → live portfolio equity updated  { equityData?, newPoint?, totalValue }
 *   "shadow_equity_update" → shadow bot equity updated      { sessionId, botId, newPoint, totalPnl, currentBalance }
 *   "notification"         → new notification
 *   "stock_price"          → real-time stock tick           { symbol, price, change, changePercent, timestamp }
 *   "stock_bar"            → 1-min OHLCV bar               { symbol, open, high, low, close, volume, timestamp }
 *   "crypto_price"         → real-time crypto tick         { symbol, price, exchange, timestamp }
 *
 * Client can send: { topic:'subscribe_market', payload:{ pairs:string[], exchange:string } }
 *                  { topic:'unsubscribe_market', payload:{ pairs:string[], exchange:string } }
 *                  { topic:'subscribe_stock', payload:{ symbols:string[] } }
 *                  { topic:'unsubscribe_stock', payload:{ symbols:string[] } }
 */
export async function handleAppWs(socket, request) {
    const user = authenticateWs(request);
    if (!user) {
        sendJson(socket, { topic: 'error', payload: { message: 'Unauthorized' } });
        socket.close(4001, 'Unauthorized');
        return;
    }
    const emit = (topic, payload) => sendJson(socket, { topic, payload });
    // ── Discover user's active stock bot pairs ─────────────────────────────
    // We subscribe to Alpaca stream for every stock symbol any of their bots trades
    let userStockSymbols = [];
    try {
        const activeSubs = await db
            .select({ config: bots.config })
            .from(botSubscriptions)
            .innerJoin(bots, eq(botSubscriptions.botId, bots.id))
            .where(and(eq(botSubscriptions.userId, user.userId), eq(botSubscriptions.status, 'active')));
        const stockSyms = new Set();
        for (const row of activeSubs) {
            const cfg = row.config;
            const pairs = cfg?.pairs ?? [];
            for (const p of pairs) {
                // Stock symbols have no '/' — e.g. "NVDA", "TSLA/USD"
                const isStock = !p.includes('/') || p.endsWith('/USD');
                if (isStock)
                    stockSyms.add(p.replace('/USD', '').toUpperCase());
            }
        }
        userStockSymbols = Array.from(stockSyms);
    }
    catch { /* non-critical */ }
    // ── Subscribe Alpaca stream for this user's stock symbols ─────────────
    if (userStockSymbols.length > 0) {
        alpacaStream.addSymbols(userStockSymbols);
        // Relay Redis stock price/bar events to this client
        const stockPriceListeners = [];
        for (const sym of userStockSymbols) {
            const priceChannel = `stock:price:${sym}`;
            const priceListener = (message) => {
                try {
                    emit('stock_price', JSON.parse(message));
                }
                catch { }
            };
            const barChannel = `stock:bar:${sym}`;
            const barListener = (message) => {
                try {
                    emit('stock_bar', JSON.parse(message));
                }
                catch { }
            };
            await subscribeChannel(priceChannel, priceListener);
            await subscribeChannel(barChannel, barListener);
            stockPriceListeners.push(() => unsubscribeChannel(priceChannel, priceListener), () => unsubscribeChannel(barChannel, barListener));
        }
        socket.on('close', async () => {
            alpacaStream.removeSymbols(userStockSymbols);
            for (const unsub of stockPriceListeners)
                unsub();
        });
    }
    // ── Subscribe to trade events ──────────────────────────────────────────
    const tradeChannel = `trades:${user.userId}`;
    const tradeListener = (message) => {
        try {
            const parsed = JSON.parse(message);
            const data = parsed.data || parsed;
            emit('trade', data);
            if (data.botId && typeof data.cumulativeEquity === 'number') {
                emit('equity_update', { botId: data.botId, newPoint: data.cumulativeEquity, totalPnl: data.totalPnl ?? 0 });
            }
            if (typeof data.portfolioEquity === 'number') {
                emit('portfolio_update', { newPoint: data.portfolioEquity, totalValue: data.portfolioValue ?? 0 });
            }
        }
        catch { }
    };
    await subscribeChannel(tradeChannel, tradeListener);
    // ── Subscribe to notification events ──────────────────────────────────
    const notifChannel = `notifications:${user.userId}`;
    const notifListener = (message) => {
        try {
            emit('notification', JSON.parse(message));
        }
        catch { }
    };
    await subscribeChannel(notifChannel, notifListener);
    // ── Subscribe to portfolio equity events ──────────────────────────────
    const portfolioChannel = `portfolio:equity:${user.userId}`;
    const portfolioListener = (message) => {
        try {
            emit('portfolio_update', JSON.parse(message));
        }
        catch { }
    };
    await subscribeChannel(portfolioChannel, portfolioListener);
    // ── Subscribe to bot equity events ────────────────────────────────────
    const botEquityChannel = `bot:equity:${user.userId}`;
    const botEquityListener = (message) => {
        try {
            emit('equity_update', JSON.parse(message));
        }
        catch { }
    };
    await subscribeChannel(botEquityChannel, botEquityListener);
    // ── Subscribe to shadow equity events (separate from live) ────────────
    const shadowEquityChannel = `shadow:equity:${user.userId}`;
    const shadowEquityListener = (message) => {
        try {
            emit('shadow_equity_update', JSON.parse(message));
        }
        catch { }
    };
    await subscribeChannel(shadowEquityChannel, shadowEquityListener);
    sendJson(socket, { topic: 'connected', payload: { userId: user.userId } });
    // ── Dynamic market subscription (crypto price streaming) ─────────────────
    // Client sends { topic:'subscribe_market', payload:{ pairs:['BTC/USDT'], exchange:'kraken' } }
    // Server subscribes cryptoStream, relays Redis ticks back as 'crypto_price' topic
    const marketUnsubs = [];
    let activeCryptoPairs = [];
    let activeCryptoExchange = '';
    // ── Dynamic stock symbol subscription (for chart viewers) ───────────────
    const stockUnsubs = [];
    let activeStockSymbols = [];
    socket.on('message', async (raw) => {
        try {
            const msg = JSON.parse(raw.toString());
            if (msg.topic === 'subscribe_market') {
                const { pairs, exchange } = msg.payload ?? {};
                if (!Array.isArray(pairs) || !exchange)
                    return;
                // Clean up previous subscriptions
                for (const u of marketUnsubs)
                    u();
                marketUnsubs.length = 0;
                if (activeCryptoPairs.length > 0) {
                    cryptoStream.removePairs(activeCryptoExchange, activeCryptoPairs);
                }
                activeCryptoPairs = pairs;
                activeCryptoExchange = exchange;
                cryptoStream.addPairs(exchange, pairs);
                // Subscribe Redis channels for each pair — also listen kucoin fallback
                for (const pair of pairs) {
                    const primaryChannel = `crypto:price:${exchange}:${pair}`;
                    const kucoinChannel = `crypto:price:kucoin:${pair}`;
                    const listener = (message) => {
                        try {
                            emit('crypto_price', JSON.parse(message));
                        }
                        catch { }
                    };
                    await subscribeChannel(primaryChannel, listener);
                    marketUnsubs.push(() => unsubscribeChannel(primaryChannel, listener));
                    if (exchange === 'kraken') {
                        await subscribeChannel(kucoinChannel, listener);
                        marketUnsubs.push(() => unsubscribeChannel(kucoinChannel, listener));
                    }
                }
            }
            else if (msg.topic === 'unsubscribe_market') {
                for (const u of marketUnsubs)
                    u();
                marketUnsubs.length = 0;
                if (activeCryptoPairs.length > 0) {
                    cryptoStream.removePairs(activeCryptoExchange, activeCryptoPairs);
                    activeCryptoPairs = [];
                    activeCryptoExchange = '';
                }
            }
            else if (msg.topic === 'subscribe_stock') {
                // Allow any client to subscribe stock symbols for chart viewing
                const { symbols } = msg.payload ?? {};
                if (!Array.isArray(symbols) || symbols.length === 0)
                    return;
                // Clean up previous stock subs
                for (const u of stockUnsubs)
                    u();
                stockUnsubs.length = 0;
                if (activeStockSymbols.length > 0)
                    alpacaStream.removeSymbols(activeStockSymbols);
                const syms = symbols.map(s => s.toUpperCase().replace('/USD', ''));
                activeStockSymbols = syms;
                alpacaStream.addSymbols(syms);
                for (const sym of syms) {
                    const priceListener = (message) => {
                        try {
                            emit('stock_price', JSON.parse(message));
                        }
                        catch { }
                    };
                    const barListener = (message) => {
                        try {
                            emit('stock_bar', JSON.parse(message));
                        }
                        catch { }
                    };
                    await subscribeChannel(`stock:price:${sym}`, priceListener);
                    await subscribeChannel(`stock:bar:${sym}`, barListener);
                    stockUnsubs.push(() => unsubscribeChannel(`stock:price:${sym}`, priceListener), () => unsubscribeChannel(`stock:bar:${sym}`, barListener));
                }
            }
            else if (msg.topic === 'unsubscribe_stock') {
                for (const u of stockUnsubs)
                    u();
                stockUnsubs.length = 0;
                if (activeStockSymbols.length > 0) {
                    alpacaStream.removeSymbols(activeStockSymbols);
                    activeStockSymbols = [];
                }
            }
        }
        catch { }
    });
    const cleanup = async () => {
        for (const u of marketUnsubs)
            u();
        if (activeCryptoPairs.length > 0)
            cryptoStream.removePairs(activeCryptoExchange, activeCryptoPairs);
        for (const u of stockUnsubs)
            u();
        if (activeStockSymbols.length > 0)
            alpacaStream.removeSymbols(activeStockSymbols);
        await unsubscribeChannel(tradeChannel, tradeListener);
        await unsubscribeChannel(notifChannel, notifListener);
        await unsubscribeChannel(portfolioChannel, portfolioListener);
        await unsubscribeChannel(botEquityChannel, botEquityListener);
        await unsubscribeChannel(shadowEquityChannel, shadowEquityListener);
    };
    socket.on('close', cleanup);
    socket.on('error', cleanup);
    const pingInterval = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN)
            socket.ping();
        else
            clearInterval(pingInterval);
    }, 25000);
    socket.on('close', () => clearInterval(pingInterval));
}
/**
 * Notifications Feed: /ws/notifications
 */
export async function handleNotificationsWs(socket, request) {
    const user = authenticateWs(request);
    if (!user) {
        sendJson(socket, { type: 'error', message: 'Unauthorized' });
        socket.close(4001, 'Unauthorized');
        return;
    }
    // Send recent notifications on connection
    try {
        const recent = await db
            .select()
            .from(notifications)
            .where(eq(notifications.userId, user.userId))
            .orderBy(desc(notifications.createdAt))
            .limit(20);
        sendJson(socket, { type: 'initial_notifications', data: recent });
    }
    catch (err) {
        console.warn('Failed to fetch recent notifications:', err.message);
    }
    const channel = `notifications:${user.userId}`;
    const listener = (message) => {
        try {
            sendJson(socket, JSON.parse(message));
        }
        catch { /* ignore */ }
    };
    await subscribeChannel(channel, listener);
    const cleanup = async () => {
        await unsubscribeChannel(channel, listener);
    };
    socket.on('close', cleanup);
    socket.on('error', cleanup);
    const pingInterval = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
            socket.ping();
        }
        else {
            clearInterval(pingInterval);
        }
    }, 30000);
    socket.on('close', () => clearInterval(pingInterval));
}
