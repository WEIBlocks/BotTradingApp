import ccxt from 'ccxt';
import { redisConnection } from '../config/queue.js';
import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { exchangeAssets, exchangeConnections } from '../db/schema/exchanges.js';
import { eq, sql } from 'drizzle-orm';
// Base symbols always tracked
const BASE_CRYPTO_SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT'];
const BASE_STOCK_SYMBOLS = ['AAPL', 'MSFT', 'TSLA', 'AMZN', 'GOOGL', 'NVDA', 'META', 'AMD'];
const STABLECOINS = new Set(['USDT', 'USDC', 'USD', 'BUSD', 'DAI', 'TUSD', 'FDUSD']);
const binance = new ccxt.binance({
    enableRateLimit: true,
    options: { defaultType: 'spot' },
});
// Lazy-init Alpaca client for market data (no auth needed for free tier snapshots)
let alpacaClient = null;
async function getAlpacaClient() {
    if (alpacaClient)
        return alpacaClient;
    try {
        const Alpaca = (await import('@alpacahq/alpaca-trade-api')).default;
        alpacaClient = new Alpaca({
            keyId: env.ALPACA_API_KEY || 'PLACEHOLDER',
            secretKey: env.ALPACA_API_SECRET || 'PLACEHOLDER',
            paper: true,
            usePolygon: false,
        });
        return alpacaClient;
    }
    catch {
        return null;
    }
}
// Cache of known valid Binance symbols
let validSymbolsCache = null;
let validSymbolsCacheTime = 0;
const VALID_SYMBOLS_TTL = 3600_000;
async function getValidBinanceSymbols() {
    if (validSymbolsCache && Date.now() - validSymbolsCacheTime < VALID_SYMBOLS_TTL) {
        return validSymbolsCache;
    }
    try {
        const markets = await binance.loadMarkets();
        validSymbolsCache = new Set(Object.keys(markets));
        validSymbolsCacheTime = Date.now();
    }
    catch {
        validSymbolsCache = validSymbolsCache ?? new Set(BASE_CRYPTO_SYMBOLS);
    }
    return validSymbolsCache;
}
/** Discover user-held symbols, split by asset class */
async function discoverUserSymbols() {
    try {
        const rows = await db
            .select({
            symbol: exchangeAssets.symbol,
            assetClass: exchangeConnections.assetClass,
        })
            .from(exchangeAssets)
            .innerJoin(exchangeConnections, eq(exchangeAssets.exchangeConnId, exchangeConnections.id))
            .where(sql `${exchangeAssets.amount}::numeric > 0`);
        const crypto = [];
        const stocks = [];
        const seen = new Set();
        for (const row of rows) {
            const sym = row.symbol.toUpperCase();
            if (STABLECOINS.has(sym))
                continue;
            if (seen.has(sym))
                continue;
            seen.add(sym);
            if (row.assetClass === 'stocks') {
                stocks.push(sym);
            }
            else {
                crypto.push(`${sym}/USDT`);
            }
        }
        return { crypto, stocks };
    }
    catch {
        return { crypto: [], stocks: [] };
    }
}
async function syncCryptoPrices(symbols) {
    if (symbols.length === 0)
        return 0;
    const validSymbols = await getValidBinanceSymbols();
    const fetchSymbols = symbols.filter(s => validSymbols.has(s));
    if (fetchSymbols.length === 0)
        return 0;
    const BATCH_SIZE = 20;
    for (let i = 0; i < fetchSymbols.length; i += BATCH_SIZE) {
        const batch = fetchSymbols.slice(i, i + BATCH_SIZE);
        const tickers = await binance.fetchTickers(batch);
        for (const symbol of batch) {
            const ticker = tickers[symbol];
            if (!ticker)
                continue;
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
async function syncStockPrices(symbols) {
    if (symbols.length === 0)
        return 0;
    const alpaca = await getAlpacaClient();
    if (!alpaca)
        return 0;
    try {
        let count = 0;
        for (const symbol of symbols) {
            try {
                // Use getLatestTrade + getBarsV2 (more reliable than getSnapshot)
                const trade = await alpaca.getLatestTrade(symbol);
                const price = trade?.Price ?? trade?.p ?? 0;
                if (price <= 0)
                    continue;
                // Try to get daily bar for high/low/volume
                let high = price, low = price, volume = 0, prevClose = price;
                try {
                    const bars = alpaca.getBarsV2(symbol, { limit: 2, timeframe: '1Day' });
                    const barArr = [];
                    for await (const bar of bars)
                        barArr.push(bar);
                    if (barArr.length > 0) {
                        const latest = barArr[barArr.length - 1];
                        high = latest.HighPrice ?? latest.h ?? price;
                        low = latest.LowPrice ?? latest.l ?? price;
                        volume = latest.Volume ?? latest.v ?? 0;
                        if (barArr.length > 1) {
                            prevClose = barArr[barArr.length - 2].ClosePrice ?? barArr[barArr.length - 2].c ?? price;
                        }
                    }
                }
                catch { }
                const change24h = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
                const data = { price, change24h, volume, high24h: high, low24h: low, timestamp: Date.now() };
                // Store under both plain symbol and with /USD suffix
                await redisConnection.set(`price:${symbol}`, JSON.stringify(data), 'EX', 120);
                await redisConnection.set(`price:${symbol}:USD`, JSON.stringify(data), 'EX', 120);
                count++;
            }
            catch { }
        }
        // Cache market hours status
        try {
            const clock = await alpaca.getClock();
            await redisConnection.set('market:us:open', clock.is_open ? '1' : '0', 'EX', 60);
        }
        catch { }
        return count;
    }
    catch (err) {
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
    }
    catch (err) {
        console.error('[PriceSync] Error:', err.message);
    }
}
export async function getPrice(symbol) {
    // Try exact key first
    const redisKey = `price:${symbol.replace('/', ':')}`;
    const raw = await redisConnection.get(redisKey);
    if (raw)
        return JSON.parse(raw);
    // For stock symbols like AAPL/USD, also try just AAPL (how stock sync stores them)
    const cleanSymbol = symbol.replace('/USD', '').replace('/USDT', '');
    if (cleanSymbol !== symbol) {
        const stockKey = `price:${cleanSymbol}`;
        const stockRaw = await redisConnection.get(stockKey);
        if (stockRaw)
            return JSON.parse(stockRaw);
    }
    // Fallback: fetch directly — detect stock vs crypto
    const isStock = !symbol.includes('/') || symbol.endsWith('/USD');
    if (isStock) {
        try {
            const alpaca = await getAlpacaClient();
            if (!alpaca)
                return null;
            const stockSym = cleanSymbol;
            const trade = await alpaca.getLatestTrade(stockSym);
            const price = trade?.Price ?? trade?.p ?? 0;
            if (price <= 0)
                return null;
            const data = {
                price,
                change24h: 0,
                volume: 0,
                high24h: price,
                low24h: price,
                timestamp: Date.now(),
            };
            await redisConnection.set(`price:${stockSym}`, JSON.stringify(data), 'EX', 120);
            await redisConnection.set(redisKey, JSON.stringify(data), 'EX', 120);
            return data;
        }
        catch {
            return null;
        }
    }
    // Crypto fallback via Binance
    try {
        const ticker = await binance.fetchTicker(symbol);
        if (!ticker)
            return null;
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
    }
    catch {
        return null;
    }
}
/** Check if US stock market is currently open */
export async function isUSMarketOpen() {
    // 1. Time-based check is always computed — it is the primary source of truth
    const timeBasedResult = isMarketOpenByTime();
    // 2. If time says closed (weekend / clearly outside hours), trust it — no API needed
    if (!timeBasedResult)
        return false;
    // 3. Time says OPEN — also try Alpaca clock for holiday detection (e.g. market holiday)
    //    But only trust Alpaca's "closed" response if it was cached within the last 5 minutes
    try {
        const alpaca = await getAlpacaClient();
        if (alpaca) {
            const clock = await alpaca.getClock();
            const result = clock.is_open;
            await redisConnection.set('market:us:open', result ? '1' : '0', 'EX', 300).catch(() => { });
            return result;
        }
    }
    catch {
        // Alpaca unavailable — fall back to time-based
    }
    return timeBasedResult;
}
/** Pure time-based US market hours check (no API dependency) */
function isMarketOpenByTime() {
    const now = new Date();
    const utcH = now.getUTCHours();
    const utcM = now.getUTCMinutes();
    const utcDay = now.getUTCDay(); // 0=Sun, 6=Sat
    // Weekend check
    if (utcDay === 0 || utcDay === 6)
        return false;
    // US market hours in UTC:
    // During EDT (Mar-Nov): 13:30 - 20:00 UTC
    // During EST (Nov-Mar): 14:30 - 21:00 UTC
    // Use a safe range that covers both: 13:30 - 21:00 UTC
    const currentMinutes = utcH * 60 + utcM;
    // Determine if DST is active (approximate: 2nd Sunday of March to 1st Sunday of November)
    const month = now.getUTCMonth(); // 0-11
    const isDST = month >= 2 && month <= 9; // March(2) through October(9)
    const openMinutes = isDST ? (13 * 60 + 30) : (14 * 60 + 30); // 13:30 or 14:30 UTC
    const closeMinutes = isDST ? (20 * 60) : (21 * 60); // 20:00 or 21:00 UTC
    return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
}
export async function startPriceSyncJob() {
    console.log(`[PriceSync] Alpaca key: ${env.ALPACA_API_KEY ? env.ALPACA_API_KEY.slice(0, 6) + '...' : 'NOT SET'}`);
    console.log(`[PriceSync] Alpaca secret: ${env.ALPACA_API_SECRET ? '***configured***' : 'NOT SET'}`);
    await processPriceSync();
    setInterval(processPriceSync, 30_000);
    console.log('[PriceSync] Job started - runs every 30s (crypto + stocks)');
}
