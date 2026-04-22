/**
 * useMarketKline — real-time candlestick data, exchange-accurate.
 *
 * Crypto flow:
 *   Seed  → Binance REST public API, paginated backwards to token launch
 *           (max 1000 per request; loops until Binance returns < 1000 candles)
 *   Live  → Binance WS kline stream (direct from device)
 *   Fallback 1 (if Binance REST/WS unavailable):
 *           → Backend KuCoin relay (REST seed + price-tick WS)
 *   Fallback 2 (if KuCoin relay also unavailable):
 *           → CoinGecko public REST (historical OHLC, no auth, free tier)
 *             + price polling every 15s for live updates
 *
 * Stocks flow:
 *   Seed  → Backend Alpaca REST
 *   Live  → Backend Alpaca IEX WS relay
 *
 * Timeframes match Binance exactly:
 *   1m 3m 5m 15m 30m  (minutes)
 *   1h 2h 4h 6h 12h   (hours)
 *   1d 3d 1w 1M        (day / week / month)
 *
 * Generation guard: every pair/TF change bumps generation.current.
 * All async callbacks capture their gen at creation and discard if stale.
 */

import {useEffect, useRef, useState, useCallback} from 'react';
import {storage} from '../services/storage';
import {API_BASE_URL} from '../config/api';
import {wsService} from '../services/websocket';
import type {OHLC} from '../components/charts/CandlestickChart';

export type ExchangeId = 'binance' | 'kraken' | 'coinbase' | 'alpaca';

export interface MarketKlineState {
  candles:       OHLC[];
  livePrice:     number | undefined;
  loading:       boolean;
  loadingMore:   boolean;   // true while a manual "load more" fetch is running
  connected:     boolean;
  source:        string;
  totalCandles:  number;    // how many candles are currently loaded
  hasMore:       boolean;   // false when we've reached the token's genesis candle
  loadMore:      () => void; // call to fetch 1,000 older candles manually
}

// ─── Binance interval strings (exact API values) ─────────────────────────────
// Displayed label → Binance interval param
export const BINANCE_INTERVALS: Record<string, string> = {
  '1m':  '1m',
  '3m':  '3m',
  '5m':  '5m',
  '15m': '15m',
  '30m': '30m',
  '1h':  '1h',
  '2h':  '2h',
  '4h':  '4h',
  '6h':  '6h',
  '12h': '12h',
  '1d':  '1d',
  '3d':  '3d',
  '1w':  '1w',
  '1M':  '1M',
  // 'all' is not a Binance interval — it's the app's "default view" which uses 4h
  'all': '4h',
};

// Stock timeframes — exactly what Alpaca supports (no 1M, no 3d)
export const STOCK_INTERVALS: string[] = ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '1d', '1w'];

// Default timeframe per asset class
export const DEFAULT_CRYPTO_TF = '4h';
export const DEFAULT_STOCK_TF  = '1d';

// Crypto timeframes shown in the UI (all real Binance intervals)
export const CRYPTO_INTERVALS: string[] = [
  '1m', '3m', '5m', '15m', '30m',
  '1h', '2h', '4h', '6h', '12h',
  '1d', '3d', '1w', '1M',
];

// How many candles to load in the INITIAL seed request (before paginating)
// Binance max = 1000 per request
const INITIAL_LIMIT = 1000;

