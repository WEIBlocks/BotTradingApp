/**
 * useMarketKline — real-time candlestick data for any exchange.
 *
 * Exchange priority per tab:
 *   Kraken   → wss://ws.kraken.com/v2  (public, V2 API, no key)
 *   Binance  → wss://stream.binance.com:9443  (public, mobile not geo-blocked)
 *   Coinbase → REST polling 3s  (public REST, no auth needed)
 *   Fallback → KuCoin REST → CoinGecko REST (exotic tokens: bSOL, mSOL, etc.)
 *   Stocks   → Backend WS relay (Alpaca)
 *
 * Kraken notes:
 *   - Uses Kraken WS V2 API (wss://ws.kraken.com/v2) — more stable than V1
 *   - V2 sends a snapshot immediately on subscribe + ticks on every price update
 *   - Data timeout raised to 30s (prices only tick when market moves)
 *   - MATIC renamed to POL on Kraken (handled in symbol map)
 *   - Unknown pairs fall through to KuCoin REST immediately
 *
 * bSOL / MATIC / exotic tokens:
 *   - KuCoin REST covers most tokens (BSOL-USDT, MATIC-USDT alias POL)
 *   - CoinGecko as final fallback with 60s rate-limit guard
 */

import {useEffect, useRef, useState, useCallback} from 'react';
import {api} from '../services/api';
import {wsService} from '../services/websocket';
import type {OHLC} from '../components/charts/CandlestickChart';

export type ExchangeId = 'kraken' | 'binance' | 'coinbase' | 'alpaca';

export interface MarketKlineState {
  candles:   OHLC[];
  livePrice: number | undefined;
  loading:   boolean;
  connected: boolean;
  source:    string;
}

const BINANCE_TF: Record<string, string> = {
  '1m':'1m','5m':'5m','15m':'15m','1h':'1h','4h':'4h','1d':'1d','1w':'1w',
};

const KRAKEN_TF: Record<string, number> = {
  '1m':1,'5m':5,'15m':15,'1h':60,'4h':240,'1d':1440,'1w':10080,
};

// Kraken V2 WS symbol map — uses format "BTC/USD" (no USDT)
// MATIC was renamed to POL on Kraken in Sep 2024
const KRAKEN_WS_MAP: Record<string, string> = {
  'BTC/USDT':  'BTC/USD',
  'ETH/USDT':  'ETH/USD',
  'SOL/USDT':  'SOL/USD',
  'BNB/USDT':  'BNB/USD',
  'XRP/USDT':  'XRP/USD',
  'ADA/USDT':  'ADA/USD',
  'DOGE/USDT': 'DOGE/USD',
  'LTC/USDT':  'LTC/USD',
  'LINK/USDT': 'LINK/USD',
  'DOT/USDT':  'DOT/USD',
  'AVAX/USDT': 'AVAX/USD',
  'ATOM/USDT': 'ATOM/USD',
  'UNI/USDT':  'UNI/USD',
  'NEAR/USDT': 'NEAR/USD',
  'ARB/USDT':  'ARB/USD',
  'OP/USDT':   'OP/USD',
  'INJ/USDT':  'INJ/USD',
  'TIA/USDT':  'TIA/USD',
  'SEI/USDT':  'SEI/USD',
  'SUI/USDT':  'SUI/USD',
  'APT/USDT':  'APT/USD',
  'FET/USDT':  'FET/USD',
  'RNDR/USDT': 'RENDER/USD',
  'AAVE/USDT': 'AAVE/USD',
  'MKR/USDT':  'MKR/USD',
  'PEPE/USDT': 'PEPE/USD',
  // MATIC → POL on Kraken (rebranded Sep 2024)
  'MATIC/USDT':'POL/USD',
  'POL/USDT':  'POL/USD',
};

// Pairs that Kraken V2 WS actually supports — anything outside this goes straight to KuCoin
const KRAKEN_WS_SUPPORTED = new Set(Object.keys(KRAKEN_WS_MAP));

