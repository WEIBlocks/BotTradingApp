/**
 * useBinanceKline — real-time candlestick data for BOTH crypto and stocks.
 *
 * Crypto (BTC/USDT etc.):
 *   → Direct Binance public WebSocket — wss://stream.binance.com/ws/{sym}@kline_{tf}
 *   → No auth, free, ~100ms latency
 *
 * Stocks (NVDA, TSLA/USD etc.):
 *   → Via your backend WebSocket (/ws/app) which relays Alpaca IEX stream
 *   → Backend subscribes to the symbol on Alpaca and publishes stock_price / stock_bar
 *   → Mobile receives topic="stock_price" | "stock_bar" and updates the last candle
 *
 * In both cases:
 *   - Historical seed loaded from backend REST once
 *   - Only the last forming candle is mutated — never a full reload
 *   - Auto-reconnects on drop
 */

import {useEffect, useRef, useState, useCallback} from 'react';
import {api} from '../services/api';
import {wsService} from '../services/websocket';
import type {OHLC} from '../components/charts/CandlestickChart';

// Binance interval mapping
const TF_MAP: Record<string, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m',
  '1H': '1h', '4H': '4h', '1D': '1d', '1W': '1w', '1M': '1M', 'ALL': '1d',
};

function isCryptoPair(pair: string): boolean {
  // Crypto pairs always have "/" and don't end with just "/USD" (that's stocks)
  if (!pair.includes('/')) return false;
  if (pair.endsWith('/USD') && !pair.endsWith('/USDT')) return false; // e.g. BTC/USD on Alpaca = stock
  return true;
}

function toBinanceSymbol(pair: string): string {
  return pair.replace('/', '').toLowerCase();
}

function toStockSymbol(pair: string): string {
  return pair.replace('/USD', '').toUpperCase();
}

interface BinanceKlineMsg {
  k: {t: number; T: number; o: string; h: string; l: string; c: string; x: boolean};
}

interface StockPriceMsg {
  symbol: string; price: number; change: number; changePercent: number; timestamp: string;
}

interface StockBarMsg {
  symbol: string; open: number; high: number; low: number; close: number; volume: number; timestamp: string;
}

export interface LiveCandleState {
  candles:   OHLC[];
  livePrice: number | undefined;
  loading:   boolean;
  connected: boolean;
}

