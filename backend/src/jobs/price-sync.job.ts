import ccxt from 'ccxt';
import { redisConnection } from '../config/queue.js';
import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { exchangeAssets, exchangeConnections } from '../db/schema/exchanges.js';
import { eq, sql } from 'drizzle-orm';

// Base symbols always tracked
const BASE_CRYPTO_SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT'];
const BASE_STOCK_SYMBOLS = ['AAPL', 'MSFT', 'TSLA', 'AMZN', 'GOOGL'];

const STABLECOINS = new Set(['USDT', 'USDC', 'USD', 'BUSD', 'DAI', 'TUSD', 'FDUSD']);

const binance = new ccxt.binance({
  enableRateLimit: true,
  options: { defaultType: 'spot' },
});

// Lazy-init Alpaca client for market data (no auth needed for free tier snapshots)
let alpacaClient: any = null;
async function getAlpacaClient() {
  if (alpacaClient) return alpacaClient;
  try {
    const Alpaca = (await import('@alpacahq/alpaca-trade-api')).default;
    alpacaClient = new Alpaca({
      keyId: env.ALPACA_API_KEY || 'PLACEHOLDER',
      secretKey: env.ALPACA_API_SECRET || 'PLACEHOLDER',
      paper: true,
      usePolygon: false,
    });
    return alpacaClient;
  } catch {
    return null;
  }
}

// Cache of known valid Binance symbols
let validSymbolsCache: Set<string> | null = null;
let validSymbolsCacheTime = 0;
const VALID_SYMBOLS_TTL = 3600_000;

async function getValidBinanceSymbols(): Promise<Set<string>> {
  if (validSymbolsCache && Date.now() - validSymbolsCacheTime < VALID_SYMBOLS_TTL) {
    return validSymbolsCache;
  }
  try {
    const markets = await binance.loadMarkets();
    validSymbolsCache = new Set(Object.keys(markets));
    validSymbolsCacheTime = Date.now();
  } catch {
    validSymbolsCache = validSymbolsCache ?? new Set(BASE_CRYPTO_SYMBOLS);
  }
  return validSymbolsCache;
}

/** Discover user-held symbols, split by asset class */
async function discoverUserSymbols(): Promise<{ crypto: string[]; stocks: string[] }> {
  try {
    const rows = await db
      .select({
        symbol: exchangeAssets.symbol,
        assetClass: exchangeConnections.assetClass,
      })
      .from(exchangeAssets)
      .innerJoin(exchangeConnections, eq(exchangeAssets.exchangeConnId, exchangeConnections.id))
      .where(sql`${exchangeAssets.amount}::numeric > 0`);

    const crypto: string[] = [];
    const stocks: string[] = [];
    const seen = new Set<string>();

    for (const row of rows) {
      const sym = row.symbol.toUpperCase();
      if (STABLECOINS.has(sym)) continue;
      if (seen.has(sym)) continue;
      seen.add(sym);

      if (row.assetClass === 'stocks') {
        stocks.push(sym);
      } else {
        crypto.push(`${sym}/USDT`);
      }
    }

    return { crypto, stocks };
  } catch {
    return { crypto: [], stocks: [] };
  }
}

async function syncCryptoPrices(symbols: string[]) {
  if (symbols.length === 0) return 0;

  const validSymbols = await getValidBinanceSymbols();
  const fetchSymbols = symbols.filter(s => validSymbols.has(s));
  if (fetchSymbols.length === 0) return 0;

  const BATCH_SIZE = 20;
  for (let i = 0; i < fetchSymbols.length; i += BATCH_SIZE) {
    const batch = fetchSymbols.slice(i, i + BATCH_SIZE);
    const tickers = await binance.fetchTickers(batch);

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

      await redisConnection.set(`price:${symbol.replace('/', ':')}`, JSON.stringify(data), 'EX', 120);
    }
  }

  return fetchSymbols.length;
}

async function syncStockPrices(symbols: string[]) {
  if (symbols.length === 0) return 0;

  const alpaca = await getAlpacaClient();
  if (!alpaca) return 0;

  try {
    // Fetch snapshots for all stock symbols at once
    const snapshots = await alpaca.getSnapshots(symbols);
    let count = 0;

    for (const symbol of symbols) {
      const snap = snapshots[symbol];
      if (!snap) continue;

      const lastTrade = snap.latestTrade;
      const dailyBar = snap.dailyBar;
      const prevBar = snap.prevDailyBar;
      const price = lastTrade?.p ?? dailyBar?.c ?? 0;
      const prevClose = prevBar?.c ?? dailyBar?.o ?? price;
      const change24h = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;

      const data = {
        price,
        change24h,
        volume: dailyBar?.v ?? 0,
        high24h: dailyBar?.h ?? price,
        low24h: dailyBar?.l ?? price,
        timestamp: Date.now(),
      };

      await redisConnection.set(`price:${symbol}`, JSON.stringify(data), 'EX', 120);
      count++;
    }

    // Cache market hours status
    try {
      const clock = await alpaca.getClock();
      await redisConnection.set('market:us:open', clock.is_open ? '1' : '0', 'EX', 60);
    } catch {}

    return count;
  } catch (err: any) {
    console.error('[PriceSync] Error fetching stock prices:', err.message);
    return 0;
  }
}