// CoinGecko ID map — covers exotic/LST tokens not on major CEXs
const COINGECKO_ID_MAP: Record<string, string> = {
  'BSOL':'blazestake-staked-sol', 'MSOL':'msol', 'JITOSOL':'jito-staked-sol',
  'STSOL':'lido-staked-sol', 'WSOL':'wrapped-solana', 'RAY':'raydium',
  'SRM':'serum', 'BONK':'bonk', 'WIF':'dogwifcoin', 'JUP':'jupiter',
  'PYTH':'pyth-network', 'TIA':'celestia', 'SEI':'sei-network',
  'SUI':'sui', 'APT':'aptos', 'INJ':'injective-protocol',
  'RNDR':'render-token', 'RENDER':'render-token', 'FET':'fetch-ai',
  'IMX':'immutable-x', 'NEAR':'near', 'FIL':'filecoin',
  'AAVE':'aave', 'MKR':'maker', 'SNX':'havven', 'CRV':'curve-dao-token',
  'COMP':'compound-governance-token', 'YFI':'yearn-finance', 'SUSHI':'sushi',
  '1INCH':'1inch', 'SAND':'the-sandbox', 'MANA':'decentraland',
  'AXS':'axie-infinity', 'GALA':'gala', 'CHZ':'chiliz', 'ENJ':'enjincoin',
  'BAT':'basic-attention-token', 'ZRX':'0x', 'KNC':'kyber-network-crystal',
  'LRC':'loopring', 'OP':'optimism', 'ARB':'arbitrum', 'WLD':'worldcoin-wld',
  'BLUR':'blur', 'PEPE':'pepe', 'FLOKI':'floki', 'ORDI':'ordinals',
  'MATIC':'matic-network', 'POL':'matic-network',
  'GRT':'the-graph', 'OCEAN':'ocean-protocol',
};

// In-memory rate limit guard for CoinGecko (max 1 req/pair per 60s)
const cgLastFetch: Map<string, number> = new Map();
const CG_MIN_INTERVAL_MS = 60_000;

// AbortSignal.timeout() not available in all RN JS engines — use manual controller
function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, {signal: ctrl.signal}).finally(() => clearTimeout(t));
}

function toKrakenV2Symbol(pair: string): string {
  return KRAKEN_WS_MAP[pair] ?? pair.replace('/USDT', '/USD');
}

function toBinanceSymbol(pair: string): string {
  return pair.replace('/', '').toLowerCase();
}

function getCoinGeckoId(pair: string): string | null {
  const base = pair.split('/')[0]?.toUpperCase() ?? '';
  return COINGECKO_ID_MAP[base] ?? null;
}

