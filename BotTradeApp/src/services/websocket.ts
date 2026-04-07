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
  private connectionCount = 0; // ref-counting: connect when first subscriber, disconnect when last leaves

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
        this.reconnectDelay = 1000; // reset backoff on success
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
