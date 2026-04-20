import type {
  ExchangeAdapter,
  ExchangeCredentials,
  Balance,
  Ticker,
  Market,
  OrderResult,
  OrderOptions,
} from './base.adapter.js';

export class AlpacaAdapter implements ExchangeAdapter {
  readonly name = 'alpaca';
  readonly assetClass = 'stocks' as const;
  private client: any = null;

  async connect(credentials: ExchangeCredentials): Promise<void> {
    const Alpaca = (await import('@alpacahq/alpaca-trade-api')).default;
    this.client = new Alpaca({
      keyId: credentials.apiKey,
      secretKey: credentials.apiSecret,
      paper: credentials.sandbox === true, // only use paper trading when explicitly opted in
      usePolygon: false,
    });
  }

  async disconnect(): Promise<void> {
    this.client = null;
  }

  async testConnection(): Promise<boolean> {
    if (!this.client) return false;
    try {
      await this.client.getAccount();
      return true;
    } catch {
      return false;
    }
  }

  async getBalances(): Promise<Balance[]> {
    if (!this.client) throw new Error('Not connected');
    const result: Balance[] = [];

    // Get account cash balance
    const account = await this.client.getAccount();
    const cash = parseFloat(account.cash ?? '0');
    const buyingPower = parseFloat(account.buying_power ?? '0');
    if (cash > 0) {
      result.push({ currency: 'USD', free: buyingPower, total: cash });
    }

    // Get stock positions
    const positions = await this.client.getPositions();
    for (const pos of positions) {
      const qty = parseFloat(pos.qty ?? '0');
      const marketValue = parseFloat(pos.market_value ?? '0');
      if (qty > 0) {
        result.push({
          currency: pos.symbol,
          free: qty,
          total: marketValue, // total as market value in USD for portfolio
        });
      }
    }

    return result;
  }

  async getTicker(symbol: string): Promise<Ticker> {
    if (!this.client) throw new Error('Not connected');
    // Strip /USD if present (normalize stock symbols)
    const cleanSymbol = symbol.replace('/USD', '').replace('/USDT', '');

    try {
      const snapshot = await this.client.getSnapshot(cleanSymbol);
      const lastTrade = snapshot.latestTrade;
      const lastQuote = snapshot.latestQuote;
      const dailyBar = snapshot.dailyBar;
      const prevClose = snapshot.prevDailyBar?.c ?? dailyBar?.o ?? 0;
      const currentPrice = lastTrade?.p ?? 0;
      const change24h = prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0;

      return {
        symbol: cleanSymbol,
        last: currentPrice,
        bid: lastQuote?.bp ?? currentPrice,
        ask: lastQuote?.ap ?? currentPrice,
        change24h,
      };
    } catch {
      // Fallback: try latest trade only
      const trade = await this.client.getLatestTrade(cleanSymbol);
      return {
        symbol: cleanSymbol,
        last: trade?.p ?? 0,
        bid: trade?.p ?? 0,
        ask: trade?.p ?? 0,
        change24h: 0,
      };
    }
  }

  async getMarkets(): Promise<Market[]> {
    if (!this.client) throw new Error('Not connected');
    const assets = await this.client.getAssets({
      status: 'active',
      asset_class: 'us_equity',
    });

    return assets
      .filter((a: any) => a.tradable)
      .slice(0, 500) // limit to avoid huge response
      .map((a: any) => ({
        symbol: a.symbol,
        base: a.symbol,
        quote: 'USD',
        active: a.tradable ?? true,
      }));
  }

  async createOrder(
    symbol: string,
    side: 'buy' | 'sell',
    type: 'market' | 'limit',
    amount: number,
    price?: number,
    options?: OrderOptions,
  ): Promise<OrderResult> {
    if (!this.client) throw new Error('Not connected');
    const cleanSymbol = symbol.replace('/USD', '').replace('/USDT', '');

    const orderParams: Record<string, any> = {
      symbol: cleanSymbol,
      qty: amount,
      side,
      type,
      time_in_force: options?.timeInForce ?? 'day',
    };

    if (type === 'limit' && price) {
      orderParams.limit_price = price;
    }

    if (options?.extendedHours) {
      orderParams.extended_hours = true;
    }

    const order = await this.client.createOrder(orderParams);

    return {
      id: order.id,
      symbol: order.symbol,
      side: order.side,
      type: order.type ?? type,
      amount: parseFloat(order.qty ?? amount.toString()),
      price: parseFloat(order.filled_avg_price ?? order.limit_price ?? '0'),
      status: order.status ?? 'new',
      timestamp: new Date(order.created_at).getTime(),
    };
  }

  async getTickers(symbols: string[]): Promise<Map<string, number>> {
    const priceMap = new Map<string, number>();
    if (!this.client || symbols.length === 0) return priceMap;

    // Normalize symbols: strip /USD, /USDT suffixes for stock tickers
    const cleaned = symbols.map(s => s.replace('/USD', '').replace('/USDT', ''));

    const BATCH = 50;
    for (let i = 0; i < cleaned.length; i += BATCH) {
      const batch = cleaned.slice(i, i + BATCH);
      try {
        const snapshots = await this.client.getSnapshots(batch);
        for (const [sym, snap] of Object.entries(snapshots as Record<string, any>)) {
          const price = snap?.latestTrade?.p ?? snap?.minuteBar?.c ?? 0;
          if (price > 0) priceMap.set(sym.toUpperCase(), price);
        }
      } catch {
        // Fall back to serial getSnapshot calls
        for (const sym of batch) {
          try {
            const snap = await this.client.getSnapshot(sym);
            const price = snap?.latestTrade?.p ?? snap?.minuteBar?.c ?? 0;
            if (price > 0) priceMap.set(sym.toUpperCase(), price);
          } catch {}
        }
      }
    }
    return priceMap;
  }

  async isMarketOpen(): Promise<boolean> {
    if (!this.client) return false;
    try {
      const clock = await this.client.getClock();
      return clock.is_open;
    } catch {
      return false;
    }
  }
}
