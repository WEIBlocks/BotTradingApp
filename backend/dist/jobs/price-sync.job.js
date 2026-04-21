import ccxt from 'ccxt';
import { redisConnection } from '../config/queue.js';
import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { exchangeAssets, exchangeConnections } from '../db/schema/exchanges.js';
import { eq, sql } from 'drizzle-orm';
// Map common ticker symbols to CoinGecko IDs (covers 60+ tokens including exotics)
const COINGECKO_ID_MAP = {
    // Major crypto
    BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', BNB: 'binancecoin',
    XRP: 'ripple', ADA: 'cardano', AVAX: 'avalanche-2', DOT: 'polkadot',
    MATIC: 'matic-network', LINK: 'chainlink', UNI: 'uniswap', LTC: 'litecoin',
    ATOM: 'cosmos', NEAR: 'near', ARB: 'arbitrum', OP: 'optimism',
    DOGE: 'dogecoin', SHIB: 'shiba-inu', PEPE: 'pepe', FLOKI: 'floki',
    TRX: 'tron', TON: 'the-open-network', APT: 'aptos', SUI: 'sui',
    INJ: 'injective-protocol', SEI: 'sei-network', FET: 'fetch-ai',
    RNDR: 'render-token', RENDER: 'render-token', WLD: 'worldcoin-wld',
    JUP: 'jupiter', PYTH: 'pyth-network', TIA: 'celestia',
    // Solana LSTs and ecosystem tokens
    BSOL: 'blazestake-staked-sol', MSOL: 'msol', JITOSOL: 'jito-staked-sol',
    STSOL: 'lido-staked-sol', WSOL: 'wrapped-solana', RAY: 'raydium',
    BONK: 'bonk', WIF: 'dogwifcoin', ORCA: 'orca', MNGO: 'mango-markets',
    // DeFi
    AAVE: 'aave', MKR: 'maker', SNX: 'havven', CRV: 'curve-dao-token',
    COMP: 'compound-governance-token', YFI: 'yearn-finance', SUSHI: 'sushi',
    '1INCH': '1inch', BAL: 'balancer', LRC: 'loopring', ZRX: '0x',
    // NFT/Gaming
    SAND: 'the-sandbox', MANA: 'decentraland', AXS: 'axie-infinity',
    GALA: 'gala', CHZ: 'chiliz', ENJ: 'enjincoin', IMX: 'immutable-x',
    BLUR: 'blur', ORDI: 'ordinals',
    // Layer 2 / Infrastructure
    FIL: 'filecoin', GRT: 'the-graph', BAT: 'basic-attention-token',
    KNC: 'kyber-network-crystal', STORJ: 'storj', OCEAN: 'ocean-protocol',
};
async function fetchCoinGeckoPriceById(symbol) {
    const ticker = symbol.replace('/USDT', '').replace('/USD', '').toUpperCase();
    const id = COINGECKO_ID_MAP[ticker] ?? ticker.toLowerCase();
    try {
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_high_low=true`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok)
            return null;
        const json = await res.json();
        const data = json[id];
        if (!data?.usd)
            return null;
        return {
            price: data.usd,
            change24h: data.usd_24h_change ?? 0,
            volume: data.usd_24h_vol ?? 0,
            high24h: data.usd_high_24h ?? data.usd,
            low24h: data.usd_low_24h ?? data.usd,
            timestamp: Date.now(),
        };
    }
    catch {
        return null;
    }
}
// Base symbols always tracked
const BASE_CRYPTO_SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT'];
const BASE_STOCK_SYMBOLS = ['AAPL', 'MSFT', 'TSLA', 'AMZN', 'GOOGL', 'NVDA', 'META', 'AMD'];
const STABLECOINS = new Set(['USDT', 'USDC', 'USD', 'BUSD', 'DAI', 'TUSD', 'FDUSD']);
// Binance public API is geo-blocked on DigitalOcean NYC (HTTP 451).
// Kraken is the primary price source; CoinGecko covers any token Kraken doesn't list.
// Binance is still used for actual trade execution via user API keys (that's per-user, not public).
const binance = new ccxt.binance({
    enableRateLimit: true,
    options: { defaultType: 'spot' },
});
const kraken = new ccxt.kraken({ enableRateLimit: true });
const KRAKEN_SYMBOL_MAP = {
    'BTC/USDT': 'BTC/USD',
    'ETH/USDT': 'ETH/USD',
    'SOL/USDT': 'SOL/USD',
    'BNB/USDT': 'BNB/USD',
    'XRP/USDT': 'XRP/USD',
    'ADA/USDT': 'ADA/USD',
    'DOGE/USDT': 'DOGE/USD',
    'AVAX/USDT': 'AVAX/USD',
    'DOT/USDT': 'DOT/USD',
    'LINK/USDT': 'LINK/USD',
    'MATIC/USDT': 'MATIC/USD',
    'ATOM/USDT': 'ATOM/USD',
    'LTC/USDT': 'LTC/USD',
    'UNI/USDT': 'UNI/USD',
};
// Always true on DigitalOcean NYC — Binance public API returns 451
const binanceGeoBlocked = true;
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
        // Silently fall back — Binance may be geo-restricted on this server (e.g. DigitalOcean NYC)
        validSymbolsCache = validSymbolsCache ?? new Set(BASE_CRYPTO_SYMBOLS);
        // Mark cache time so we don't retry loadMarkets every 30s — retry once per hour
        validSymbolsCacheTime = Date.now();
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
async function syncCryptoPricesViaBinance(symbols) {
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
async function syncCryptoPricesViaKraken(symbols) {
    let count = 0;
    for (const symbol of symbols) {
        try {
            const krakenSym = KRAKEN_SYMBOL_MAP[symbol] ?? symbol.replace('/USDT', '/USD');
            const ticker = await kraken.fetchTicker(krakenSym);
            if (!ticker || !ticker.last)
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
            count++;
        }
        catch {
            // skip individual symbol failures
        }
    }
    return count;
}
async function syncCryptoPrices(symbols) {
    if (symbols.length === 0)
        return 0;
    // Kraken is primary (Binance public API is geo-blocked on DigitalOcean NYC)
    const krakenCount = await syncCryptoPricesViaKraken(symbols);
    // Use CoinGecko for any symbols not listed on Kraken
    if (krakenCount < symbols.length) {
        const krakenMapped = new Set(Object.values(KRAKEN_SYMBOL_MAP));
        const notOnKraken = symbols.filter(s => {
            const mapped = KRAKEN_SYMBOL_MAP[s] ?? s.replace('/USDT', '/USD');
            return !krakenMapped.has(mapped) && !krakenMapped.has(s);
        });
        let cgCount = 0;
        for (const sym of notOnKraken) {
            const data = await fetchCoinGeckoPriceById(sym);
            if (data) {
                const key = `price:${sym.replace('/', ':')}`;
                await redisConnection.set(key, JSON.stringify(data), 'EX', 120);
                cgCount++;
            }
        }
        if (cgCount > 0)
            console.log(`[PriceSync] CoinGecko filled ${cgCount} tokens not on Kraken`);
    }
    return krakenCount;
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
    // Crypto: try Kraken first (Binance public API is geo-blocked on this server)
    try {
        const krakenSym = KRAKEN_SYMBOL_MAP[symbol] ?? symbol.replace('/USDT', '/USD');
        const ticker = await kraken.fetchTicker(krakenSym);
        if (ticker?.last) {
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
    }
    catch {
        // fall through to KuCoin
    }
    // KuCoin fallback — covers exotic tokens like bSOL, mSOL, RAY, BONK, etc.
    try {
        const kcSym = symbol.replace('/', '-');
        const kcRes = await fetch(`https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=${kcSym}`, { signal: AbortSignal.timeout(5000) });
        if (kcRes.ok) {
            const kcJson = await kcRes.json();
            const price = parseFloat(kcJson?.data?.price ?? '0');
            if (price > 0) {
                const data = { price, change24h: 0, volume: 0, high24h: price, low24h: price, timestamp: Date.now() };
                await redisConnection.set(redisKey, JSON.stringify(data), 'EX', 120);
                return data;
            }
        }
    }
    catch {
        // fall through to CoinGecko
    }
    // Final fallback: CoinGecko free public API — covers 10,000+ tokens, no credentials needed
    const cgData = await fetchCoinGeckoPriceById(symbol);
    if (cgData) {
        await redisConnection.set(redisKey, JSON.stringify(cgData), 'EX', 120);
        return cgData;
    }
    return null;
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
