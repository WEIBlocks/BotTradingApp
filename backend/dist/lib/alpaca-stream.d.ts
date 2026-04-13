/**
 * AlpacaStreamService — singleton that manages ONE Alpaca market-data WebSocket.
 *
 * Alpaca's free IEX data stream: wss://stream.data.alpaca.markets/v2/iex
 * (Paper key works — no live account needed for market data)
 *
 * Responsibilities:
 *  - Connect once, reconnect on drop with backoff
 *  - Dynamically subscribe/unsubscribe symbols as users connect/disconnect
 *  - On each trade/quote tick: publish to Redis `stock:price:{SYMBOL}` channel
 *    so /ws/app can fan-out to all connected mobile clients watching that symbol
 *
 * Redis message shape:
 *   { symbol, price, change, changePercent, timestamp }
 */
declare class AlpacaStreamService {
    private ws;
    private authenticated;
    private reconnectTimer;
    private reconnectDelay;
    private shouldRun;
    private symbolRefs;
    private prevPrices;
    /** Call when a user connects and is watching these stock symbols */
    addSymbols(symbols: string[]): void;
    /** Call when a user disconnects */
    removeSymbols(symbols: string[]): void;
    private start;
    private stop;
    private connect;
    private handleMessage;
    private subscribeSymbols;
    private unsubscribeSymbols;
    private scheduleReconnect;
    /** Seed prevPrices from REST snapshot so first tick has a real change% */
    seedPrevPrices(symbols: string[]): Promise<void>;
}
export declare const alpacaStream: AlpacaStreamService;
export {};
