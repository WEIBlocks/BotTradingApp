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
    async getTickers(symbols) {
        const priceMap = new Map();
        if (!this.exchange || symbols.length === 0)
            return priceMap;
        const BATCH = 50;
        for (let i = 0; i < symbols.length; i += BATCH) {
            const batch = symbols.slice(i, i + BATCH);
            try {
                const tickers = await this.exchange.fetchTickers(batch);
                for (const [sym, ticker] of Object.entries(tickers)) {
                    const t = ticker;
                    const currency = sym.replace('/USDT', '').replace('/USD', '');
                    if (t?.last)
                        priceMap.set(currency.toUpperCase(), t.last);
                }
            }
            catch {
                // Fall back to serial fetching for this batch
                for (const sym of batch) {
                    try {
                        const t = await this.exchange.fetchTicker(sym);
                        const currency = sym.replace('/USDT', '').replace('/USD', '');
                        if (t?.last)
                            priceMap.set(currency.toUpperCase(), t.last);
                    }
                    catch { }
                }
            }
        }
        return priceMap;
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
        const roundedAmount = this.exchange.markets?.[symbol]
            ? parseFloat(this.exchange.amountToPrecision(symbol, amount))
            : parseFloat(amount.toFixed(8));
        const order = type === 'limit'
            ? await this.exchange.createOrder(symbol, type, side, roundedAmount, price)
            : await this.exchange.createOrder(symbol, type, side, roundedAmount);
        return {
            id: order.id,
            symbol: order.symbol,
            side: order.side,
            type: order.type,
            amount: order.amount ?? roundedAmount,
            price: order.price ?? order.average ?? 0,
            status: order.status ?? 'open',
            timestamp: order.timestamp ?? Date.now(),
        };
    }
}
