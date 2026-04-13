export class KrakenAdapter {
    name = 'kraken';
    exchange = null;
    async connect(credentials) {
        const ccxt = await import('ccxt');
        this.exchange = new ccxt.default.kraken({
            apiKey: credentials.apiKey,
            secret: credentials.apiSecret,
            enableRateLimit: true,
        });
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
    async getMarkets() {
        if (!this.exchange)
            throw new Error('Not connected');
        await this.exchange.loadMarkets();
        const markets = [];
        for (const market of Object.values(this.exchange.markets)) {
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
