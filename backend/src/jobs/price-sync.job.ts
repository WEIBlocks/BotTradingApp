import ccxt from 'ccxt';
import { redisConnection } from '../config/queue.js';
import { db } from '../config/database.js';
import { exchangeAssets } from '../db/schema/exchanges.js';
import { sql } from 'drizzle-orm';

// Base symbols always tracked (core market coverage)
const BASE_SYMBOLS = [
  'BTC/USDT',
  'ETH/USDT',
  'SOL/USDT',
  'BNB/USDT',
  'XRP/USDT',
];

// Stablecoins that don't need price fetch (always 1 USD)
const STABLECOINS = new Set(['USDT', 'USDC', 'USD', 'BUSD', 'DAI', 'TUSD', 'FDUSD']);

const exchange = new ccxt.binance({ enableRateLimit: true });

// Cache of known valid symbols on exchange (refreshed hourly)
let validSymbolsCache: Set<string> | null = null;
let validSymbolsCacheTime = 0;
const VALID_SYMBOLS_TTL = 3600_000; // 1 hour

async function getValidSymbols(): Promise<Set<string>> {
  if (validSymbolsCache && Date.now() - validSymbolsCacheTime < VALID_SYMBOLS_TTL) {
    return validSymbolsCache;
  }
  try {
    const markets = await exchange.loadMarkets();
    validSymbolsCache = new Set(Object.keys(markets));
    validSymbolsCacheTime = Date.now();
  } catch {
    validSymbolsCache = validSymbolsCache ?? new Set(BASE_SYMBOLS);
  }
  return validSymbolsCache;
}

async function discoverUserSymbols(): Promise<string[]> {
  try {
    // Get all unique symbols held by any user
    const rows = await db
      .selectDistinct({ symbol: exchangeAssets.symbol })
      .from(exchangeAssets)
      .where(sql`${exchangeAssets.amount}::numeric > 0`);

    const userPairs: string[] = [];
    for (const row of rows) {
      const sym = row.symbol.toUpperCase();
      if (STABLECOINS.has(sym)) continue;
      userPairs.push(`${sym}/USDT`);
    }
    return userPairs;
  } catch {
    return [];
  }
}

async function processPriceSync() {
  try {
    // Discover all symbols users actually hold
    const userSymbols = await discoverUserSymbols();
    const allSymbols = [...new Set([...BASE_SYMBOLS, ...userSymbols])];

    // Validate against exchange's available markets
    const validSymbols = await getValidSymbols();
    const fetchSymbols = allSymbols.filter(s => validSymbols.has(s));

    if (fetchSymbols.length === 0) {
      console.log('[PriceSync] No symbols to fetch');
      return;
    }

    // Fetch in batches of 20 (API rate limit safety)
    const BATCH_SIZE = 20;
    for (let i = 0; i < fetchSymbols.length; i += BATCH_SIZE) {
      const batch = fetchSymbols.slice(i, i + BATCH_SIZE);
      const tickers = await exchange.fetchTickers(batch);

      for (const symbol of batch) {
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
    }

    console.log(`[PriceSync] Updated prices for ${fetchSymbols.length} pairs`);
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
  if (raw) return JSON.parse(raw);

  // Fallback: try to fetch directly if not in cache
  try {
    const ticker = await exchange.fetchTicker(symbol);
    if (!ticker) return null;
    const data = {
      price: ticker.last ?? 0,
      change24h: ticker.percentage ?? 0,
      volume: ticker.quoteVolume ?? 0,
      high24h: ticker.high ?? 0,
      low24h: ticker.low ?? 0,
      timestamp: Date.now(),
    };
    await redisConnection.set(redisKey, JSON.stringify(data), 'EX', 120);
    return data;
  } catch {
    return null;
  }
}

export async function startPriceSyncJob() {
  // Run once immediately
  await processPriceSync();

  // Then every 30 seconds
  setInterval(processPriceSync, 30_000);

  console.log('[PriceSync] Job started - runs every 30s (dynamic symbol discovery)');
}
