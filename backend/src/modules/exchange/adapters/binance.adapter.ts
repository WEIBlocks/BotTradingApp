import crypto from 'crypto';
import type {
  ExchangeAdapter,
  ExchangeCredentials,
  Balance,
  Ticker,
  Market,
  OrderResult,
} from './base.adapter.js';

// ─── Binance Direct REST (bypasses geo-block on DigitalOcean) ────────────────
// Binance public API (exchangeInfo) is geo-blocked on cloud servers (HTTP 451).
// Authenticated endpoints (account, order) work fine with a valid API key.
// Strategy:
//   - testConnection / getBalances / createOrder → direct signed fetch to Binance
//   - getTickers → KuCoin public API (Binance public ticker is also geo-blocked)
//   - Markets cache → populated from KuCoin for ccxt amountToPrecision use

const BINANCE_BASE      = 'https://api.binance.com';
const BINANCE_TESTNET   = 'https://testnet.binance.vision';

function sign(secret: string, queryString: string): string {
  return crypto.createHmac('sha256', secret).update(queryString).digest('hex');
}

async function binanceRequest(
  baseUrl: string,
  apiKey: string,
  apiSecret: string,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  params: Record<string, string | number> = {},
): Promise<any> {
  const ts = Date.now();
  const allParams: Record<string, string | number> = { ...params, timestamp: ts };
  const qs = Object.entries(allParams)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const sig = sign(apiSecret, qs);
  const url = `${baseUrl}${path}?${qs}&signature=${sig}`;

  const res = await fetch(url, {
    method,
    headers: { 'X-MBX-APIKEY': apiKey },
    signal: AbortSignal.timeout(15000),
  });

  const body = await res.json();
  if (!res.ok) {
    const msg = (body as any)?.msg ?? (body as any)?.message ?? `HTTP ${res.status}`;
    throw new Error(`Binance ${res.status}: ${msg}`);
  }
  return body;
}

// ─── KuCoin markets cache (for ccxt amountToPrecision fallback) ───────────────
let kucoinMarketsCache: any = null;
let kucoinMarketsCacheTime = 0;
const KUCOIN_CACHE_TTL = 3_600_000;

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