export function useMarketKline(
  pair: string | undefined,
  timeframe: string,
  exchange: ExchangeId = 'kraken',
): MarketKlineState {
  const [candles,   setCandles]   = useState<OHLC[]>([]);
  const [livePrice, setLivePrice] = useState<number | undefined>();
  const [loading,   setLoading]   = useState(false);
  const [connected, setConnected] = useState(false);
  const [source,    setSource]    = useState('');

  const candlesRef     = useRef<OHLC[]>([]);
  const wsRef          = useRef<WebSocket | null>(null);
  const pollTimer      = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataTimeout    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldConnect  = useRef(false);
  const reconnectDelay = useRef(1000);

  // ── Candle update helper ──────────────────────────────────────────────────
  const updateLastCandle = useCallback((candle: OHLC, isClosed = false) => {
    setLivePrice(candle.close);
    const current = candlesRef.current;
    if (current.length === 0) {
      candlesRef.current = [candle];
      setCandles([candle]);
      return;
    }
    const last = current[current.length - 1];
    const lastTime   = typeof last.time   === 'number' ? last.time   : new Date(last.time   as string).getTime();
    const candleTime = typeof candle.time === 'number' ? candle.time : new Date(candle.time as string).getTime();

    if (isClosed && candleTime > lastTime) {
      const updated = [...current, candle];
      candlesRef.current = updated;
      setCandles([...updated]);
    } else if (candleTime >= lastTime) {
      const updated = [...current];
      updated[updated.length - 1] = candle;
      candlesRef.current = updated;
      setCandles([...updated]);
    } else {
      // older candle — append (shouldn't happen in normal operation)
      const updated = [...current, candle];
      candlesRef.current = updated;
      setCandles([...updated]);
    }
  }, []);

  // ── Seed from backend REST ────────────────────────────────────────────────
  // Always request max — backend caps at 721 candles regardless (that's all the history it has)
  function seedLimit(_tf: string): number {
    return 2000; // backend will give up to 721 — maximum history available
  }

  const loadSeed = useCallback(async (p: string, tf: string, ex: string) => {
    setLoading(true);
    try {
      const limit = seedLimit(tf);
      const res = await api.get<{data: any}>(
        `/market/candles?symbol=${encodeURIComponent(p)}&timeframe=${tf}&limit=${limit}&exchange=${ex}`,
      );
      const payload = res?.data ?? res;
      const raw: any[] = Array.isArray(payload?.candles) ? payload.candles
                       : Array.isArray(payload)           ? payload
                       : [];
      // Don't set source here — the live stream handler sets the definitive source badge
      const ohlc: OHLC[] = raw.map((c: any) => ({
        time:   c.timestamp ?? c.time ?? 0,
        open:   Number(c.open),
        high:   Number(c.high),
        low:    Number(c.low),
        close:  Number(c.close),
        volume: c.volume != null ? Number(c.volume) : undefined,
      })).filter(c => c.time > 0 && c.open > 0);
      candlesRef.current = ohlc;
      setCandles([...ohlc]);
      if (ohlc.length > 0) setLivePrice(ohlc[ohlc.length - 1].close);
    } catch {
      // keep what we have
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Seed candle synthesizer — creates a minimal OHLC when backend returns nothing ──
  const ensureSeedCandle = useCallback((price: number) => {
    if (candlesRef.current.length > 0) return;
    const now = Date.now();
    const seed: OHLC = {time: now, open: price, high: price, low: price, close: price};
    candlesRef.current = [seed];
    setCandles([seed]);
    setLivePrice(price);
  }, []);

  // ── CoinGecko REST poll (last resort, 60s rate-limit guard) ──────────────
  function startCoinGeckoPollDirect(p: string) {
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
    const geckoId = getCoinGeckoId(p);
    if (!geckoId) {
      setConnected(false);
      setSource('No price source');
      return;
    }
    setConnected(true);
    setSource('REST · CoinGecko');

    const doFetch = async () => {
      const now = Date.now();
      const lastTs = cgLastFetch.get(geckoId) ?? 0;
      if (now - lastTs < CG_MIN_INTERVAL_MS) return; // respect rate limit
      cgLastFetch.set(geckoId, now);
      try {
        const res = await fetchWithTimeout(
          `https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=usd`, 6000,
        );
        if (!res.ok) return;
        const json: any = await res.json();
        const price = json[geckoId]?.usd;
        if (!price || price <= 0) return;
        // Ensure a seed candle exists before trying to update
        ensureSeedCandle(price);
        const current = candlesRef.current;
        const last_ = current[current.length - 1];
        updateLastCandle({...last_, close: price, high: Math.max(last_.high, price), low: Math.min(last_.low, price)});
        setSource('REST · CoinGecko');
      } catch {}
    };

    doFetch();
    pollTimer.current = setInterval(doFetch, 10_000);
  }

  // ── KuCoin REST poll ──────────────────────────────────────────────────────
  const startKuCoinPoll = useCallback((p: string) => {
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
    setConnected(true);
    setSource('REST · KuCoin');

    // KuCoin uses BSOL-USDT, MATIC-USDT (not POL), etc.
    const base = p.split('/')[0] ?? p;
    // Handle MATIC/POL alias — KuCoin still uses MATIC
    const kcBase = base === 'POL' ? 'MATIC' : base;
    const kcSym = `${kcBase}-USDT`;
    let noDataCount = 0;

    const doFetch = async () => {
      try {
        const res = await fetchWithTimeout(
          `https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=${kcSym}`, 5000,
        );
        if (!res.ok) { noDataCount++; if (noDataCount >= 3) startCoinGeckoPollDirect(p); return; }
        const json: any = await res.json();
        const price = parseFloat(json?.data?.price ?? '0');
        if (!price || price <= 0) {
          noDataCount++;
          if (noDataCount >= 3) startCoinGeckoPollDirect(p);
          return;
        }
        noDataCount = 0;
        // If backend seed was empty, create a synthetic candle so price ticks render
        ensureSeedCandle(price);
        const current = candlesRef.current;
        const last = current[current.length - 1];
        updateLastCandle({...last, close: price, high: Math.max(last.high, price), low: Math.min(last.low, price)});
        setSource('REST · KuCoin');
      } catch { noDataCount++; if (noDataCount >= 3) startCoinGeckoPollDirect(p); }
    };

    doFetch();
    pollTimer.current = setInterval(doFetch, 3000);
  }, [updateLastCandle, ensureSeedCandle]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Coinbase REST poll — direct public API from mobile (no backend hop) ──
  const startCoinbasePoll = useCallback((p: string) => {
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
    setConnected(true);
    setSource('REST · Coinbase');
    let noDataCount = 0;

    // Coinbase still uses MATIC (not POL), and BASE-USD format
    const productId = p
      .replace('/USDT', '-USD').replace('/USD', '-USD').replace('/', '-')
      .replace('POL-USD', 'MATIC-USD');

    const doFetch = async () => {
      try {
        const res = await fetchWithTimeout(
          `https://api.coinbase.com/api/v3/brokerage/market/products/${productId}`, 5000,
        );
        if (!res.ok) { noDataCount++; if (noDataCount >= 3) startKuCoinPoll(p); return; }
        const json: any = await res.json();
        const price = parseFloat(json.price ?? json.best_bid ?? '0');
        if (price > 0) {
          ensureSeedCandle(price);
          const current = candlesRef.current;
          const last = current[current.length - 1];
          updateLastCandle({...last, close: price, high: Math.max(last.high, price), low: Math.min(last.low, price)});
          setSource('REST · Coinbase');
          noDataCount = 0;
        } else {
          noDataCount++;
          if (noDataCount >= 3) startKuCoinPoll(p);
        }
      } catch { noDataCount++; if (noDataCount >= 3) startKuCoinPoll(p); }
    };

    doFetch();
    pollTimer.current = setInterval(doFetch, 3000);
  }, [updateLastCandle, startKuCoinPoll, ensureSeedCandle]);

  // ── Kraken V2 WebSocket ───────────────────────────────────────────────────
  const connectKraken = useCallback((p: string, tf: string) => {
    if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }

    // Unknown pair → go straight to KuCoin (no WS attempt)
    if (!KRAKEN_WS_SUPPORTED.has(p)) {
      startKuCoinPoll(p);
      return;
    }

    const krakenSym = toKrakenV2Symbol(p);
    const interval  = KRAKEN_TF[tf] ?? 60;

    // Kraken direct WSS is unreliable on Android (TLS issues on some devices/networks).
    // Use backend REST price polling instead — backend reaches Kraken REST fine, and
    // polling every 2s gives effectively real-time prices with "Live · Kraken" badge.
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
    setConnected(true);
    setSource('Live · Kraken');
    let noDataCount = 0;

    const doFetch = async () => {
      try {
        const res = await api.get<{data: any}>(
          `/market/price?symbol=${encodeURIComponent(p)}&exchange=kraken`,
        );
        // Backend returns {data: {price, source}}
        const inner = (res as any)?.data;
        const price = inner?.price;
        if (price && price > 0) {
          noDataCount = 0;
          ensureSeedCandle(price);
          const current = candlesRef.current;
          const last = current[current.length - 1];
          updateLastCandle({...last, close: price, high: Math.max(last.high, price), low: Math.min(last.low, price)});
          setSource('Live · Kraken');
          setConnected(true);
        } else {
          noDataCount++;
          if (noDataCount >= 4) startKuCoinPoll(p);
        }
      } catch {
        noDataCount++;
        if (noDataCount >= 4) startKuCoinPoll(p);
      }
    };

    doFetch();
    pollTimer.current = setInterval(doFetch, 2000);
  }, [updateLastCandle, startKuCoinPoll, ensureSeedCandle]);

  // ── Binance WebSocket ─────────────────────────────────────────────────────
  const connectBinance = useCallback((p: string, tf: string) => {
    if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
    const sym      = toBinanceSymbol(p);
    const interval = BINANCE_TF[tf] ?? '1h';
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${sym}@kline_${interval}`);
    wsRef.current = ws;
    let receivedData = false;

    // Timeout scales with timeframe — longer TFs have fewer ticks per minute
    const FIRST_DATA_MS = ['1d','1w'].includes(tf) ? 90_000 : ['4h'].includes(tf) ? 60_000 : 20_000;
    let firstDataTimeout: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (receivedData || !shouldConnect.current) return;
      // Never got a kline frame — pair not on Binance or geo-issue, fall to KuCoin
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
      startKuCoinPoll(p);
    }, FIRST_DATA_MS);

    ws.onopen = () => {
      setConnected(true);
      setSource('Live · Binance');
      reconnectDelay.current = 1000;
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string);
        const k = msg.k;
        if (!k) return;
        if (!receivedData) {
          receivedData = true;
          if (firstDataTimeout) { clearTimeout(firstDataTimeout); firstDataTimeout = null; }
        }
        updateLastCandle({
          time:   k.t,
          open:   parseFloat(k.o), high:   parseFloat(k.h),
          low:    parseFloat(k.l), close:  parseFloat(k.c),
          volume: parseFloat(k.v),
        }, k.x);
      } catch {}
    };

    ws.onclose = () => {
      if (firstDataTimeout) { clearTimeout(firstDataTimeout); firstDataTimeout = null; }
      setConnected(false);
      wsRef.current = null;
      if (dataTimeout.current) { clearTimeout(dataTimeout.current); dataTimeout.current = null; }
      if (!shouldConnect.current) return;
      if (receivedData) {
        // Normal transient close — reconnect
        reconnectTimer.current = setTimeout(() => {
          reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30_000);
          if (shouldConnect.current) connectBinance(p, tf);
        }, reconnectDelay.current);
      } else {
        // Never had data — fall to KuCoin
        startKuCoinPoll(p);
      }
    };
    ws.onerror = () => { if (firstDataTimeout) { clearTimeout(firstDataTimeout); firstDataTimeout = null; } ws.close(); };
  }, [updateLastCandle, startKuCoinPoll]);

  // ── Alpaca (stocks via backend WS relay) ──────────────────────────────────
  const connectAlpaca = useCallback((p: string): (() => void) => {
    const sym = p.replace('/USD', '').toUpperCase();
    setConnected(false);

    const unsubPrice = wsService.subscribe('stock_price', (payload: unknown) => {
      const msg = payload as any;
      if (msg.symbol !== sym) return;
      setConnected(true);
      setSource('Live · Alpaca');
      const current = candlesRef.current;
      if (current.length === 0) return;
      const last = current[current.length - 1];
      updateLastCandle({...last, close: msg.price, high: Math.max(last.high, msg.price), low: Math.min(last.low, msg.price)});
    });

    const unsubBar = wsService.subscribe('stock_bar', (payload: unknown) => {
      const b = payload as any;
      if (b.symbol !== sym) return;
      setConnected(true);
      updateLastCandle({
        time: new Date(b.timestamp).getTime(),
        open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume,
      }, true);
    });

    return () => { unsubPrice(); unsubBar(); };
  }, [updateLastCandle]);

  // Stable refs for callbacks — prevents useEffect from re-firing when callbacks recreate
  const connectKrakenRef    = useRef(connectKraken);
  const connectBinanceRef   = useRef(connectBinance);
  const startCoinbasePollRef = useRef(startCoinbasePoll);
  const connectAlpacaRef    = useRef(connectAlpaca);
  const loadSeedRef         = useRef(loadSeed);
  useEffect(() => { connectKrakenRef.current    = connectKraken;    }, [connectKraken]);
  useEffect(() => { connectBinanceRef.current   = connectBinance;   }, [connectBinance]);
  useEffect(() => { startCoinbasePollRef.current = startCoinbasePoll; }, [startCoinbasePoll]);
  useEffect(() => { connectAlpacaRef.current    = connectAlpaca;    }, [connectAlpaca]);
  useEffect(() => { loadSeedRef.current         = loadSeed;         }, [loadSeed]);

  // ── Main effect — only re-runs when pair/timeframe/exchange actually change ─
  useEffect(() => {
    if (!pair) return;

    shouldConnect.current = true;
    reconnectDelay.current = 1000;
    candlesRef.current = [];
    setCandles([]);
    setLivePrice(undefined);
    setConnected(false);
    setSource('Loading...');

    let cleanupAlpaca: (() => void) | null = null;
    const isStock = !pair.includes('/') || (pair.endsWith('/USD') && !pair.endsWith('/USDT'));

    loadSeedRef.current(pair, timeframe, isStock ? 'alpaca' : exchange).then(() => {
      if (!shouldConnect.current) return;
      if (isStock) { cleanupAlpaca = connectAlpacaRef.current(pair); return; }
      if      (exchange === 'kraken')   connectKrakenRef.current(pair, timeframe);
      else if (exchange === 'binance')  connectBinanceRef.current(pair, timeframe);
      else if (exchange === 'coinbase') startCoinbasePollRef.current(pair);
      else                              connectKrakenRef.current(pair, timeframe);
    });

    return () => {
      shouldConnect.current = false;
      if (dataTimeout.current)    { clearTimeout(dataTimeout.current);    dataTimeout.current    = null; }
      if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
      if (pollTimer.current)      { clearInterval(pollTimer.current);     pollTimer.current      = null; }
      if (wsRef.current)          { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
      cleanupAlpaca?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pair, timeframe, exchange]);

  return {candles, livePrice, loading, connected, source};
}
