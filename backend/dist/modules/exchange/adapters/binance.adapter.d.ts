import type { ExchangeAdapter, ExchangeCredentials, Balance, Ticker, Market, OrderResult } from './base.adapter.js';
export declare class BinanceAdapter implements ExchangeAdapter {
    readonly name = "binance";
    private exchange;
    connect(credentials: ExchangeCredentials): Promise<void>;
    disconnect(): Promise<void>;
    testConnection(): Promise<boolean>;
    getBalances(): Promise<Balance[]>;
    getTicker(symbol: string): Promise<Ticker>;
    getTickers(symbols: string[]): Promise<Map<string, number>>;
    getMarkets(): Promise<Market[]>;
    createOrder(symbol: string, side: 'buy' | 'sell', type: 'market' | 'limit', amount: number, price?: number, _options?: import('./base.adapter.js').OrderOptions): Promise<OrderResult>;
}
