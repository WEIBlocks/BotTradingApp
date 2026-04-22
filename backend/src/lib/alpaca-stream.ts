/**
 * AlpacaStreamService — singleton that manages ONE Alpaca market-data WebSocket.
 *
 * Alpaca's free IEX data stream: wss://stream.data.alpaca.markets/v2/iex
 * (Paper key works — no live account needed for market data)
 *
 * Responsibilities:
 *  - Connect once, reconnect on drop with backoff
 *  - Dynamically subscribe/unsubscribe symbols as users connect/disconnect
 *  - On each trade/quote tick: publish to Redis `stock:price:{SYMBOL}` channel
 *    so /ws/app can fan-out to all connected mobile clients watching that symbol
 *
 * Redis message shape:
 *   { symbol, price, change, changePercent, timestamp }
 */

import WebSocket from 'ws';
import { env } from '../config/env.js';
import { publishMessage } from '../config/redis.js';

interface AlpacaTrade {
  T: 't';      // message type = trade
  S: string;   // symbol
  p: number;   // price
  s: number;   // size
  t: string;   // timestamp ISO
}

interface AlpacaBar {
  T: 'b';
  S: string;
  o: number; h: number; l: number; c: number; v: number;
  t: string;
}

type AlpacaMsg = AlpacaTrade | AlpacaBar | { T: string; [k: string]: any };

class AlpacaStreamService {
  private ws: WebSocket | null = null;
  private authenticated = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 2000;
  private shouldRun = false;

  // ref-counted symbol subscriptions: symbol → number of active subscribers
  private symbolRefs = new Map<string, number>();

  // last known price per symbol (for change% calculation)
  private prevPrices = new Map<string, number>();

  // ── Public API ────────────────────────────────────────────────────────────

  /** Call when a user connects and is watching these stock symbols */
  addSymbols(symbols: string[]) {
    const toSubscribe: string[] = [];
    for (const s of symbols) {
      const sym = s.toUpperCase().replace('/USD', '');
      const prev = this.symbolRefs.get(sym) ?? 0;
      this.symbolRefs.set(sym, prev + 1);
      if (prev === 0) toSubscribe.push(sym); // new symbol, need to subscribe
    }
    if (toSubscribe.length > 0) {
      if (!this.shouldRun) this.start();
      else this.subscribeSymbols(toSubscribe);
    }
  }

  /** Call when a user disconnects */
  removeSymbols(symbols: string[]) {
    for (const s of symbols) {
      const sym = s.toUpperCase().replace('/USD', '');
      const prev = this.symbolRefs.get(sym) ?? 0;
      if (prev <= 1) {
        this.symbolRefs.delete(sym);
        this.unsubscribeSymbols([sym]);
      } else {
        this.symbolRefs.set(sym, prev - 1);
      }
    }
    if (this.symbolRefs.size === 0) this.stop();
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private start() {
    this.shouldRun = true;
    this.connect();
  }

  private stop() {
    this.shouldRun = false;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.ws?.close();
    this.ws = null;
    this.authenticated = false;
  }

  private connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;

    // Use paper feed — same data, works with paper/live keys
    const url = 'wss://stream.data.alpaca.markets/v2/iex';
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.on('open', () => {
      this.reconnectDelay = 2000;
      // Authenticate immediately on open
      ws.send(JSON.stringify({
        action: 'auth',
        key:    env.ALPACA_API_KEY,
        secret: env.ALPACA_API_SECRET,
      }));
    });

    ws.on('message', (raw: Buffer | string) => {
      try {
        const msgs: AlpacaMsg[] = JSON.parse(raw.toString());
        for (const msg of msgs) {
          this.handleMessage(msg);
        }
      } catch {}
    });

    ws.on('close', () => {
      this.ws = null;
      this.authenticated = false;
      if (this.shouldRun && this.symbolRefs.size > 0) {
        this.scheduleReconnect();
      }
    });

    ws.on('error', () => ws.close());
  }

  private handleMessage(msg: AlpacaMsg) {
    switch (msg.T) {
      case 'success':
        if (msg.msg === 'authenticated') {
          this.authenticated = true;
          // Subscribe to all currently tracked symbols
          const syms = Array.from(this.symbolRefs.keys());
          if (syms.length > 0) this.subscribeSymbols(syms);
        }
        break;

      case 't': {
        // Trade tick — most accurate real-time price
        const t = msg as AlpacaTrade;
        const sym = t.S;
        const price = t.p;
        const prev = this.prevPrices.get(sym);
        const change = prev ? price - prev : 0;
        const changePercent = prev && prev > 0 ? (change / prev) * 100 : 0;
        this.prevPrices.set(sym, price);

        publishMessage(`stock:price:${sym}`, {
          symbol:        sym,
          price,
          change,
          changePercent,
          timestamp:     t.t,
        }).catch(() => {});
        break;
      }

      case 'b': {
        // Bar (1-min OHLCV) — use close as latest price when no recent trade
        const b = msg as AlpacaBar;
        const sym = b.S;
        if (!this.prevPrices.has(sym)) {
          this.prevPrices.set(sym, b.c);
        }
        publishMessage(`stock:bar:${sym}`, {
          symbol:    sym,
          open:      b.o,
          high:      b.h,
          low:       b.l,
          close:     b.c,
          volume:    b.v,
          timestamp: b.t,
        }).catch(() => {});
        break;
      }

      case 'error':
        console.warn('[AlpacaStream] Error:', msg.msg ?? msg);
        break;
    }
  }

  private subscribeSymbols(symbols: string[]) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.authenticated) return;
    this.ws.send(JSON.stringify({
      action: 'subscribe',
      trades: symbols,
      bars:   symbols,
    }));
    console.log(`[AlpacaStream] Subscribed to: ${symbols.join(', ')}`);
  }

  private unsubscribeSymbols(symbols: string[]) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.authenticated) return;
    this.ws.send(JSON.stringify({
      action: 'unsubscribe',
      trades: symbols,
      bars:   symbols,
    }));
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 120_000); // max 2 min backoff
      this.connect();
    }, this.reconnectDelay);
  }

  /** Seed prevPrices from REST snapshot so first tick has a real change% */
  async seedPrevPrices(symbols: string[]) {
    if (symbols.length === 0) return;
    try {
      const Alpaca = (await import('@alpacahq/alpaca-trade-api')).default;
      const client = new Alpaca({
        keyId:     env.ALPACA_API_KEY || 'PLACEHOLDER',
        secretKey: env.ALPACA_API_SECRET || 'PLACEHOLDER',
        paper:     true,
        usePolygon: false,
      });
      const snapshots = await client.getSnapshots(symbols).catch(() => ({}));
      for (const [sym, snap] of Object.entries(snapshots as Record<string, any>)) {
        const price = snap?.latestTrade?.p ?? snap?.dailyBar?.c ?? 0;
        if (price > 0) this.prevPrices.set(sym.toUpperCase(), price);
      }
    } catch {}
  }
}

// Export singleton
export const alpacaStream = new AlpacaStreamService();
