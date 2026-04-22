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
import WebSocket from 'ws';
import { publishMessage } from '../config/redis.js';
// ── Kraken V2 symbol map (pair → Kraken symbol) ───────────────────────────────
const KRAKEN_PAIR_MAP = {
    'BTC/USDT': 'BTC/USD', 'ETH/USDT': 'ETH/USD', 'SOL/USDT': 'SOL/USD',
    'BNB/USDT': 'BNB/USD', 'XRP/USDT': 'XRP/USD', 'ADA/USDT': 'ADA/USD',
    'DOGE/USDT': 'DOGE/USD', 'LTC/USDT': 'LTC/USD', 'LINK/USDT': 'LINK/USD',
    'DOT/USDT': 'DOT/USD', 'AVAX/USDT': 'AVAX/USD', 'ATOM/USDT': 'ATOM/USD',
    'UNI/USDT': 'UNI/USD', 'NEAR/USDT': 'NEAR/USD', 'ARB/USDT': 'ARB/USD',
    'OP/USDT': 'OP/USD', 'INJ/USDT': 'INJ/USD', 'TIA/USDT': 'TIA/USD',
    'SEI/USDT': 'SEI/USD', 'SUI/USDT': 'SUI/USD', 'APT/USDT': 'APT/USD',
    'FET/USDT': 'FET/USD', 'RNDR/USDT': 'RENDER/USD', 'AAVE/USDT': 'AAVE/USD',
    'MKR/USDT': 'MKR/USD', 'PEPE/USDT': 'PEPE/USD',
    'MATIC/USDT': 'POL/USD', 'POL/USDT': 'POL/USD',
};
const KRAKEN_SUPPORTED = new Set(Object.keys(KRAKEN_PAIR_MAP));
// Reverse: Kraken symbol → our pair format (for routing publish back)
const KRAKEN_REVERSE = {};
for (const [pair, ksym] of Object.entries(KRAKEN_PAIR_MAP)) {
    if (!KRAKEN_REVERSE[ksym])
        KRAKEN_REVERSE[ksym] = pair;
}
// ── Coinbase symbol map (pair → Coinbase product_id) ─────────────────────────
function toCoinbaseProduct(pair) {
    return pair.replace('/USDT', '-USD').replace('/USD', '-USD').replace('/', '-')
        .replace('POL-USD', 'MATIC-USD');
}
// Reverse: Coinbase product_id → our pair format
function fromCoinbaseProduct(productId) {
    return productId.replace('MATIC-USD', 'MATIC/USDT').replace('-USD', '/USDT').replace('-', '/');
}
// ── KuCoin symbol map (pair → KuCoin topic symbol) ───────────────────────────
function toKuCoinSymbol(pair) {
    const base = pair.split('/')[0] ?? pair;
    const kcBase = base === 'POL' ? 'MATIC' : base;
    return `${kcBase}-USDT`;
}
function fromKuCoinSymbol(sym) {
    const base = sym.replace('-USDT', '');
    return `${base}/USDT`;
}
// ── Generic stream base ───────────────────────────────────────────────────────
class ExchangeStream {
    ws = null;
    reconnectTimer = null;
    reconnectDelay = 2000;
    shouldRun = false;
    symbolRefs = new Map(); // pair → subscriber count
    addSymbols(pairs) {
        const toAdd = [];
        for (const p of pairs) {
            const prev = this.symbolRefs.get(p) ?? 0;
            this.symbolRefs.set(p, prev + 1);
            if (prev === 0)
                toAdd.push(p);
        }
        if (toAdd.length > 0) {
            if (!this.shouldRun) {
                this.shouldRun = true;
                this.connect();
            }
            else
                this.subscribe(toAdd);
        }
    }
    removeSymbols(pairs) {
        const toRemove = [];
        for (const p of pairs) {
            const prev = this.symbolRefs.get(p) ?? 0;
            if (prev <= 1) {
                this.symbolRefs.delete(p);
                toRemove.push(p);
            }
            else
                this.symbolRefs.set(p, prev - 1);
        }
        if (toRemove.length > 0)
            this.unsubscribe(toRemove);
        if (this.symbolRefs.size === 0)
            this.stop();
    }
    stop() {
        this.shouldRun = false;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.ws?.close();
        this.ws = null;
    }
    scheduleReconnect() {
        if (this.reconnectTimer || !this.shouldRun)
            return;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);
            if (this.shouldRun)
                this.connect();
        }, this.reconnectDelay);
    }
}
// ── Kraken V2 WebSocket Stream ────────────────────────────────────────────────
class KrakenStream extends ExchangeStream {
    // Only subscribe pairs that Kraken supports — others go to KuCoin
    supported(pair) { return KRAKEN_SUPPORTED.has(pair); }
    addSymbols(pairs) {
        super.addSymbols(pairs.filter(p => this.supported(p)));
    }
    removeSymbols(pairs) {
        super.removeSymbols(pairs.filter(p => this.supported(p)));
    }
    connect() {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING))
            return;
        const ws = new WebSocket('wss://ws.kraken.com/v2');
        this.ws = ws;
        ws.on('open', () => {
            this.reconnectDelay = 2000;
            const syms = Array.from(this.symbolRefs.keys());
            if (syms.length > 0)
                this.subscribe(syms);
        });
        ws.on('message', (raw) => {
            try {
                const msg = JSON.parse(raw.toString());
                // V2 ticker: { channel:'ticker', type:'snapshot'|'update', data:[{symbol, last,...}] }
                if (msg.channel === 'ticker' && (msg.type === 'update' || msg.type === 'snapshot') && Array.isArray(msg.data)) {
                    for (const d of msg.data) {
                        const krakenSym = d.symbol;
                        const price = d.last;
                        if (!krakenSym || !price)
                            continue;
                        const pair = KRAKEN_REVERSE[krakenSym] ?? krakenSym.replace('/USD', '/USDT');
                        publishMessage(`crypto:price:kraken:${pair}`, {
                            symbol: pair, price, exchange: 'kraken', timestamp: Date.now(),
                        }).catch(() => { });
                    }
                }
            }
            catch { }
        });
        ws.on('close', () => {
            this.ws = null;
            if (this.shouldRun && this.symbolRefs.size > 0)
                this.scheduleReconnect();
        });
        ws.on('error', () => ws.close());
    }
    subscribe(pairs) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN)
            return;
        const krakenSyms = pairs.filter(p => KRAKEN_SUPPORTED.has(p)).map(p => KRAKEN_PAIR_MAP[p]);
        if (krakenSyms.length === 0)
            return;
        this.ws.send(JSON.stringify({
            method: 'subscribe',
            params: { channel: 'ticker', symbol: krakenSyms, snapshot: false },
        }));
    }
    unsubscribe(pairs) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN)
            return;
        const krakenSyms = pairs.filter(p => KRAKEN_SUPPORTED.has(p)).map(p => KRAKEN_PAIR_MAP[p]);
        if (krakenSyms.length === 0)
            return;
        this.ws.send(JSON.stringify({
            method: 'unsubscribe',
            params: { channel: 'ticker', symbol: krakenSyms },
        }));
    }
}
// ── Coinbase Advanced Trade WebSocket Stream ──────────────────────────────────
class CoinbaseStream extends ExchangeStream {
    connect() {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING))
            return;
        const ws = new WebSocket('wss://advanced-trade-ws.coinbase.com');
        this.ws = ws;
        ws.on('open', () => {
            this.reconnectDelay = 2000;
            const pairs = Array.from(this.symbolRefs.keys());
            if (pairs.length > 0)
                this.subscribe(pairs);
        });
        ws.on('message', (raw) => {
            try {
                const msg = JSON.parse(raw.toString());
                // Coinbase ticker_batch: { channel:'ticker_batch', events:[{type:'update',tickers:[{product_id,price}]}] }
                if (msg.channel === 'ticker_batch' && Array.isArray(msg.events)) {
                    for (const evt of msg.events) {
                        if (evt.type !== 'update')
                            continue;
                        for (const t of (evt.tickers ?? [])) {
                            const price = parseFloat(t.price);
                            if (!price || price <= 0)
                                continue;
                            const pair = fromCoinbaseProduct(t.product_id);
                            publishMessage(`crypto:price:coinbase:${pair}`, {
                                symbol: pair, price, exchange: 'coinbase', timestamp: Date.now(),
                            }).catch(() => { });
                        }
                    }
                }
            }
            catch { }
        });
        ws.on('close', () => {
            this.ws = null;
            if (this.shouldRun && this.symbolRefs.size > 0)
                this.scheduleReconnect();
        });
        ws.on('error', () => ws.close());
    }
    subscribe(pairs) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN)
            return;
        const productIds = pairs.map(toCoinbaseProduct);
        this.ws.send(JSON.stringify({
            type: 'subscribe',
            channel: 'ticker_batch',
            product_ids: productIds,
        }));
    }
    unsubscribe(pairs) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN)
            return;
        const productIds = pairs.map(toCoinbaseProduct);
        this.ws.send(JSON.stringify({
            type: 'unsubscribe',
            channel: 'ticker_batch',
            product_ids: productIds,
        }));
    }
}
// ── KuCoin WebSocket Stream ───────────────────────────────────────────────────
// KuCoin requires fetching a token + endpoint before connecting
class KuCoinStream extends ExchangeStream {
    endpoint = 'wss://ws-api.kucoin.com/endpoint';
    token = '';
    pingTimer = null;
    async connect() {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING))
            return;
        try {
            // Get a fresh token from KuCoin public bullet endpoint (no auth needed)
            const res = await fetch('https://api.kucoin.com/api/v1/bullet-public', { method: 'POST' });
            if (res.ok) {
                const json = await res.json();
                this.token = json?.data?.token ?? '';
                const server = json?.data?.instanceServers?.[0];
                if (server?.endpoint)
                    this.endpoint = server.endpoint;
            }
        }
        catch { }
        const url = `${this.endpoint}?token=${encodeURIComponent(this.token)}&connectId=${Date.now()}`;
        const ws = new WebSocket(url);
        this.ws = ws;
        ws.on('open', () => {
            this.reconnectDelay = 2000;
            // KuCoin requires client-side pings every ~18s
            if (this.pingTimer)
                clearInterval(this.pingTimer);
            this.pingTimer = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ id: Date.now().toString(), type: 'ping' }));
                }
            }, 18_000);
            const pairs = Array.from(this.symbolRefs.keys());
            if (pairs.length > 0)
                this.subscribe(pairs);
        });
        ws.on('message', (raw) => {
            try {
                const msg = JSON.parse(raw.toString());
                // KuCoin ticker: { type:'message', topic:'/market/ticker:BTC-USDT', data:{price,...} }
                if (msg.type === 'message' && msg.topic?.startsWith('/market/ticker:') && msg.data) {
                    const kcSym = msg.topic.replace('/market/ticker:', '');
                    const price = parseFloat(msg.data.price ?? '0');
                    if (!price || price <= 0)
                        return;
                    const pair = fromKuCoinSymbol(kcSym);
                    publishMessage(`crypto:price:kucoin:${pair}`, {
                        symbol: pair, price, exchange: 'kucoin', timestamp: Date.now(),
                    }).catch(() => { });
                }
            }
            catch { }
        });
        ws.on('close', () => {
            this.ws = null;
            if (this.pingTimer) {
                clearInterval(this.pingTimer);
                this.pingTimer = null;
            }
            if (this.shouldRun && this.symbolRefs.size > 0)
                this.scheduleReconnect();
        });
        ws.on('error', () => ws.close());
    }
    subscribe(pairs) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN)
            return;
        const syms = pairs.map(toKuCoinSymbol).join(',');
        this.ws.send(JSON.stringify({
            id: Date.now().toString(),
            type: 'subscribe',
            topic: `/market/ticker:${syms}`,
            privateChannel: false,
            response: true,
        }));
    }
    unsubscribe(pairs) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN)
            return;
        const syms = pairs.map(toKuCoinSymbol).join(',');
        this.ws.send(JSON.stringify({
            id: Date.now().toString(),
            type: 'unsubscribe',
            topic: `/market/ticker:${syms}`,
            privateChannel: false,
            response: true,
        }));
    }
    stop() {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
        super.stop();
    }
}
// ── Unified CryptoStreamService ───────────────────────────────────────────────
class CryptoStreamService {
    kraken = new KrakenStream();
    coinbase = new CoinbaseStream();
    kucoin = new KuCoinStream();
    /**
     * Subscribe pairs for a given exchange.
     * Pairs not supported by the requested exchange fall through to KuCoin.
     */
    addPairs(exchange, pairs) {
        if (exchange === 'kraken') {
            const supported = pairs.filter(p => KRAKEN_SUPPORTED.has(p));
            const unsupported = pairs.filter(p => !KRAKEN_SUPPORTED.has(p));
            if (supported.length > 0)
                this.kraken.addSymbols(supported);
            if (unsupported.length > 0)
                this.kucoin.addSymbols(unsupported);
        }
        else if (exchange === 'coinbase') {
            this.coinbase.addSymbols(pairs);
        }
        else if (exchange === 'kucoin') {
            this.kucoin.addSymbols(pairs);
        }
    }
    removePairs(exchange, pairs) {
        if (exchange === 'kraken') {
            const supported = pairs.filter(p => KRAKEN_SUPPORTED.has(p));
            const unsupported = pairs.filter(p => !KRAKEN_SUPPORTED.has(p));
            if (supported.length > 0)
                this.kraken.removeSymbols(supported);
            if (unsupported.length > 0)
                this.kucoin.removeSymbols(unsupported);
        }
        else if (exchange === 'coinbase') {
            this.coinbase.removeSymbols(pairs);
        }
        else if (exchange === 'kucoin') {
            this.kucoin.removeSymbols(pairs);
        }
    }
}
export const cryptoStream = new CryptoStreamService();
