import ccxt from 'ccxt';
import { redisConnection } from '../../config/queue.js';

const exchange = new ccxt.binance({ enableRateLimit: true });

// Valid timeframes for Binance
const VALID_TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'];

export async function getCandles(symbol: string, timeframe: string = '4h', limit: number = 100) {
  // Validate timeframe
  const tf = timeframe.toLowerCase();
  if (!VALID_TIMEFRAMES.includes(tf)) {
    throw new Error(`Invalid timeframe: ${timeframe}. Valid: ${VALID_TIMEFRAMES.join(', ')}`);
  }

  // Check Redis cache first (cache for 60s for 1m, 5min for others)
  const cacheKey = `ohlcv:${symbol}:${tf}:${limit}`;
  const cached = await redisConnection.get(cacheKey).catch(() => null);
  if (cached) {
    return JSON.parse(cached);
  }

  // Fetch from Binance
  const ohlcv = await exchange.fetchOHLCV(symbol, tf, undefined, limit);

  const candles = ohlcv.map((c) => ({
    timestamp: Number(c[0] ?? 0),
    open: Number(c[1] ?? 0),
    high: Number(c[2] ?? 0),
    low: Number(c[3] ?? 0),
    close: Number(c[4] ?? 0),
    volume: Number(c[5] ?? 0),
  }));

  // Cache based on timeframe
  const ttl = tf === '1m' ? 60 : tf === '5m' ? 120 : 300;
  await redisConnection.set(cacheKey, JSON.stringify(candles), 'EX', ttl).catch(() => {});

  return candles;
}
