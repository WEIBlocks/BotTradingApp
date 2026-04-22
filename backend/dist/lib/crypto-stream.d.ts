/**
 * CryptoStreamService — singleton managing real-time WebSocket connections to
 * Kraken (V2), Coinbase (Advanced Trade), and KuCoin for crypto price ticks.
 *
 * Architecture (mirrors alpaca-stream.ts):
 *   - One persistent WS per exchange, reconnects with exponential backoff
 *   - Ref-counted symbol subscriptions — connects exchange only when needed
 *   - On each price tick: publishes to Redis `crypto:price:{EXCHANGE}:{SYMBOL}`
 *   - /ws/app handler subscribes to Redis and fans out to mobile client
 *
 * Redis message shape:
 *   { symbol, price, exchange, timestamp }
 *
 * Exchange WS APIs used:
 *   Kraken   → wss://ws.kraken.com/v2  (public, no auth)
 *   Coinbase → wss://advanced-trade-ws.coinbase.com  (public, no auth)
 *   KuCoin   → wss://ws-api.kucoin.com  (requires /api/v1/bullet-public token first)
 */
declare class CryptoStreamService {
    private kraken;
    private coinbase;
    private kucoin;
    /**
     * Subscribe pairs for a given exchange.
     * Pairs not supported by the requested exchange fall through to KuCoin.
     */
    addPairs(exchange: string, pairs: string[]): void;
    removePairs(exchange: string, pairs: string[]): void;
}
export declare const cryptoStream: CryptoStreamService;
export {};