async function processPriceSync() {
  try {
    const userSymbols = await discoverUserSymbols();
    const allCrypto = [...new Set([...BASE_CRYPTO_SYMBOLS, ...userSymbols.crypto])];
    const allStocks = [...new Set([...BASE_STOCK_SYMBOLS, ...userSymbols.stocks])];

    const [cryptoCount, stockCount] = await Promise.all([
      syncCryptoPrices(allCrypto),
      syncStockPrices(allStocks),
    ]);

    if (cryptoCount + stockCount > 0) {
      console.log(`[PriceSync] Updated ${cryptoCount} crypto + ${stockCount} stock prices`);
    }
  } catch (err: any) {
    console.error('[PriceSync] Error:', err.message);
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

  // Fallback: fetch directly based on symbol format
  const isStock = !symbol.includes('/');

  if (isStock) {
    try {
      const alpaca = await getAlpacaClient();
      if (!alpaca) return null;
      const snap = await alpaca.getSnapshot(symbol);
      const price = snap?.latestTrade?.p ?? 0;
      const prevClose = snap?.prevDailyBar?.c ?? price;
      const data = {
        price,
        change24h: prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0,
        volume: snap?.dailyBar?.v ?? 0,
        high24h: snap?.dailyBar?.h ?? price,
        low24h: snap?.dailyBar?.l ?? price,
        timestamp: Date.now(),
      };
      await redisConnection.set(redisKey, JSON.stringify(data), 'EX', 120);
      return data;
    } catch {
      return null;
    }
  }

  // Crypto fallback via Binance
  try {
    const ticker = await binance.fetchTicker(symbol);
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

/** Check if US stock market is currently open (cached) */
/** Check if US stock market is currently open */
export async function isUSMarketOpen(): Promise<boolean> {
  // 1. Check Redis cache (set by price sync from Alpaca clock)
  const cached = await redisConnection.get('market:us:open').catch(() => null);
  if (cached !== null) return cached === '1';

  // 2. Try Alpaca clock API
  try {
    const alpaca = await getAlpacaClient();
    if (alpaca) {
      const clock = await alpaca.getClock();
      await redisConnection.set('market:us:open', clock.is_open ? '1' : '0', 'EX', 60).catch(() => {});
      return clock.is_open;
    }
  } catch {}

  // 3. Fallback: pure time-based calculation (no API needed)
  return isMarketOpenByTime();
}

/** Pure time-based US market hours check (no API dependency) */
function isMarketOpenByTime(): boolean {
  const now = new Date();
  const utcH = now.getUTCHours();
  const utcM = now.getUTCMinutes();
  const utcDay = now.getUTCDay(); // 0=Sun, 6=Sat

  // Weekend check
  if (utcDay === 0 || utcDay === 6) return false;

  // US market hours in UTC:
  // During EDT (Mar-Nov): 13:30 - 20:00 UTC
  // During EST (Nov-Mar): 14:30 - 21:00 UTC
  // Use a safe range that covers both: 13:30 - 21:00 UTC
  const currentMinutes = utcH * 60 + utcM;

  // Determine if DST is active (approximate: 2nd Sunday of March to 1st Sunday of November)
  const month = now.getUTCMonth(); // 0-11
  const isDST = month >= 2 && month <= 9; // March(2) through October(9)

  const openMinutes = isDST ? (13 * 60 + 30) : (14 * 60 + 30); // 13:30 or 14:30 UTC
  const closeMinutes = isDST ? (20 * 60) : (21 * 60);           // 20:00 or 21:00 UTC

  return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
}

export async function startPriceSyncJob() {
  console.log(`[PriceSync] Alpaca key: ${env.ALPACA_API_KEY ? env.ALPACA_API_KEY.slice(0, 6) + '...' : 'NOT SET'}`);
  console.log(`[PriceSync] Alpaca secret: ${env.ALPACA_API_SECRET ? '***configured***' : 'NOT SET'}`);
  await processPriceSync();
  setInterval(processPriceSync, 30_000);
  console.log('[PriceSync] Job started - runs every 30s (crypto + stocks)');
}
