import ccxt from 'ccxt';
import { redisConnection } from '../../config/queue.js';
import { env } from '../../config/env.js';

// ─── Direct Binance REST (no ccxt market loading overhead) ──────────────────
const BINANCE_TF_MAP: Record<string, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w',
};

async function fetchBinanceCandles(symbol: string, tf: string, limit: number): Promise<any[]> {
  const interval = BINANCE_TF_MAP[tf];
  if (!interval) throw new Error(`Invalid Binance timeframe: ${tf}`);

  // e.g. BTC/USDT → BTCUSDT
  const binanceSymbol = symbol.replace('/', '');

  const url = `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=${interval}&limit=${limit}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Binance HTTP ${res.status}`);
    const data: any[] = await res.json();
    return data.map((c: any[]) => ({
      timestamp: Number(c[0]),
      open:      parseFloat(c[1]),
      high:      parseFloat(c[2]),
      low:       parseFloat(c[3]),
      close:     parseFloat(c[4]),
      volume:    parseFloat(c[5]),
    }));
  } finally {
    clearTimeout(timeout);
  }
}

// ccxt only used for Alpaca fallback — Binance now uses direct REST
const VALID_CRYPTO_TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'];

// Alpaca timeframe mapping for REST API
const ALPACA_TF_MAP: Record<string, string> = {
  '1m': '1Min', '5m': '5Min', '15m': '15Min',
  '1h': '1Hour', '4h': '4Hour', '1d': '1Day', '1w': '1Week',
};

/**
 * Fetch stock bars — tries Alpaca first, falls back to Twelve Data free tier.
 */
async function fetchStockBars(symbol: string, timeframe: string, limit: number): Promise<any[]> {
  // Try Alpaca Data API first
  const apiKey = env.ALPACA_API_KEY;
  const apiSecret = env.ALPACA_API_SECRET;

  if (apiKey && apiSecret && apiKey !== 'PLACEHOLDER') {
    try {
      // Calculate start date: trading days ≈ 5 per week, so limit bars needs limit*7/5 calendar days
      const calendarDays = Math.ceil(limit * 7 / 5) + 5; // extra padding for holidays
      const start = new Date(Date.now() - calendarDays * 86400000).toISOString().split('T')[0];
      const url = `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/bars?timeframe=${timeframe}&limit=${limit}&feed=sip&sort=asc&start=${start}`;
      const response = await fetch(url, {
        headers: { 'APCA-API-KEY-ID': apiKey, 'APCA-API-SECRET-KEY': apiSecret },
      });
      if (response.ok) {
        const data = await response.json();
        if (data.bars?.length > 0) {
          // If we got fewer bars than the limit, these are all the most recent bars — perfect
          // If we got exactly `limit` bars starting from `start`, we might be missing the latest ones
          // In that case, also fetch the most recent page
          let bars = data.bars;

          // Check if last bar is more than 3 days old — fetch newer bars too
          const lastBarDate = new Date(bars[bars.length - 1].t);
          const daysSinceLastBar = (Date.now() - lastBarDate.getTime()) / 86400000;
          if (daysSinceLastBar > 3 && bars.length >= limit) {
            // Fetch the most recent bars separately
            const recentStart = new Date(lastBarDate.getTime() + 86400000).toISOString().split('T')[0];
            const recentUrl = `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/bars?timeframe=${timeframe}&limit=30&feed=sip&sort=asc&start=${recentStart}`;
            const recentRes = await fetch(recentUrl, {
              headers: { 'APCA-API-KEY-ID': apiKey, 'APCA-API-SECRET-KEY': apiSecret },
            });
            if (recentRes.ok) {
              const recentData = await recentRes.json();
              if (recentData.bars?.length > 0) {
                bars = [...bars, ...recentData.bars];
                // Trim to keep only the last `limit` bars
                if (bars.length > limit) bars = bars.slice(-limit);
              }
            }
          }

          console.log(`[Market] ${symbol} candles from Alpaca SIP (${bars.length} bars, latest: ${bars[bars.length - 1].t})`);
          return bars.map((b: any) => ({
            timestamp: new Date(b.t).getTime(), open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v,
          }));
        }
      } else {
        const errText = await response.text();
        console.warn(`[Market] Alpaca ${symbol} failed: ${response.status} ${errText.slice(0, 100)}`);
      }
    } catch (err: any) {
      console.warn(`[Market] Alpaca ${symbol} error: ${err.message}`);
    }
  }

  // Fallback: Twelve Data free tier (800 calls/day, no signup needed for basic)
  try {
    const tdInterval = timeframe === '1Day' ? '1day' : timeframe === '1Hour' ? '1h' : timeframe === '4Hour' ? '4h' : timeframe === '1Week' ? '1week' : '1day';
    const tdKey = env.TWELVE_DATA_API_KEY || 'demo';
    const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=${tdInterval}&outputsize=${limit}&format=JSON&apikey=${tdKey}`;
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      if (data.values?.length > 0) {
        console.log(`[Market] ${symbol} candles from Twelve Data fallback (${data.values.length} bars)`);
        return data.values.reverse().map((v: any) => ({
          timestamp: new Date(v.datetime).getTime(),
          open: parseFloat(v.open), high: parseFloat(v.high), low: parseFloat(v.low),
          close: parseFloat(v.close), volume: parseInt(v.volume || '0'),
        }));
      }
    }
  } catch {}

  // Fallback 2: Generate from ccxt alpaca (crypto pairs on Alpaca)
  try {
    const alpacaExchange = new ccxt.alpaca({ enableRateLimit: true });
    const ohlcv = await alpacaExchange.fetchOHLCV(`${symbol}/USD`, timeframe === '1Day' ? '1d' : '1h', undefined, limit);
    return ohlcv.map(c => ({
      timestamp: Number(c[0]), open: Number(c[1]), high: Number(c[2]), low: Number(c[3]), close: Number(c[4]), volume: Number(c[5]),
    }));
  } catch {}

  return [];
}

export async function getCandles(symbol: string, timeframe: string = '4h', limit: number = 100) {
  const tf = timeframe.toLowerCase();
  const isStock = !symbol.includes('/');

  // Check cache (v2 key to invalidate old stale data)
  const cacheKey = `ohlcv2:${symbol.replace('/', ':')}:${tf}:${limit}`;
  const cached = await redisConnection.get(cacheKey).catch(() => null);
  if (cached) return JSON.parse(cached);

  let candles: any[];

  if (isStock) {
    const alpacaTF = ALPACA_TF_MAP[tf];
    if (!alpacaTF) throw new Error(`Invalid timeframe for stocks: ${tf}. Valid: ${Object.keys(ALPACA_TF_MAP).join(', ')}`);

    const cleanSymbol = symbol.replace('/USD', '');
    candles = await fetchStockBars(cleanSymbol, alpacaTF, limit);
  } else {
    // Fetch from Binance directly (no ccxt market loading)
    if (!VALID_CRYPTO_TIMEFRAMES.includes(tf)) {
      throw new Error(`Invalid timeframe: ${tf}. Valid: ${VALID_CRYPTO_TIMEFRAMES.join(', ')}`);
    }

    candles = await fetchBinanceCandles(symbol, tf, limit);
  }

  // Cache: stocks 60s (market hours data changes), crypto varies by TF
  const ttl = isStock ? 60 : (tf === '1m' ? 60 : tf === '5m' ? 120 : 300);
  await redisConnection.set(cacheKey, JSON.stringify(candles), 'EX', ttl).catch(() => {});

  return candles;
}
