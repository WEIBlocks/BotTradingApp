import type {
  ExchangeAdapter,
  ExchangeCredentials,
  Balance,
  Ticker,
  Market,
  OrderResult,
} from './base.adapter.js';

// Binance public REST (exchangeInfo, klines, etc.) is geo-blocked on DigitalOcean NYC (HTTP 451).
// ccxt internally calls loadMarkets() → exchangeInfo before any authenticated call.
// Fix: pre-populate ccxt's markets cache from KuCoin (same symbols) so ccxt never needs
// to call Binance's public endpoint. All authenticated trade calls (createOrder, fetchBalance)
// go directly to Binance via the user's API key — those are never geo-blocked.

// Shared KuCoin markets cache (loaded once, reused across all adapter instances)
let kucoinMarketsCache: any = null;
let kucoinMarketsCacheTime = 0;
const KUCOIN_CACHE_TTL = 3600_000; // 1 hour

async function getKucoinMarkets(): Promise<any> {
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
  } catch {
    return kucoinMarketsCache ?? {};
  }
}

// Convert KuCoin market entries to Binance-compatible format so ccxt accepts them
function adaptMarketsForBinance(kucoinMarkets: any): any {
  const adapted: any = {};
  for (const [symbol, market] of Object.entries(kucoinMarkets) as [string, any][]) {
    // Only USDT spot pairs — what Binance bot trading uses
    if (!symbol.endsWith('/USDT') || market.type !== 'spot') continue;
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

export class BinanceAdapter implements ExchangeAdapter {
  readonly name = 'binance';
  private exchange: any = null;

  async connect(credentials: ExchangeCredentials): Promise<void> {
    const ccxt = await import('ccxt');
    const useTestnet = credentials.sandbox === true;

    const options: Record<string, any> = {
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

    // Pre-populate markets from KuCoin so ccxt never calls Binance's geo-blocked public API.
    // This prevents the 451 error on loadMarkets() / exchangeInfo during fetchBalance / createOrder.
    try {
      const kucoinMarkets = await getKucoinMarkets();
      const adapted = adaptMarketsForBinance(kucoinMarkets);
      if (Object.keys(adapted).length > 0) {
        this.exchange.markets = adapted;
        this.exchange.marketsById = {};
        for (const [sym, mkt] of Object.entries(adapted) as [string, any][]) {
          this.exchange.marketsById[mkt.id] = mkt;
        }
        this.exchange.symbols = Object.keys(adapted);
      }
    } catch {
      // If KuCoin fails, proceed without pre-populated markets.
      // Trade may still fail if Binance's exchangeInfo is blocked, but that's unavoidable.
    }
  }

  async disconnect(): Promise<void> {
    this.exchange = null;
  }

  async testConnection(): Promise<boolean> {
    if (!this.exchange) return false;
    try {
      await this.exchange.fetchBalance();
      return true;
    } catch {
      return false;
    }
  }

  async getBalances(): Promise<Balance[]> {
    if (!this.exchange) throw new Error('Not connected');
    const balance = await this.exchange.fetchBalance();
    const result: Balance[] = [];
    for (const [currency, data] of Object.entries(balance.total || {})) {
      const total = Number(data);
      if (total > 0) {
        const free = Number(balance.free?.[currency] ?? 0);
        result.push({ currency, free, total });
      }
    }
    return result;
  }

  async getTicker(symbol: string): Promise<Ticker> {
    if (!this.exchange) throw new Error('Not connected');
    const ticker = await this.exchange.fetchTicker(symbol);
    return {
      symbol: ticker.symbol,
      last: ticker.last ?? 0,
      bid: ticker.bid ?? 0,
      ask: ticker.ask ?? 0,
      change24h: ticker.percentage ?? 0,
    };
  }

  async getTickers(symbols: string[]): Promise<Map<string, number>> {
    const priceMap = new Map<string, number>();
    if (symbols.length === 0) return priceMap;

    // Use KuCoin public API for pricing — Binance public API is geo-blocked on DigitalOcean NYC.
    const ccxt = await import('ccxt');
    const publicExchange = new ccxt.default.kucoin({ enableRateLimit: true });

    try {
      await publicExchange.loadMarkets();
      const validSymbols = new Set(Object.keys(publicExchange.markets));
      const toFetch = symbols.filter(s => validSymbols.has(s));
      if (toFetch.length === 0) return priceMap;

      const BATCH = 50;
      for (let i = 0; i < toFetch.length; i += BATCH) {
        const batch = toFetch.slice(i, i + BATCH);
        try {
          const tickers = await publicExchange.fetchTickers(batch);
          for (const [sym, ticker] of Object.entries(tickers)) {
            const t = ticker as any;
            const currency = sym.replace('/USDT', '').replace(':USDT', '');
            if (t?.last) priceMap.set(currency.toUpperCase(), t.last);
          }
        } catch {
          // Skip failed batch
        }
      }
    } catch {
      // Could not load markets — return empty map
    }
    return priceMap;
  }

  async getMarkets(): Promise<Market[]> {
    if (!this.exchange) throw new Error('Not connected');
    // Return pre-populated markets (from KuCoin cache) to avoid geo-blocked Binance call
    const markets: Market[] = [];
    for (const market of Object.values(this.exchange.markets ?? {}) as any[]) {
      markets.push({
        symbol: market.symbol,
        base: market.base,
        quote: market.quote,
        active: market.active ?? true,
      });
    }
    return markets;
  }

  async createOrder(
    symbol: string,
    side: 'buy' | 'sell',
    type: 'market' | 'limit',
    amount: number,
    price?: number,
    _options?: import('./base.adapter.js').OrderOptions,
  ): Promise<OrderResult> {
    if (!this.exchange) throw new Error('Not connected');

    const order = type === 'limit'
      ? await this.exchange.createOrder(symbol, type, side, amount, price)
      : await this.exchange.createOrder(symbol, type, side, amount);

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
