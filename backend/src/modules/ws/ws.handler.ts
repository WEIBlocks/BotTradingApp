import { FastifyRequest } from 'fastify';
import { WebSocket } from 'ws';
import Redis from 'ioredis';
import { verifyAccessToken, TokenPayload } from '../../lib/jwt.js';
import { env } from '../../config/env.js';
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

/**
 * Create a dedicated Redis subscriber for a single WebSocket connection.
 * Returns null if Redis is not available (graceful degradation).
 */
function createConnectionSubscriber(): Redis | null {
  try {
    const sub = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times) => {
        if (times > 2) return null;
        return Math.min(times * 200, 1000);
      },
      lazyConnect: true,
    });
    sub.on('error', () => {
      // Suppress errors for individual connection subscribers
    });
    return sub;
  } catch {
    return null;
  }
}

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
  const subscriber = createConnectionSubscriber();
  let subscribed = false;

  if (subscriber) {
    try {
      await subscriber.connect();
      subscriber.on('message', (ch: string, message: string) => {
        if (ch === channel) {
          try {
            sendJson(socket, JSON.parse(message));
          } catch {
            // Ignore malformed messages
          }
        }
      });
      await subscriber.subscribe(channel);
      subscribed = true;
    } catch {
      console.warn('Redis subscriber not available for trades feed');
    }
  }

  // Cleanup on close
  const cleanup = async () => {
    if (subscriber && subscribed) {
      await subscriber.unsubscribe(channel).catch(() => {});
      await subscriber.quit().catch(() => {});
    }
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
  const subscriber = createConnectionSubscriber();
  let subscribed = false;

  if (subscriber) {
    try {
      await subscriber.connect();
      subscriber.on('message', (ch: string, message: string) => {
        if (ch === channel) {
          try {
            sendJson(socket, JSON.parse(message));
          } catch {
            // Ignore malformed messages
          }
        }
      });
      await subscriber.subscribe(channel);
      subscribed = true;
    } catch {
      console.warn('Redis subscriber not available for arena feed');
    }
  }

  sendJson(socket, { type: 'connected', sessionId });

  const cleanup = async () => {
    if (subscriber && subscribed) {
      await subscriber.unsubscribe(channel).catch(() => {});
      await subscriber.quit().catch(() => {});
    }
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
  const subscriber = createConnectionSubscriber();
  let subscribed = false;

  if (subscriber) {
    try {
      await subscriber.connect();
      subscriber.on('message', (ch: string, message: string) => {
        if (ch === channel) {
          try {
            sendJson(socket, JSON.parse(message));
          } catch {
            // Ignore malformed messages
          }
        }
      });
      await subscriber.subscribe(channel);
      subscribed = true;
    } catch {
      console.warn('Redis subscriber not available for notifications feed');
    }
  }

  const cleanup = async () => {
    if (subscriber && subscribed) {
      await subscriber.unsubscribe(channel).catch(() => {});
      await subscriber.quit().catch(() => {});
    }
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
