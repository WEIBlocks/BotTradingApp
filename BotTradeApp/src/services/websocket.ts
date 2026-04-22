/**
 * WebSocketService — singleton that manages the connection to your backend WS.
 *
 * Responsibilities:
 *  - Connect once, reconnect on drop with exponential backoff
 *  - Multiplex subscriptions: any component subscribes to a topic and gets
 *    a cleanup function back (pub/sub pattern)
 *  - Send the auth token on connect so the backend can authenticate
 *
 * Topics emitted from backend (src/ws/ handlers):
 *   "trade"            → { botId, symbol, side, price, amount, pnl, mode }
 *   "equity_update"    → { botId, equityData: number[], totalPnl: number }
 *   "portfolio_update" → { equityData: number[], totalValue: number }
 *   "notification"     → { ... }
 */

import {API_BASE_URL} from '../config/api';
import {storage} from './storage';

// Derive WS URL from HTTP URL
function toWsUrl(httpUrl: string): string {
  return httpUrl.replace(/^http/, 'ws') + '/ws/app';
}

const WS_URL = toWsUrl(API_BASE_URL);

type Listener = (payload: unknown) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private shouldReconnect = false;
  private connectionCount = 0;
  private sendQueue: string[] = [];
  // Track active subscriptions so they re-send after reconnect
  activeMarketSub: {pairs: string[]; exchange: string} | null = null;
  activeStockSub: {symbols: string[]} | null = null;

  // ── Send message to backend ───────────────────────────────────────────────
  send(msg: {topic: string; payload: unknown}): void {
    // Track active market sub so it auto-resubscribes after reconnect
    if (msg.topic === 'subscribe_market') {
      this.activeMarketSub = msg.payload as {pairs: string[]; exchange: string};
    } else if (msg.topic === 'unsubscribe_market') {
      this.activeMarketSub = null;
    } else if (msg.topic === 'subscribe_stock') {
      this.activeStockSub = msg.payload as {symbols: string[]};
    } else if (msg.topic === 'unsubscribe_stock') {
      this.activeStockSub = null;
    }
    const str = JSON.stringify(msg);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(str);
    } else {
      this.sendQueue.push(str);
    }
  }

  // ── Subscribe ─────────────────────────────────────────────────────────────

  subscribe(topic: string, fn: Listener): () => void {
    if (!this.listeners.has(topic)) {
      this.listeners.set(topic, new Set());
    }
    this.listeners.get(topic)!.add(fn);
    this.connectionCount++;
    if (this.connectionCount === 1) this.connect();

    return () => {
      this.listeners.get(topic)?.delete(fn);
      this.connectionCount = Math.max(0, this.connectionCount - 1);
      if (this.connectionCount === 0) this.disconnect();
    };
  }

  // ── Connect ───────────────────────────────────────────────────────────────

  private async connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;

    this.shouldReconnect = true;

    const token = await storage.getAccessToken();
    const url   = token ? `${WS_URL}?token=${encodeURIComponent(token)}` : WS_URL;

    try {
      const ws = new WebSocket(url);
      this.ws  = ws;

      ws.onopen = () => {
        this.reconnectDelay = 1000;
        // Flush any messages queued before socket was ready
        while (this.sendQueue.length > 0) {
          const msg = this.sendQueue.shift()!;
          if (ws.readyState === WebSocket.OPEN) ws.send(msg);
        }
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data as string) as {topic: string; payload: unknown};
          const fns = this.listeners.get(msg.topic);
          if (fns) fns.forEach(fn => fn(msg.payload));
        } catch {}
      };

      ws.onclose = () => {
        this.ws = null;
        // Re-queue active subscriptions so they resume after reconnect
        if (this.activeMarketSub) {
          this.sendQueue.push(JSON.stringify({ topic: 'subscribe_market', payload: this.activeMarketSub }));
        }
        if (this.activeStockSub) {
          this.sendQueue.push(JSON.stringify({ topic: 'subscribe_stock', payload: this.activeStockSub }));
        }
        if (this.shouldReconnect && this.connectionCount > 0) {
          this.scheduleReconnect();
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {}
  }

  // ── Disconnect ────────────────────────────────────────────────────────────

  private disconnect() {
    this.shouldReconnect = false;
    this.sendQueue = [];
    this.activeMarketSub = null;
    this.activeStockSub = null;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.ws?.close();
    this.ws = null;
    this.reconnectDelay = 1000;
  }

  // ── Reconnect with backoff ────────────────────────────────────────────────

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
      this.connect();
    }, this.reconnectDelay);
  }
}

export const wsService = new WebSocketService();
