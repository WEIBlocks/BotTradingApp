import ccxt from 'ccxt';
import { redisConnection } from '../config/queue.js';

const SYMBOLS = [
  'BTC/USDT',
  'ETH/USDT',
  'SOL/USDT',
  'BNB/USDT',
  'XRP/USDT',
  'MATIC/USDT',
  'ADA/USDT',
  'DOT/USDT',
];

const exchange = new ccxt.binance({ enableRateLimit: true });

async function processPriceSync() {
  console.log('[PriceSync] Fetching market prices...');

  try {
    const tickers = await exchange.fetchTickers(SYMBOLS);

    for (const symbol of SYMBOLS) {
      const ticker = tickers[symbol];
      if (!ticker) continue;

      const data = {
        price: ticker.last ?? 0,
        change24h: ticker.percentage ?? 0,
        volume: ticker.quoteVolume ?? 0,
        high24h: ticker.high ?? 0,
        low24h: ticker.low ?? 0,
        timestamp: Date.now(),
      };

      const redisKey = `price:${symbol.replace('/', ':')}`;
      await redisConnection.set(redisKey, JSON.stringify(data), 'EX', 120);
    }

    console.log(`[PriceSync] Updated prices for ${SYMBOLS.length} pairs`);
  } catch (err: any) {
    console.error('[PriceSync] Error fetching prices:', err.message);
  }
}

export async function getPrice(symbol: string): Promise<{
  price: number;
  change24h: number;
  volume: number;
  high24h: number;
  low24h: number;
  timestamp: number;
} | null> {
  const redisKey = `price:${symbol.replace('/', ':')}`;
  const raw = await redisConnection.get(redisKey);
  if (!raw) return null;
  return JSON.parse(raw);
}

export async function startPriceSyncJob() {
  // Run once immediately
  await processPriceSync();

  // Then every 30 seconds
  setInterval(processPriceSync, 30_000);

  console.log('[PriceSync] Job started - runs every 30s');
}
