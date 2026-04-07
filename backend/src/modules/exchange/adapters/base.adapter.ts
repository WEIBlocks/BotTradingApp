export interface ExchangeCredentials {
  apiKey: string;
  apiSecret: string;
  sandbox?: boolean;
}

export interface Balance {
  currency: string;
  free: number;
  total: number;
}

export interface Ticker {
  symbol: string;
  last: number;
  bid: number;
  ask: number;
  change24h: number;
}

export interface Market {
  symbol: string;
  base: string;
  quote: string;
  active: boolean;
}

export interface OrderOptions {
  timeInForce?: 'day' | 'gtc' | 'ioc';
  extendedHours?: boolean;
}

export interface OrderResult {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: string;
  amount: number;
  price: number;
  status: string;
  timestamp: number;
}

export interface ExchangeAdapter {
  readonly name: string;
  readonly assetClass?: 'crypto' | 'stocks';
  connect(credentials: ExchangeCredentials): Promise<void>;
  disconnect(): Promise<void>;
  testConnection(): Promise<boolean>;
  getBalances(): Promise<Balance[]>;
  getTicker(symbol: string): Promise<Ticker>;
  getTickers?(symbols: string[]): Promise<Map<string, number>>; // currency → USD price
  getMarkets(): Promise<Market[]>;
  createOrder(
    symbol: string,
    side: 'buy' | 'sell',
    type: 'market' | 'limit',
    amount: number,
    price?: number,
    options?: OrderOptions,
  ): Promise<OrderResult>;
  isMarketOpen?(): Promise<boolean>;
}