// ─── CoinGecko ID map (static — covers common + LST tokens) ─────────────────
// Keys = uppercase ticker symbol. Add new tokens here as needed.
const CG_ID_MAP: Record<string, string> = {
  // Major
  BTC: 'bitcoin', ETH: 'ethereum', BNB: 'binancecoin', SOL: 'solana',
  ADA: 'cardano', XRP: 'ripple',   DOT: 'polkadot',   DOGE: 'dogecoin',
  AVAX: 'avalanche-2', MATIC: 'matic-network', LINK: 'chainlink',
  UNI: 'uniswap', ATOM: 'cosmos', LTC: 'litecoin', BCH: 'bitcoin-cash',
  NEAR: 'near', FTM: 'fantom', ALGO: 'algorand', SAND: 'the-sandbox',
  MANA: 'decentraland', APE: 'apecoin', OP: 'optimism', ARB: 'arbitrum',
  SUI: 'sui', INJ: 'injective-protocol', SEI: 'sei-network',
  TRX: 'tron', TON: 'the-open-network', SHIB: 'shiba-inu',
  LDO: 'lido-dao', RUNE: 'thorchain', FIL: 'filecoin', HBAR: 'hedera',
  VET: 'vechain', EOS: 'eos', ZEC: 'zcash', XMR: 'monero', DASH: 'dash',
  AAVE: 'aave', SNX: 'synthetix-network-token', MKR: 'maker',
  CRV: 'curve-dao-token', COMP: 'compound-governance-token',
  // Solana LST / liquid staking tokens
  MSOL: 'msol',           // Marinade staked SOL
  JITOSOL: 'jito-staked-sol',  // JitoSOL (also seen as JITOSOL)
  BSOL: 'blazestake-staked-sol',  // BlazeStake bSOL
  STSOL: 'lido-staked-sol',  // Lido stSOL
  JSOL: 'jpool-staked-sol',   // JPool jSOL
  HSOL: 'helius-staked-sol',  // Helius hSOL
  SCNSOL: 'socean-staked-sol', // Socean scnSOL
  LAINESOL: 'laine-staked-sol',
  COMPASSSOL: 'compass-staked-sol',
  DSOL: 'daopool-staked-sol',
  // Common DeFi / other
  RAY: 'raydium', ORCA: 'orca', MNGO: 'mango-markets',
  JTO: 'jito-governance', BONK: 'bonk', WIF: 'dogwifcoin',
  JUP: 'jupiter-exchange-solana', PYTH: 'pyth-network',
  KMNO: 'kamino', DRIFT: 'drift-protocol',
  W: 'wormhole', ZETA: 'zeta-markets',
};

// Dynamic CoinGecko lookup: search by symbol when not in static map.
// Cached per session to avoid repeated API calls.
const cgIdCache = new Map<string, string | null>();

