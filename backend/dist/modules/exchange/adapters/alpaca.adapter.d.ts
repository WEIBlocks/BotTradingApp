import type { ExchangeAdapter, ExchangeCredentials, Balance, Ticker, Market, OrderResult, OrderOptions } from './base.adapter.js';
export declare class AlpacaAdapter implements ExchangeAdapter {
    readonly name = "alpaca";
    readonly assetClass: "stocks";
    private client;
    private apiKey;
    private apiSecret;
    private isPaper;
    connect(credentials: ExchangeCredentials): Promise<void>;
    disconnect(): Promise<void>;
    testConnection(): Promise<boolean>;
    getBalances(): Promise<Balance[]>;
    getTicker(symbol: string): Promise<Ticker>;
    getMarkets(): Promise<Market[]>;
    createOrder(symbol: string, side: 'buy' | 'sell', type: 'market' | 'limit', amount: number, price?: number, options?: OrderOptions): Promise<OrderResult>;
    getTickers(symbols: string[]): Promise<Map<string, number>>;
    isMarketOpen(): Promise<boolean>;
}
