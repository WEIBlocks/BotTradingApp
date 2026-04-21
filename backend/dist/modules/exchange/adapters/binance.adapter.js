// Binance public REST (exchangeInfo, klines, etc.) is geo-blocked on DigitalOcean NYC (HTTP 451).
// ccxt internally calls loadMarkets() → exchangeInfo before any authenticated call.
// Fix: pre-populate ccxt's markets cache from KuCoin (same symbols) so ccxt never needs
// to call Binance's public endpoint. All authenticated trade calls (createOrder, fetchBalance)
// go directly to Binance via the user's API key — those are never geo-blocked.
// Shared KuCoin markets cache (loaded once, reused across all adapter instances)
let kucoinMarketsCache = null;
let kucoinMarketsCacheTime = 0;
const KUCOIN_CACHE_TTL = 3600_000; // 1 hour
async function getKucoinMarkets() {
    if (kucoinMarketsCache && Date.now() - kucoinMarketsCacheTime < KUCOIN_CACHE_TTL) {
        return kucoinMarketsCache;
    }
    try {
        const ccxt = await import('ccxt');
        const kucoin = new ccxt.default.kucoin({ enableRateLimit: true });
        const markets = await kucoin.loadMarkets();
        kucoinMarketsCache = markets;
        kucoinMarketsCacheTime = Date.now();
        return markets;
    }
    catch {
        return kucoinMarketsCache ?? {};
    }
}
// Convert KuCoin market entries to Binance-compatible format so ccxt accepts them
function adaptMarketsForBinance(kucoinMarkets) {
    const adapted = {};
    for (const [symbol, market] of Object.entries(kucoinMarkets)) {
        // Only USDT spot pairs — what Binance bot trading uses
        if (!symbol.endsWith('/USDT') || market.type !== 'spot')
            continue;
        adapted[symbol] = {
            ...market,
            // Binance-specific fields ccxt needs
            id: symbol.replace('/', '').replace('-', ''),
            symbol,
            base: market.base,
            quote: market.quote,
            active: true,
            type: 'spot',
            spot: true,
            future: false,
            swap: false,
            limits: market.limits ?? {
                amount: { min: 0.00001, max: 999999 },
                price: { min: 0.00000001, max: 999999 },
                cost: { min: 1, max: 999999 },
            },
            precision: market.precision ?? { amount: 8, price: 8 },
            info: market.info ?? {},
        };
    }
    return adapted;
}
export class BinanceAdapter {
    name = 'binance';
    exchange = null;
    async connect(credentials) {
        const ccxt = await import('ccxt');
        const useTestnet = credentials.sandbox === true;
        const options = {
            apiKey: credentials.apiKey,
            secret: credentials.apiSecret,
            enableRateLimit: true,
        };
        if (useTestnet) {
            options.sandbox = true;
        }
        this.exchange = new ccxt.default.binance(options);
        if (useTestnet) {
            this.exchange.setSandboxMode(true);
        }
        // Helper to populate KuCoin markets and block ccxt from re-fetching the blocked endpoint
        const populateFromKuCoin = async () => {
            const kucoinMarkets = await getKucoinMarkets();
            const adapted = adaptMarketsForBinance(kucoinMarkets);
            if (Object.keys(adapted).length > 0) {
                this.exchange.markets = adapted;
                this.exchange.marketsById = {};
                for (const [, mkt] of Object.entries(adapted)) {
                    this.exchange.marketsById[mkt.id] = mkt;
                }
                this.exchange.symbols = Object.keys(adapted);
                // Prevent ccxt from re-calling loadMarkets() on subsequent API calls
                this.exchange.marketsLastFetched = Date.now();
                // Override loadMarkets to no-op so ccxt never hits the geo-blocked endpoint again
                this.exchange.loadMarkets = async () => this.exchange.markets;
            }
        };
        if (useTestnet) {
            // Testnet public endpoints (testnet.binance.vision) may be geo-blocked on DigitalOcean NYC.
            // Try to load real market data for correct lot sizes; fall back to KuCoin if blocked.
            try {
                await this.exchange.loadMarkets();
            }
            catch {
                // Fall back to KuCoin pre-population if testnet loadMarkets fails (geo-blocked)
                try {
                    await populateFromKuCoin();
                }
                catch { }
            }
        }
        else {
            // Live Binance public API (api.binance.com/exchangeInfo) is geo-blocked on DigitalOcean NYC.
            // Pre-populate markets from KuCoin so ccxt never calls the blocked endpoint.
            try {
                await populateFromKuCoin();
            }
            catch {
                // KuCoin fallback failed — live trades may fail on geo-blocked exchangeInfo
            }
        }
    }
    async disconnect() {
        this.exchange = null;
    }
    async testConnection() {
        if (!this.exchange)
            return false;
        try {
            await this.exchange.fetchBalance();
            return true;
        }
        catch {
            return false;
        }
    }
    async getBalances() {
        if (!this.exchange)
            throw new Error('Not connected');
        const balance = await this.exchange.fetchBalance();
        const result = [];
        for (const [currency, data] of Object.entries(balance.total || {})) {
            const total = Number(data);
            if (total > 0) {
                const free = Number(balance.free?.[currency] ?? 0);
                result.push({ currency, free, total });
            }
        }
        return result;
    }
    async getTicker(symbol) {
        if (!this.exchange)
            throw new Error('Not connected');
        const ticker = await this.exchange.fetchTicker(symbol);
        return {
            symbol: ticker.symbol,
            last: ticker.last ?? 0,
            bid: ticker.bid ?? 0,
            ask: ticker.ask ?? 0,
            change24h: ticker.percentage ?? 0,
        };
    }
    async getTickers(symbols) {
        const priceMap = new Map();
        if (symbols.length === 0)
            return priceMap;
        // Use KuCoin public API for pricing — Binance public API is geo-blocked on DigitalOcean NYC.
        const ccxt = await import('ccxt');
        const publicExchange = new ccxt.default.kucoin({ enableRateLimit: true });
        try {
            await publicExchange.loadMarkets();
            const validSymbols = new Set(Object.keys(publicExchange.markets));
            const toFetch = symbols.filter(s => validSymbols.has(s));
            if (toFetch.length === 0)
                return priceMap;
            const BATCH = 50;
            for (let i = 0; i < toFetch.length; i += BATCH) {
                const batch = toFetch.slice(i, i + BATCH);
                try {
                    const tickers = await publicExchange.fetchTickers(batch);
                    for (const [sym, ticker] of Object.entries(tickers)) {
                        const t = ticker;
                        const currency = sym.replace('/USDT', '').replace(':USDT', '');
                        if (t?.last)
                            priceMap.set(currency.toUpperCase(), t.last);
                    }
                }
                catch {
                    // Skip failed batch
                }
            }
        }
        catch {
            // Could not load markets — return empty map
        }
        return priceMap;
    }
    async getMarkets() {
        if (!this.exchange)
            throw new Error('Not connected');
        // Return pre-populated markets (from KuCoin cache) to avoid geo-blocked Binance call
        const markets = [];
        for (const market of Object.values(this.exchange.markets ?? {})) {
            markets.push({
                symbol: market.symbol,
                base: market.base,
                quote: market.quote,
                active: market.active ?? true,
            });
        }
        return markets;
    }
    async createOrder(symbol, side, type, amount, price, _options) {
        if (!this.exchange)
            throw new Error('Not connected');
        // Round amount to exchange lot size — prevents LOT_SIZE filter failures
        let roundedAmount;
        if (this.exchange.markets?.[symbol]) {
            roundedAmount = parseFloat(this.exchange.amountToPrecision(symbol, amount));
        }
        else {
            // Symbol not in KuCoin-pre-populated cache (exotic pair) — derive step size from Binance
            // exchangeInfo authenticated call (never geo-blocked) to get LOT_SIZE filter
            try {
                const binanceSymbol = symbol.replace('/', '');
                const info = await this.exchange.publicGetExchangeinfo({ symbol: binanceSymbol });
                const lotFilter = (info?.symbols?.[0]?.filters ?? []).find((f) => f.filterType === 'LOT_SIZE');
                if (lotFilter?.stepSize) {
                    const stepSize = parseFloat(lotFilter.stepSize);
                    const decimals = stepSize < 1 ? Math.round(-Math.log10(stepSize)) : 0;
                    roundedAmount = Math.floor(amount / stepSize) * stepSize;
                    roundedAmount = parseFloat(roundedAmount.toFixed(decimals));
                }
                else {
                    roundedAmount = parseFloat(amount.toFixed(8));
                }
            }
            catch {
                // Best-effort — use 8dp which is valid for most Binance pairs
                roundedAmount = parseFloat(amount.toFixed(8));
            }
        }
        const order = type === 'limit'
            ? await this.exchange.createOrder(symbol, type, side, roundedAmount, price)
            : await this.exchange.createOrder(symbol, type, side, roundedAmount);
        return {
            id: order.id,
            symbol: order.symbol,
            side: order.side,
            type: order.type,
            amount: order.amount ?? amount,
            price: order.price ?? order.average ?? 0,
            status: order.status ?? 'open',
            timestamp: order.timestamp ?? Date.now(),
        };
    }
}