async function resolveCoinGeckoId(base: string, signal?: AbortSignal): Promise<string | null> {
  const key = base.toUpperCase();
  if (CG_ID_MAP[key]) return CG_ID_MAP[key];
  if (cgIdCache.has(key)) return cgIdCache.get(key) ?? null;

  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(base)}`,
      {signal},
    );
    if (!res.ok) { cgIdCache.set(key, null); return null; }
    const json = await res.json();
    const coins: any[] = json?.coins ?? [];
    // Find exact symbol match (case-insensitive), prefer coins with high market_cap_rank
    const match = coins.find(c => c.symbol?.toUpperCase() === key);
    const coinId = match?.id ?? null;
    cgIdCache.set(key, coinId);
    return coinId;
  } catch {
    cgIdCache.set(key, null);
    return null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toBinanceSymbol(pair: string): string {
  return pair.replace('/', '').toUpperCase();
}

// Crypto quote currencies — any pair ending with these is crypto, not a stock
const CRYPTO_QUOTES = ['/USDT', '/USDC', '/BTC', '/ETH', '/BNB', '/SOL', '/USD'];
// Known crypto base tickers — pairs like BTC/USD are crypto even though they end in /USD
const KNOWN_CRYPTO_BASES = new Set([
  'BTC','ETH','SOL','BNB','XRP','ADA','DOGE','AVAX','MATIC','POL','DOT','LINK',
  'UNI','ATOM','LTC','BCH','NEAR','FTM','ALGO','SAND','MANA','APE','OP','ARB',
  'SUI','INJ','SEI','TRX','TON','SHIB','LDO','RUNE','FIL','HBAR','VET','EOS',
  'ZEC','XMR','DASH','AAVE','SNX','MKR','CRV','COMP','PEPE','WIF','BONK',
  'JUP','JTO','PYTH','RAY','ORCA','MSOL','JITOSOL','BSOL','STSOL','W','ZETA',
]);

function isStockPair(pair: string): boolean {
  if (!pair.includes('/')) {
    // No slash — could be bare stock ticker like "AAPL" or bare crypto like "BTCUSDT"
    // Bare crypto symbols from Binance won't reach here; assume stock
    return true;
  }
  const base = pair.split('/')[0].toUpperCase();
  // If the base is a known crypto ticker, it's always crypto regardless of quote
  if (KNOWN_CRYPTO_BASES.has(base)) return false;
  // If quote is a crypto quote currency, it's crypto
  for (const q of CRYPTO_QUOTES) {
    if (pair.toUpperCase().endsWith(q)) return false;
  }
  // Everything else with a slash (AAPL/USD, TSLA/USD) is a stock
  return true;
}

/** Parse a Binance kline array row into OHLC (time in ms) */
function parseBinanceRow(c: any[]): OHLC {
  return {
    time:   Number(c[0]),
    open:   parseFloat(c[1]),
    high:   parseFloat(c[2]),
    low:    parseFloat(c[3]),
    close:  parseFloat(c[4]),
    volume: parseFloat(c[5]),
  };
}

/** Fetch one page of Binance klines. Returns [] on error. */
async function fetchBinancePage(
  symbol: string,
  interval: string,
  limit: number,
  endTime?: number,
  signal?: AbortSignal,
): Promise<OHLC[]> {
  let url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  if (endTime) url += `&endTime=${endTime}`;
  const res = await fetch(url, {signal});
  if (!res.ok) throw new Error(`Binance ${res.status}`);
  const raw: any[][] = await res.json();
  return raw
    .map(parseBinanceRow)
    .filter(c => Number(c.time) > 0 && c.open > 0);
}

function toMs(t: string | number): number {
  return typeof t === 'number' ? t : new Date(t).getTime();
}

/** Merge two sorted OHLC arrays, dedup by time (ms), keep sorted ascending. */
function mergeSorted(older: OHLC[], newer: OHLC[]): OHLC[] {
  const map = new Map<number, OHLC>();
  for (const c of older) map.set(toMs(c.time), c);
  for (const c of newer) map.set(toMs(c.time), c);
  return Array.from(map.values()).sort((a, b) => toMs(a.time) - toMs(b.time));
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMarketKline(
  pair: string | undefined,
  timeframe: string,
  _exchange: ExchangeId = 'binance',
): MarketKlineState {
  const [candles,      setCandles]      = useState<OHLC[]>([]);
  const [livePrice,    setLivePrice]    = useState<number | undefined>();
  const [loading,      setLoading]      = useState(false);
  const [loadingMore,  setLoadingMore]  = useState(false);
  const [connected,    setConnected]    = useState(false);
  const [source,       setSource]       = useState('');
  const [totalCandles, setTotalCandles] = useState(0);

  const candlesRef       = useRef<OHLC[]>([]);
  const wsRef            = useRef<WebSocket | null>(null);
  const reconnectTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldConnect    = useRef(false);
  const reconnectDelay   = useRef(1000);
  const usingFallback1   = useRef(false);  // KuCoin relay
  const usingFallback2   = useRef(false);  // CoinGecko
  const hasMoreRef       = useRef(true);   // false once Binance returns < 1000 (genesis reached)
  const binanceSymRef    = useRef('');     // current symbol for loadMore
  const binanceIntRef    = useRef('');     // current interval for loadMore
  const abortController  = useRef<AbortController | null>(null);
  // Generation counter — increment on every pair/TF change
  const generation       = useRef(0);

  // ── State helpers ───────────────────────────────────────────────────────────
  const setAll = useCallback((ohlc: OHLC[]) => {
    candlesRef.current = ohlc;
    setCandles([...ohlc]);
    setTotalCandles(ohlc.length);
    if (ohlc.length > 0) setLivePrice(ohlc[ohlc.length - 1].close);
  }, []);

  // ── updateLastCandle: called from any live WS tick ──────────────────────────
  const updateLastCandle = useCallback((candle: OHLC, _isClosed: boolean, gen: number) => {
    if (gen !== generation.current) return;
    setLivePrice(candle.close);
    const current = candlesRef.current;
    if (current.length === 0) {
      candlesRef.current = [candle];
      setCandles([candle]);
      setTotalCandles(1);
      return;
    }
    const last    = current[current.length - 1];
    const lastMs  = typeof last.time   === 'number' ? last.time   : new Date(last.time   as string).getTime();
    const newMs   = typeof candle.time === 'number' ? candle.time : new Date(candle.time as string).getTime();
    const lastSec = lastMs > 1e10 ? Math.floor(lastMs / 1000) : lastMs;
    const newSec  = newMs  > 1e10 ? Math.floor(newMs  / 1000) : newMs;

    if (newSec > lastSec) {
      const updated = [...current, candle];
      candlesRef.current = updated;
      setCandles([...updated]);
      setTotalCandles(updated.length);
    } else if (newSec === lastSec) {
      const updated = [...current];
      updated[updated.length - 1] = candle;
      candlesRef.current = updated;
      setCandles([...updated]);
    }
    // newSec < lastSec → stale, ignore
  }, []);

  const ensureSeedCandle = useCallback((price: number, gen: number) => {
    if (gen !== generation.current) return;
    if (candlesRef.current.length > 0) return;
    const now: OHLC = {time: Date.now(), open: price, high: price, low: price, close: price};
    candlesRef.current = [now];
    setCandles([now]);
    setTotalCandles(1);
    setLivePrice(price);
  }, []);

  // ── loadMore: fetch exactly 1,000 older candles on demand (manual) ───────────
  // Called by the UI "Load More" button. Fetches one page backwards from the
  // oldest candle currently loaded. Sets hasMoreRef=false when Binance returns
  // < 1000 rows (genesis reached). No-ops if loadingMore or no Binance sym set.
  const [hasMore, setHasMore] = useState(true);

  const loadMore = useCallback(async () => {
    const sym      = binanceSymRef.current;
    const interval = binanceIntRef.current;
    if (!sym || !interval) return;           // not a Binance-sourced pair
    if (loadingMore) return;                 // already fetching
    const gen = generation.current;

    setLoadingMore(true);
    try {
      const oldest  = candlesRef.current.length > 0 ? toMs(candlesRef.current[0].time) : Date.now();
      const endTime = oldest - 1;
      const rows    = await fetchBinancePage(sym, interval, 1000, endTime);
      if (gen !== generation.current) return; // pair/TF changed mid-flight

      if (rows.length === 0) {
        setHasMore(false);
        hasMoreRef.current = false;
        return;
      }

      const merged = mergeSorted(rows, candlesRef.current);
      candlesRef.current = merged;
      setCandles([...merged]);
      setTotalCandles(merged.length);

      if (rows.length < 1000) {
        // Binance gave us less than a full page — we've reached genesis
        setHasMore(false);
        hasMoreRef.current = false;
      }
    } catch {
      // Network error — leave hasMore true so user can retry
    } finally {
      if (gen === generation.current) setLoadingMore(false);
    }
  }, [loadingMore]);

  // ── Binance REST seed (initial 1000 only — further pages are manual) ─────────
  const loadBinanceSeed = useCallback(async (p: string, tf: string, gen: number, signal: AbortSignal) => {
    if (gen !== generation.current) return;
    setLoading(true);
    const sym      = toBinanceSymbol(p);
    const interval = BINANCE_INTERVALS[tf] ?? '4h';

    // Store for loadMore to use later
    binanceSymRef.current = sym;
    binanceIntRef.current = interval;

    try {
      const rows = await fetchBinancePage(sym, interval, INITIAL_LIMIT, undefined, signal);
      if (signal.aborted || gen !== generation.current) return;
      setAll(rows);
      setLoading(false);
      // If first page already < 1000, this is the entire history
      if (rows.length < INITIAL_LIMIT) {
        setHasMore(false);
        hasMoreRef.current = false;
      } else {
        setHasMore(true);
        hasMoreRef.current = true;
      }
    } catch (err: any) {
      if (signal.aborted || gen !== generation.current) return;
      setLoading(false);
      throw err; // caller handles fallback
    }
  }, [setAll]);

  // ── Fallback 1: KuCoin relay via backend ─────────────────────────────────────
  const loadKuCoinSeed = useCallback(async (p: string, tf: string, gen: number, signal: AbortSignal) => {
    if (gen !== generation.current) return;
    const interval = BINANCE_INTERVALS[tf] ?? '4h';
    const token = await storage.getAccessToken();
    const url = `${API_BASE_URL}/market/candles?symbol=${encodeURIComponent(p)}&timeframe=${interval}&limit=1000&exchange=kucoin`;
    const fetchRes = await fetch(url, {signal, headers: token ? {Authorization: `Bearer ${token}`} : {}});
    if (signal.aborted || gen !== generation.current) return;
    if (!fetchRes.ok) throw new Error(`KuCoin seed HTTP ${fetchRes.status}`);
    const res = await fetchRes.json();
    if (signal.aborted || gen !== generation.current) return;
    const payload = res?.data ?? res;
    const raw: any[] = Array.isArray(payload?.candles) ? payload.candles
                     : Array.isArray(payload?.data)    ? payload.data
                     : Array.isArray(payload)           ? payload
                     : [];
    const ohlc: OHLC[] = raw.map((c: any) => ({
      time:   c.timestamp ?? c.time ?? 0,
      open:   Number(c.open),
      high:   Number(c.high),
      low:    Number(c.low),
      close:  Number(c.close),
      volume: c.volume != null ? Number(c.volume) : undefined,
    })).filter(c => toMs(c.time) > 0 && c.open > 0)
      .sort((a, b) => toMs(a.time) - toMs(b.time));
    if (gen === generation.current) setAll(ohlc);
  }, [setAll]);

  // ── Fallback 2: CoinGecko public REST (OHLC, no auth) ───────────────────────
  // CoinGecko /coins/{id}/ohlc returns up to 365 days of OHLC candles.
  // days param: 1, 7, 14, 30, 90, 180, 365, max
  const loadCoinGeckoSeed = useCallback(async (p: string, tf: string, gen: number, signal: AbortSignal) => {
    if (gen !== generation.current) return;

    const base = p.split('/')[0].toUpperCase();
    const coinId = await resolveCoinGeckoId(base, signal);
    if (!coinId) throw new Error(`No CoinGecko id for ${base}`);

    // Pick days param based on TF
    const daysMap: Record<string, string> = {
      '1m': '1', '3m': '1', '5m': '1', '15m': '1', '30m': '1',
      '1h': '7', '2h': '14', '4h': '30', '6h': '90', '12h': '90',
      '1d': '365', '3d': 'max', '1w': 'max', '1M': 'max', 'all': '90',
    };
    const days = daysMap[tf] ?? '90';
    const url = `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`;
    const res = await fetch(url, {signal});
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const raw: number[][] = await res.json();
    if (signal.aborted || gen !== generation.current) return;
    const ohlc: OHLC[] = raw
      .map(c => ({time: c[0], open: c[1], high: c[2], low: c[3], close: c[4], volume: 0}))
      .filter(c => c.time > 0 && c.open > 0)
      .sort((a, b) => a.time - b.time);
    if (gen === generation.current) setAll(ohlc);
  }, [setAll]);

  // ── CoinGecko price polling (fallback 2 live updates, every 15s) ─────────────
  // coinId must already be resolved before calling this (use resolveCoinGeckoId first)
  const startCoinGeckoPoll = useCallback((coinId: string, gen: number) => {
    const tick = async () => {
      if (gen !== generation.current || !shouldConnect.current) return;
      try {
        const res = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`,
        );
        if (!res.ok) return;
        const json = await res.json();
        const price = json?.[coinId]?.usd;
        if (price && gen === generation.current) {
          setConnected(true);
          setSource('Live · CoinGecko');
          ensureSeedCandle(price, gen);
          const current = candlesRef.current;
          if (current.length > 0) {
            const last = current[current.length - 1];
            updateLastCandle({
              ...last, close: price,
              high: Math.max(last.high, price),
              low:  Math.min(last.low,  price),
            }, false, gen);
          }
        }
      } catch {}
      if (gen === generation.current && shouldConnect.current) {
        pollTimer.current = setTimeout(tick, 15_000);
      }
    };
    tick();
  }, [ensureSeedCandle, updateLastCandle]);

  // ── KuCoin relay WS ──────────────────────────────────────────────────────────
  const connectKuCoinRelay = useCallback((p: string, gen: number): (() => void) => {
    wsService.send({topic: 'subscribe_market', payload: {pairs: [p], exchange: 'kucoin'}});
    const unsub = wsService.subscribe('crypto_price', (payload: unknown) => {
      if (gen !== generation.current) return;
      const msg = payload as any;
      if (msg.symbol !== p) return;
      setConnected(true);
      setSource('Live · KuCoin');
      ensureSeedCandle(msg.price, gen);
      const current = candlesRef.current;
      if (current.length === 0) return;
      const last = current[current.length - 1];
      updateLastCandle({
        ...last, close: msg.price,
        high: Math.max(last.high, msg.price),
        low:  Math.min(last.low,  msg.price),
      }, false, gen);
    });
    return () => {
      unsub();
      wsService.send({topic: 'unsubscribe_market', payload: {pairs: [p], exchange: 'kucoin'}});
    };
  }, [updateLastCandle, ensureSeedCandle]);

  // ── Binance WS kline stream ───────────────────────────────────────────────────
  const connectBinanceWS = useCallback((
    p: string,
    tf: string,
    gen: number,
    onFail: () => void,
  ) => {
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    // Monthly has no meaningful WS update (closes once/month) — skip to relay
    if (tf === '1M') {
      onFail();
      return;
    }

    const sym      = toBinanceSymbol(p);
    const interval = BINANCE_INTERVALS[tf] ?? '4h';
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${sym.toLowerCase()}@kline_${interval}`);
    wsRef.current = ws;

    let gotData = false;
    // Longer timeout for lower-frequency intervals (1d / 1w can wait minutes between ticks)
    const timeoutMs = ['1d', '3d', '1w', '1M'].includes(tf) ? 20_000
                    : ['4h', '6h', '12h'].includes(tf)       ? 12_000
                    : 6_000;

    const failTimer = setTimeout(() => {
      if (!gotData && shouldConnect.current && gen === generation.current) {
        wsRef.current?.close();
        wsRef.current = null;
        onFail();
      }
    }, timeoutMs);

    ws.onopen = () => {
      reconnectDelay.current = 1000;
      if (gen === generation.current) setSource('Live · Binance');
    };

    ws.onmessage = (evt) => {
      if (gen !== generation.current) return;
      try {
        const msg = JSON.parse(evt.data as string);
        const k = msg.k;
        if (!k) return;
        if (!gotData) {
          gotData = true;
          clearTimeout(failTimer);
          setConnected(true);
          setSource('Live · Binance');
        }
        updateLastCandle({
          time:   k.t,
          open:   parseFloat(k.o),
          high:   parseFloat(k.h),
          low:    parseFloat(k.l),
          close:  parseFloat(k.c),
          volume: parseFloat(k.v),
        }, k.x, gen);
      } catch {}
    };

    ws.onclose = () => {
      clearTimeout(failTimer);
      if (gen !== generation.current) return;
      setConnected(false);
      wsRef.current = null;
      if (!shouldConnect.current) return;
      if (gotData) {
        reconnectTimer.current = setTimeout(() => {
          reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30_000);
          if (shouldConnect.current && gen === generation.current) {
            connectBinanceWS(p, tf, gen, onFail);
          }
        }, reconnectDelay.current);
      } else {
        onFail();
      }
    };

    ws.onerror = () => { clearTimeout(failTimer); ws.close(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateLastCandle]);

  // ── Alpaca stock stream ───────────────────────────────────────────────────────
  // tf ref so connectAlpaca closure always knows the current timeframe
  const currentTFRef = useRef('1d');

  const connectAlpaca = useCallback((p: string, gen: number): (() => void) => {
    const sym = p.replace('/USD', '').toUpperCase();
    wsService.send({topic: 'subscribe_stock', payload: {symbols: [sym]}});

    // stock_price: individual trade tick — always safe to update current candle's OHLC
    const unsubPrice = wsService.subscribe('stock_price', (payload: unknown) => {
      if (gen !== generation.current) return;
      const msg = payload as any;
      if (msg.symbol !== sym) return;
      setConnected(true);
      setSource('Live · Alpaca');
      ensureSeedCandle(msg.price, gen);
      const current = candlesRef.current;
      if (current.length === 0) return;
      const last = current[current.length - 1];
      // Always update the last candle's close/high/low — never append a new candle
      // from a price tick regardless of TF (we don't know if this tick is a new period)
      updateLastCandle({
        ...last, close: msg.price,
        high: Math.max(last.high, msg.price),
        low:  Math.min(last.low,  msg.price),
      }, false, gen);
    });

    // stock_bar: Alpaca IEX emits 1-MINUTE bars only.
    // If the current TF is 1m → use the full bar (open/high/low/close from bar).
    // If current TF > 1m   → only use bar.close to update the current candle's price.
    //                         Do NOT use bar.time — it's a 1m boundary, not a 4h/1d boundary.
    const unsubBar = wsService.subscribe('stock_bar', (payload: unknown) => {
      if (gen !== generation.current) return;
      const b = payload as any;
      if (b.symbol !== sym) return;
      setConnected(true);

      const tf = currentTFRef.current;
      if (tf === '1m') {
        // TF matches bar interval — use full bar OHLCV (may create a new candle)
        updateLastCandle({
          time:   new Date(b.timestamp).getTime(),
          open:   b.open, high: b.high, low: b.low, close: b.close, volume: b.volume,
        }, true, gen);
      } else {
        // TF is larger — only update close/high/low of the current candle using bar.close
        const current = candlesRef.current;
        if (current.length === 0) return;
        const last = current[current.length - 1];
        updateLastCandle({
          ...last, close: b.close,
          high: Math.max(last.high, b.close),
          low:  Math.min(last.low,  b.close),
        }, false, gen);
      }
    });

    return () => {
      unsubPrice();
      unsubBar();
      wsService.send({topic: 'unsubscribe_stock', payload: {symbols: [sym]}});
    };
  }, [updateLastCandle, ensureSeedCandle]);

  // ── Stock seed via backend (Alpaca) ───────────────────────────────────────────
  const loadStockSeed = useCallback(async (p: string, tf: string, gen: number, signal: AbortSignal) => {
    if (gen !== generation.current) return;
    setLoading(true);
    // 'all' not a real interval — use 1d. Only accepted STOCK_INTERVALS pass through.
    const stockTf = (tf === 'all' || !STOCK_INTERVALS.includes(tf)) ? '1d' : tf;
    try {
      const token = await storage.getAccessToken();
      const url = `${API_BASE_URL}/market/candles?symbol=${encodeURIComponent(p)}&timeframe=${stockTf}&limit=1000&exchange=alpaca`;
      const res = await fetch(url, {
        signal,
        headers: token ? {Authorization: `Bearer ${token}`} : {},
      });
      if (signal.aborted || gen !== generation.current) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (signal.aborted || gen !== generation.current) return;
      const payload = json?.data ?? json;
      const raw: any[] = Array.isArray(payload?.candles) ? payload.candles
                       : Array.isArray(payload?.data)    ? payload.data
                       : Array.isArray(payload)           ? payload
                       : [];
      const ohlc: OHLC[] = raw.map((c: any) => ({
        time:   c.timestamp ?? c.time ?? 0,
        open:   Number(c.open),
        high:   Number(c.high),
        low:    Number(c.low),
        close:  Number(c.close),
        volume: c.volume != null ? Number(c.volume) : undefined,
      })).filter(c => toMs(c.time) > 0 && c.open > 0)
        .sort((a, b) => toMs(a.time) - toMs(b.time));
      if (gen !== generation.current) return;
      if (ohlc.length === 0) throw new Error('No stock data returned');
      setAll(ohlc);
    } catch (err: any) {
      if (signal.aborted || gen !== generation.current) return;
      throw new Error(`Stock seed failed: ${err?.message ?? err}`);
    } finally {
      if (gen === generation.current) setLoading(false);
    }
  }, [setAll]);

  // ── Stable refs so closures always call latest versions ───────────────────────
  const connectBinanceWSRef   = useRef(connectBinanceWS);
  const connectKuCoinRelayRef = useRef(connectKuCoinRelay);
  const connectAlpacaRef      = useRef(connectAlpaca);
  const loadBinanceSeedRef    = useRef(loadBinanceSeed);
  const loadKuCoinSeedRef     = useRef(loadKuCoinSeed);
  const loadCoinGeckoSeedRef  = useRef(loadCoinGeckoSeed);
  const loadStockSeedRef      = useRef(loadStockSeed);
  const startCoinGeckoPollRef = useRef(startCoinGeckoPoll);
  useEffect(() => { connectBinanceWSRef.current   = connectBinanceWS;   }, [connectBinanceWS]);
  useEffect(() => { connectKuCoinRelayRef.current  = connectKuCoinRelay; }, [connectKuCoinRelay]);
  useEffect(() => { connectAlpacaRef.current       = connectAlpaca;      }, [connectAlpaca]);
  useEffect(() => { loadBinanceSeedRef.current     = loadBinanceSeed;    }, [loadBinanceSeed]);
  useEffect(() => { loadKuCoinSeedRef.current      = loadKuCoinSeed;     }, [loadKuCoinSeed]);
  useEffect(() => { loadCoinGeckoSeedRef.current   = loadCoinGeckoSeed;  }, [loadCoinGeckoSeed]);
  useEffect(() => { loadStockSeedRef.current       = loadStockSeed;      }, [loadStockSeed]);
  useEffect(() => { startCoinGeckoPollRef.current  = startCoinGeckoPoll; }, [startCoinGeckoPoll]);

  // ── Main effect — fires on pair or timeframe change ───────────────────────────
  useEffect(() => {
    if (!pair) return;

    // Bump generation — all prior async callbacks become stale immediately
    generation.current += 1;
    const gen = generation.current;

    shouldConnect.current  = true;
    reconnectDelay.current = 1000;
    usingFallback1.current = false;
    usingFallback2.current = false;
    hasMoreRef.current     = true;
    binanceSymRef.current  = '';
    binanceIntRef.current  = '';

    // Abort any in-flight requests
    abortController.current?.abort();
    const ctl = new AbortController();
    abortController.current = ctl;

    // Track current TF so connectAlpaca bar handler knows how to interpret 1-min bars
    currentTFRef.current = timeframe;

    // Close any existing WS immediately (before any await)
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
    if (pollTimer.current)      { clearTimeout(pollTimer.current);      pollTimer.current = null; }

    // Clear state
    candlesRef.current = [];
    setCandles([]);
    setLivePrice(undefined);
    setConnected(false);
    setTotalCandles(0);
    setLoadingMore(false);
    setHasMore(true);
    setSource('Loading...');

    let cleanupRelay: (() => void) | null = null;
    const stock = isStockPair(pair);

    if (stock) {
      // ── Stock path — Alpaca seed + live stream, one retry on failure ────────
      const tryStock = async (attempt: number) => {
        try {
          await loadStockSeedRef.current(pair, timeframe, gen, ctl.signal);
          if (gen !== generation.current) return;
          setSource('Live · Alpaca');
          cleanupRelay = connectAlpacaRef.current(pair, gen);
        } catch {
          if (gen !== generation.current || ctl.signal.aborted) return;
          if (attempt < 2) {
            setSource('Retrying...');
            await new Promise<void>(r => setTimeout(r, 3000));
            if (gen === generation.current && !ctl.signal.aborted) tryStock(attempt + 1);
          } else {
            setSource('No data · Market may be closed');
          }
        }
      };
      tryStock(1);
    } else {
      // ── Crypto path — try Binance, fallback 1 KuCoin, fallback 2 CoinGecko ─
      const tryFallback2 = async () => {
        if (gen !== generation.current || usingFallback2.current) return;
        usingFallback2.current = true;
        setSource('Connecting · CoinGecko...');
        // Resolve coinId first (static map → dynamic search)
        const base = pair.split('/')[0].toUpperCase();
        const coinId = await resolveCoinGeckoId(base, ctl.signal);
        if (!coinId) {
          if (gen === generation.current) setSource('No data available');
          return;
        }
        try {
          await loadCoinGeckoSeedRef.current(pair, timeframe, gen, ctl.signal);
        } catch {
          if (gen === generation.current) setSource('No data available');
          return;
        }
        if (gen !== generation.current) return;
        setSource('Live · CoinGecko');
        startCoinGeckoPollRef.current(coinId, gen);
      };

      const tryFallback1 = async () => {
        if (gen !== generation.current || usingFallback1.current) return;
        usingFallback1.current = true;
        setSource('Connecting · KuCoin...');
        try {
          await loadKuCoinSeedRef.current(pair, timeframe, gen, ctl.signal);
          if (gen !== generation.current) return;
          cleanupRelay = connectKuCoinRelayRef.current(pair, gen);
        } catch {
          await tryFallback2();
        }
      };

      const onBinanceWSFail = () => {
        if (gen !== generation.current) return;
        // WS failed but seed may have loaded — try KuCoin relay for live updates
        if (!usingFallback1.current) {
          usingFallback1.current = true;
          cleanupRelay = connectKuCoinRelayRef.current(pair, gen);
        }
      };

      loadBinanceSeedRef.current(pair, timeframe, gen, ctl.signal)
        .then(() => {
          if (gen !== generation.current) return;
          connectBinanceWSRef.current(pair, timeframe, gen, onBinanceWSFail);
        })
        .catch(async () => {
          if (gen !== generation.current) return;
          setLoading(false);
          await tryFallback1();
        });
    }

    return () => {
      shouldConnect.current = false;
      ctl.abort();
      if (pollTimer.current) { clearTimeout(pollTimer.current); pollTimer.current = null; }
      cleanupRelay?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pair, timeframe]);

  return {candles, livePrice, loading, loadingMore, connected, source, totalCandles, hasMore, loadMore};
}