export function useBinanceKline(
  pair: string | undefined,
  timeframe: string,
): LiveCandleState {
  const [candles,   setCandles]   = useState<OHLC[]>([]);
  const [livePrice, setLivePrice] = useState<number | undefined>();
  const [loading,   setLoading]   = useState(false);
  const [connected, setConnected] = useState(false);

  const candlesRef     = useRef<OHLC[]>([]);
  const wsRef          = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldConnect  = useRef(false);
  const reconnectDelay = useRef(1000);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const updateLastCandle = useCallback((candle: OHLC, isClosed = false) => {
    setLivePrice(candle.close);
    const current = candlesRef.current;
    if (current.length === 0) {
      candlesRef.current = [candle];
      setCandles([candle]);
      return;
    }
    const last = current[current.length - 1];
    const lastTime = typeof last.time === 'number' ? last.time : new Date(last.time as string).getTime();
    const candleTime = typeof candle.time === 'number' ? candle.time : new Date(candle.time as string).getTime();

    if (isClosed && candleTime > lastTime) {
      // Closed candle — finalize + start next slot
      const updated = [...current];
      updated[updated.length - 1] = candle;
      candlesRef.current = updated;
      setCandles([...updated]);
    } else if (candleTime >= lastTime) {
      // Still forming — update in place
      const updated = [...current];
      updated[updated.length - 1] = candle;
      candlesRef.current = updated;
      setCandles([...updated]);
    } else {
      // New candle after a gap
      const updated = [...current, candle];
      candlesRef.current = updated;
      setCandles([...updated]);
    }
  }, []);

  // ── Seed historical candles from backend REST ─────────────────────────────
  const loadSeedCandles = useCallback(async (p: string, tf: string) => {
    setLoading(true);
    try {
      const res = await api.get<{data: any[]}>(`/market/candles?symbol=${encodeURIComponent(p)}&timeframe=${tf}&limit=100`);
      const raw  = Array.isArray(res?.data) ? res.data : [];
      const ohlc: OHLC[] = raw.map((c: any) => ({
        time:   c.timestamp ?? c.time ?? 0,
        open:   Number(c.open),
        high:   Number(c.high),
        low:    Number(c.low),
        close:  Number(c.close),
        volume: c.volume ? Number(c.volume) : undefined,
      }));
      candlesRef.current = ohlc;
      setCandles([...ohlc]);
      if (ohlc.length > 0) setLivePrice(ohlc[ohlc.length - 1].close);
    } catch {
      // keep what we have
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Binance direct WebSocket (crypto) ─────────────────────────────────────
  const connectBinance = useCallback((binanceSymbol: string, binanceTF: string) => {
    if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }

    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${binanceSymbol}@kline_${binanceTF}`);
    wsRef.current = ws;

    ws.onopen = () => { setConnected(true); reconnectDelay.current = 1000; };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string) as BinanceKlineMsg;
        const k   = msg.k;
        updateLastCandle({
          time: k.t, open: parseFloat(k.o), high: parseFloat(k.h),
          low: parseFloat(k.l), close: parseFloat(k.c),
        }, k.x);
      } catch {}
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      if (shouldConnect.current) {
        reconnectTimer.current = setTimeout(() => {
          reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30000);
          if (shouldConnect.current) connectBinance(binanceSymbol, binanceTF);
        }, reconnectDelay.current);
      }
    };

    ws.onerror = () => ws.close();
  }, [updateLastCandle]);

  // ── Stock real-time via backend /ws/app relay ─────────────────────────────
  // The backend subscribes to Alpaca IEX stream for this symbol and publishes
  // stock_price (every trade tick) and stock_bar (1-min OHLCV) to Redis → WS.
  const connectStock = useCallback((stockSymbol: string): (() => void) => {
    setConnected(false); // will set true on first price message

    // 1-min bar accumulator — we build a live candle from bar events
    let currentBarTime = 0;

    const unsubPrice = wsService.subscribe('stock_price', (payload: unknown) => {
      const p = payload as StockPriceMsg;
      if (p.symbol !== stockSymbol) return;
      setConnected(true);
      // Update close of the current last candle with every tick
      const current = candlesRef.current;
      if (current.length === 0) return;
      const last = current[current.length - 1];
      updateLastCandle({...last, close: p.price, high: Math.max(last.high, p.price), low: Math.min(last.low, p.price)});
    });

    const unsubBar = wsService.subscribe('stock_bar', (payload: unknown) => {
      const b = payload as StockBarMsg;
      if (b.symbol !== stockSymbol) return;
      setConnected(true);
      const barMs = new Date(b.timestamp).getTime();
      const candle: OHLC = {time: barMs, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume};
      if (barMs > currentBarTime) {
        currentBarTime = barMs;
        updateLastCandle(candle, true); // treat each bar as a closed candle + start next
      } else {
        updateLastCandle(candle, false);
      }
    });

    return () => { unsubPrice(); unsubBar(); };
  }, [updateLastCandle]);

  // ── Main effect ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!pair) return;

    const isCrypto   = isCryptoPair(pair);
    const binanceSym = isCrypto ? toBinanceSymbol(pair) : '';
    const stockSym   = isCrypto ? '' : toStockSymbol(pair);
    const binanceTF  = TF_MAP[timeframe] ?? '1h';

    shouldConnect.current = true;
    candlesRef.current    = [];
    setCandles([]);
    setLivePrice(undefined);
    setConnected(false);

    let cleanupStock: (() => void) | null = null;

    loadSeedCandles(pair, timeframe).then(() => {
      if (!shouldConnect.current) return;
      if (isCrypto) {
        connectBinance(binanceSym, binanceTF);
      } else {
        // Stock: subscribe via backend WS relay (wsService auto-connects)
        cleanupStock = connectStock(stockSym);
      }
    });

    return () => {
      shouldConnect.current = false;
      if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
      cleanupStock?.();
    };
  }, [pair, timeframe, loadSeedCandles, connectBinance, connectStock]);

  return {candles, livePrice, loading, connected};
}
