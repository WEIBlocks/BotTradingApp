import { FastifyRequest } from 'fastify';
import { WebSocket } from 'ws';
import { verifyAccessToken, TokenPayload } from '../../lib/jwt.js';
import { getSubscriber } from '../../config/redis.js';
import { db } from '../../config/database.js';
import { trades } from '../../db/schema/trades.js';
import { notifications } from '../../db/schema/notifications.js';
import { eq, desc } from 'drizzle-orm';

/**
 * Authenticate a WebSocket connection via query param ?token=JWT_TOKEN
 */
function authenticateWs(request: FastifyRequest): TokenPayload | null {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const token = url.searchParams.get('token');
  if (!token) return null;
  try {
    return verifyAccessToken(token);
  } catch {
    return null;
  }
}

function sendJson(socket: WebSocket, data: unknown): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(data));
  }
}

// ─── Shared subscriber with per-channel listener tracking ────────────────────
// Uses a single Redis subscriber connection for ALL WebSocket clients.
// Each channel maps to a set of listener callbacks.

const channelListeners = new Map<string, Set<(message: string) => void>>();
let subscriberReady = false;

function getSharedSubscriber() {
  const sub = getSubscriber();
  if (!subscriberReady) {
    sub.on('message', (channel: string, message: string) => {
      const listeners = channelListeners.get(channel);
      if (listeners) {
        for (const fn of listeners) {
          try { fn(message); } catch { /* ignore */ }
        }
      }
    });
    subscriberReady = true;
  }
  return sub;
}

async function subscribeChannel(channel: string, listener: (message: string) => void): Promise<void> {
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
    } catch {
      console.warn(`Redis subscribe failed for channel: ${channel}`);
    }
  }
}

async function unsubscribeChannel(channel: string, listener: (message: string) => void): Promise<void> {
  const listeners = channelListeners.get(channel);
  if (!listeners) return;
  listeners.delete(listener);

  if (listeners.size === 0) {
    channelListeners.delete(channel);
    try {
      const sub = getSharedSubscriber();
      await sub.unsubscribe(channel);
    } catch { /* ignore */ }
  }
}

// ─── WebSocket Handlers ──────────────────────────────────────────────────────

/**
 * Live Trades Feed: /ws/trades
 */
export async function handleTradesWs(socket: WebSocket, request: FastifyRequest): Promise<void> {
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
  } catch (err) {
    console.warn('Failed to fetch recent trades:', (err as Error).message);
  }

  // Subscribe to Redis pub/sub for live trade updates
  const channel = `trades:${user.userId}`;
  const listener = (message: string) => {
    try { sendJson(socket, JSON.parse(message)); } catch { /* ignore */ }
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
    } else {
      clearInterval(pingInterval);
    }
  }, 30000);

  socket.on('close', () => clearInterval(pingInterval));
}

/**
 * Arena Live Feed: /ws/arena/:sessionId
 */
export async function handleArenaWs(socket: WebSocket, request: FastifyRequest): Promise<void> {
  const user = authenticateWs(request);
  if (!user) {
    sendJson(socket, { type: 'error', message: 'Unauthorized' });
    socket.close(4001, 'Unauthorized');
    return;
  }

  const { sessionId } = request.params as { sessionId: string };
  if (!sessionId) {
    sendJson(socket, { type: 'error', message: 'Missing sessionId' });
    socket.close(4002, 'Missing sessionId');
    return;
  }

  const channel = `arena:${sessionId}`;
  const listener = (message: string) => {
    try { sendJson(socket, JSON.parse(message)); } catch { /* ignore */ }
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
    } else {
      clearInterval(pingInterval);
    }
  }, 30000);

  socket.on('close', () => clearInterval(pingInterval));
}

/**
 * Bot Live Decision Feed: /ws/bot/:botId/decisions
 * Real-time stream of bot trading decisions (BUY/SELL/HOLD with reasoning)
 */
export async function handleBotDecisionsWs(socket: WebSocket, request: FastifyRequest): Promise<void> {
  const user = authenticateWs(request);
  if (!user) {
    sendJson(socket, { type: 'error', message: 'Unauthorized' });
    socket.close(4001, 'Unauthorized');
    return;
  }

  const { botId } = request.params as { botId: string };
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
      .where(
        and(
          eq(botDecisions.botId, botId),
          eq(botDecisions.userId, user.userId),
        ),
      )
      .orderBy(desc(botDecisions.createdAt))
      .limit(30);

    sendJson(socket, { type: 'initial_decisions', data: recentDecisions.reverse() });
  } catch (err) {
    console.warn('Failed to fetch recent decisions:', (err as Error).message);
  }

  // Subscribe to Redis pub/sub for live decision updates
  // Use user-specific channel so each user only sees their own decisions
  const channel = `bot:decisions:${botId}:${user.userId}`;
  const fallbackChannel = `bot:decisions:${botId}`;
  const listener = (message: string) => {
    try {
      const parsed = JSON.parse(message);
      // Only forward if this decision belongs to the current user
      const data = parsed.data || parsed;
      if (!data.userId || data.userId === user.userId) {
        sendJson(socket, parsed);
      }
    } catch { /* ignore */ }
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
    } else {
      clearInterval(pingInterval);
    }
  }, 30000);

  socket.on('close', () => clearInterval(pingInterval));
}

/**
 * Notifications Feed: /ws/notifications
 */
export async function handleNotificationsWs(socket: WebSocket, request: FastifyRequest): Promise<void> {
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
  } catch (err) {
    console.warn('Failed to fetch recent notifications:', (err as Error).message);
  }

  const channel = `notifications:${user.userId}`;
  const listener = (message: string) => {
    try { sendJson(socket, JSON.parse(message)); } catch { /* ignore */ }
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
    } else {
      clearInterval(pingInterval);
    }
  }, 30000);

  socket.on('close', () => clearInterval(pingInterval));
}