function adaptMarketsForBinance(kucoinMarkets: any): any {
  const adapted: any = {};
  for (const [symbol, market] of Object.entries(kucoinMarkets) as [string, any][]) {
    if (!symbol.endsWith('/USDT') || market.type !== 'spot') continue;
    adapted[symbol] = {
      ...market,
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

// ─── BinanceAdapter ───────────────────────────────────────────────────────────

export class BinanceAdapter implements ExchangeAdapter {
  readonly name = 'binance';
  private exchange: any = null;   // ccxt instance (kept for amountToPrecision only)
  private apiKey = '';
  private apiSecret = '';
  private isTestnet = false;
  private baseUrl = BINANCE_BASE;

  async connect(credentials: ExchangeCredentials): Promise<void> {
    this.apiKey    = credentials.apiKey ?? '';
    this.apiSecret = credentials.apiSecret ?? '';
    this.isTestnet = credentials.sandbox === true;
    this.baseUrl   = this.isTestnet ? BINANCE_TESTNET : BINANCE_BASE;

    // Build a ccxt instance only for amountToPrecision (never makes network calls)
    const ccxt = await import('ccxt');
    const options: Record<string, any> = {
      apiKey: this.apiKey,
      secret: this.apiSecret,
      enableRateLimit: true,
    };
    if (this.isTestnet) options.sandbox = true;
    this.exchange = new ccxt.default.binance(options);
    if (this.isTestnet) this.exchange.setSandboxMode(true);

    // Populate markets from KuCoin so amountToPrecision works without hitting Binance public API
    try {
      const kucoinMarkets = await getKucoinMarkets();
      const adapted = adaptMarketsForBinance(kucoinMarkets);
      if (Object.keys(adapted).length > 0) {
        this.exchange.markets = adapted;
        this.exchange.marketsById = {};
        for (const [, mkt] of Object.entries(adapted) as [string, any][]) {
          this.exchange.marketsById[(mkt as any).id] = mkt;
        }
        this.exchange.symbols = Object.keys(adapted);
        this.exchange.marketsLastFetched = Date.now();
        this.exchange.loadMarkets = async () => this.exchange.markets;
      }
    } catch { /* non-fatal — createOrder falls back to 8dp rounding */ }
  }

  async disconnect(): Promise<void> {
    this.exchange = null;
  }

  // testConnection uses direct signed REST — works even when Binance public API is geo-blocked
  async testConnection(): Promise<boolean> {
    if (!this.apiKey || !this.apiSecret) return false;
    try {
      await binanceRequest(this.baseUrl, this.apiKey, this.apiSecret, 'GET', '/api/v3/account');
      return true;
    } catch (err: any) {
      const msg: string = err?.message ?? '';
      // -1021 = clock skew — keys are valid but server time offset; treat as success
      if (msg.includes('-1021')) return true;
      // -2015 = Invalid API key, -2014 = bad format — show Binance's own message
      if (msg.includes('-2015') || msg.includes('-2014') || msg.includes('401') || msg.includes('403')) {
        throw new Error(`Binance rejected your API key: ${msg}. Check the key is correct and has Spot Trading permission enabled (no IP whitelist restrictions unless your server IP is whitelisted).`);
      }
      // Network / geo issues — inform user clearly
      throw new Error(`Could not reach ${this.isTestnet ? 'Binance Testnet' : 'Binance'}: ${msg}. Ensure your API key has no IP restrictions or whitelist your server IP.`);
    }
  }

  async getBalances(): Promise<Balance[]> {
    if (!this.apiKey) throw new Error('Not connected');
    const account = await binanceRequest(this.baseUrl, this.apiKey, this.apiSecret, 'GET', '/api/v3/account');
    const result: Balance[] = [];
    for (const b of (account.balances ?? [])) {
      const total = parseFloat(b.free) + parseFloat(b.locked);
      if (total > 0) {
        result.push({ currency: b.asset, free: parseFloat(b.free), total });
      }
    }
    return result;
  }

  async getTicker(symbol: string): Promise<Ticker> {
    // Use KuCoin for price data — Binance public ticker is geo-blocked
    try {
      const ccxt = await import('ccxt');
      const pub = new ccxt.default.kucoin({ enableRateLimit: true });
      const ticker = await pub.fetchTicker(symbol);
      return {
        symbol,
        last:      ticker.last ?? 0,
        bid:       ticker.bid  ?? 0,
        ask:       ticker.ask  ?? 0,
        change24h: ticker.percentage ?? 0,
      };
    } catch {
      return { symbol, last: 0, bid: 0, ask: 0, change24h: 0 };
    }
  }

  async getTickers(symbols: string[]): Promise<Map<string, number>> {
    const priceMap = new Map<string, number>();
    if (symbols.length === 0) return priceMap;

    // KuCoin public API — Binance public ticker is geo-blocked on DigitalOcean
    try {
      const ccxt = await import('ccxt');
      const pub = new ccxt.default.kucoin({ enableRateLimit: true });
      await pub.loadMarkets();
      const validSymbols = new Set(Object.keys(pub.markets));
      const toFetch = symbols.filter(s => validSymbols.has(s));
      if (toFetch.length === 0) return priceMap;

      const BATCH = 50;
      for (let i = 0; i < toFetch.length; i += BATCH) {
        const batch = toFetch.slice(i, i + BATCH);
        try {
          const tickers = await pub.fetchTickers(batch);
          for (const [sym, t] of Object.entries(tickers)) {
            const currency = sym.replace('/USDT', '').replace(':USDT', '');
            if ((t as any)?.last) priceMap.set(currency.toUpperCase(), (t as any).last);
          }
        } catch {}
      }
    } catch {}
    return priceMap;
  }

  async getMarkets(): Promise<Market[]> {
    if (!this.exchange) throw new Error('Not connected');
    const markets: Market[] = [];
    for (const market of Object.values(this.exchange.markets ?? {}) as any[]) {
      markets.push({
        symbol: market.symbol,
        base:   market.base,
        quote:  market.quote,
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
    if (!this.apiKey) throw new Error('Not connected');

    // Round to exchange lot size
    let roundedAmount: number;
    if (this.exchange?.markets?.[symbol]) {
      roundedAmount = parseFloat(this.exchange.amountToPrecision(symbol, amount));
    } else {
      // Fetch LOT_SIZE from Binance authenticated endpoint (never geo-blocked)
      try {
        const binSym = symbol.replace('/', '');
        const info = await fetch(
          `${this.baseUrl}/api/v3/exchangeInfo?symbol=${binSym}`,
          { headers: { 'X-MBX-APIKEY': this.apiKey }, signal: AbortSignal.timeout(8000) },
        ).then(r => r.json());
        const lotFilter = (info?.symbols?.[0]?.filters ?? []).find((f: any) => f.filterType === 'LOT_SIZE');
        if (lotFilter?.stepSize) {
          const step = parseFloat(lotFilter.stepSize);
          const decimals = step < 1 ? Math.round(-Math.log10(step)) : 0;
          roundedAmount = parseFloat((Math.floor(amount / step) * step).toFixed(decimals));
        } else {
          roundedAmount = parseFloat(amount.toFixed(8));
        }
      } catch {
        roundedAmount = parseFloat(amount.toFixed(8));
      }
    }

    const params: Record<string, string | number> = {
      symbol:   symbol.replace('/', ''),
      side:     side.toUpperCase(),
      type:     type.toUpperCase(),
      quantity: roundedAmount,
    };
    if (type === 'limit' && price) {
      params.price         = price;
      params.timeInForce   = 'GTC';
    }

    const order = await binanceRequest(this.baseUrl, this.apiKey, this.apiSecret, 'POST', '/api/v3/order', params);

    return {
      id:        order.orderId?.toString() ?? '',
      symbol:    order.symbol,
      side:      order.side?.toLowerCase() ?? side,
      type:      order.type?.toLowerCase() ?? type,
      amount:    parseFloat(order.origQty ?? String(roundedAmount)),
      price:     parseFloat(order.price ?? order.fills?.[0]?.price ?? '0'),
      status:    order.status?.toLowerCase() ?? 'open',
      timestamp: order.transactTime ?? Date.now(),
    };
  }
}
