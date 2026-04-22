import { FastifyRequest } from 'fastify';
import { WebSocket } from 'ws';
/**
 * Live Trades Feed: /ws/trades
 */
export declare function handleTradesWs(socket: WebSocket, request: FastifyRequest): Promise<void>;
/**
 * Arena Live Feed: /ws/arena/:sessionId
 */
export declare function handleArenaWs(socket: WebSocket, request: FastifyRequest): Promise<void>;
/**
 * Bot Live Decision Feed: /ws/bot/:botId/decisions
 * Real-time stream of bot trading decisions (BUY/SELL/HOLD with reasoning)
 */
export declare function handleBotDecisionsWs(socket: WebSocket, request: FastifyRequest): Promise<void>;
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
export declare function handleAppWs(socket: WebSocket, request: FastifyRequest): Promise<void>;
/**
 * Notifications Feed: /ws/notifications
 */
export declare function handleNotificationsWs(socket: WebSocket, request: FastifyRequest): Promise<void>;
