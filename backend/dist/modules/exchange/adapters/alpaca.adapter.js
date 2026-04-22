export class AlpacaAdapter {
    name = 'alpaca';
    assetClass = 'stocks';
    client = null;
    apiKey = '';
    apiSecret = '';
    isPaper = false;
    async connect(credentials) {
        const Alpaca = (await import('@alpacahq/alpaca-trade-api')).default;
        // Paper keys always start with "PK" — auto-detect to avoid 401s on live endpoint
        const isPaperKey = credentials.apiKey?.startsWith('PK');
        this.isPaper = credentials.sandbox === true || isPaperKey;
        this.apiKey = credentials.apiKey ?? '';
        this.apiSecret = credentials.apiSecret ?? '';
        this.client = new Alpaca({
            keyId: this.apiKey,
            secretKey: this.apiSecret,
            paper: this.isPaper,
            usePolygon: false,
        });
    }
    async disconnect() {
        this.client = null;
    }
    async testConnection() {
        if (!this.client || !this.apiKey)
            return false;
        // Paper: use paper trading API — never geo-blocked
        if (this.isPaper) {
            try {
                await this.client.getAccount();
                return true;
            }
            catch {
                // Try data API as fallback
                try {
                    const res = await fetch('https://paper-api.alpaca.markets/v2/account', {
                        headers: { 'APCA-API-KEY-ID': this.apiKey, 'APCA-API-SECRET-KEY': this.apiSecret },
                        signal: AbortSignal.timeout(10000),
                    });
                    return res.status === 200;
                }
                catch {
                    return false;
                }
            }
        }
        // Live: api.alpaca.markets is geo-blocked on cloud servers (DigitalOcean, AWS, etc.)
        // Validate keys using the market data API which is NOT geo-blocked.
        // A 200 means valid keys. A 401/403 means bad keys. Other errors = network/geo issue.
        try {
            const res = await fetch('https://data.alpaca.markets/v2/stocks/AAPL/trades/latest', {
                headers: { 'APCA-API-KEY-ID': this.apiKey, 'APCA-API-SECRET-KEY': this.apiSecret },
                signal: AbortSignal.timeout(10000),
            });
            if (res.status === 200)
                return true;
            if (res.status === 401 || res.status === 403)
                return false; // bad credentials
            // 5xx or other — try account endpoint anyway as last resort
        }
        catch { }
        // Last resort: try trading API (might work for some server IPs)
        try {
            await this.client.getAccount();
            return true;
        }
        catch {
            return false;
        }
    }
    async getBalances() {
        if (!this.client)
            throw new Error('Not connected');
        const result = [];
        // Live trading API is geo-blocked on cloud servers — use REST directly
        if (!this.isPaper) {
            const base = 'https://api.alpaca.markets/v2';
            const headers = { 'APCA-API-KEY-ID': this.apiKey, 'APCA-API-SECRET-KEY': this.apiSecret };
            const [accRes, posRes] = await Promise.all([
                fetch(`${base}/account`, { headers, signal: AbortSignal.timeout(10000) }),
                fetch(`${base}/positions`, { headers, signal: AbortSignal.timeout(10000) }),
            ]);
            if (!accRes.ok)
                throw new Error(`Alpaca account fetch failed: ${accRes.status}`);
            const account = await accRes.json();
            const cash = parseFloat(account.cash ?? '0');
            const buyingPower = parseFloat(account.buying_power ?? '0');
            if (cash > 0)
                result.push({ currency: 'USD', free: buyingPower, total: cash });
            if (posRes.ok) {
                const positions = await posRes.json();
                for (const pos of positions) {
                    const qty = parseFloat(pos.qty ?? '0');
                    const marketValue = parseFloat(pos.market_value ?? '0');
                    if (qty > 0)
                        result.push({ currency: pos.symbol, free: qty, total: marketValue });
                }
            }
            return result;
        }
        // Paper: use SDK client (paper-api.alpaca.markets — not geo-blocked)
        const account = await this.client.getAccount();
        const cash = parseFloat(account.cash ?? '0');
        const buyingPower = parseFloat(account.buying_power ?? '0');
        if (cash > 0) {
            result.push({ currency: 'USD', free: buyingPower, total: cash });
        }
        const positions = await this.client.getPositions();
        for (const pos of positions) {
            const qty = parseFloat(pos.qty ?? '0');
            const marketValue = parseFloat(pos.market_value ?? '0');
            if (qty > 0) {
                result.push({
                    currency: pos.symbol,
                    free: qty,
                    total: marketValue,
                });
            }
        }
        return result;
    }
    async getTicker(symbol) {
        if (!this.client)
            throw new Error('Not connected');
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
        }
        catch {
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
    async getMarkets() {
        if (!this.client)
            throw new Error('Not connected');
        const assets = await this.client.getAssets({
            status: 'active',
            asset_class: 'us_equity',
        });
        return assets
            .filter((a) => a.tradable)
            .slice(0, 500) // limit to avoid huge response
            .map((a) => ({
            symbol: a.symbol,
            base: a.symbol,
            quote: 'USD',
            active: a.tradable ?? true,
        }));
    }
    async createOrder(symbol, side, type, amount, price, options) {
        if (!this.client)
            throw new Error('Not connected');
        const cleanSymbol = symbol.replace('/USD', '').replace('/USDT', '');
        const orderParams = {
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
        let order;
        if (!this.isPaper) {
            // Live: use direct REST (geo-block bypass)
            const res = await fetch('https://api.alpaca.markets/v2/orders', {
                method: 'POST',
                headers: {
                    'APCA-API-KEY-ID': this.apiKey,
                    'APCA-API-SECRET-KEY': this.apiSecret,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(orderParams),
                signal: AbortSignal.timeout(15000),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message ?? `Order failed: ${res.status}`);
            }
            order = await res.json();
        }
        else {
            order = await this.client.createOrder(orderParams);
        }
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
    async getTickers(symbols) {
        const priceMap = new Map();
        if (!this.client || symbols.length === 0)
            return priceMap;
        // Normalize symbols: strip /USD, /USDT suffixes for stock tickers
        const cleaned = symbols.map(s => s.replace('/USD', '').replace('/USDT', ''));
        const BATCH = 50;
        for (let i = 0; i < cleaned.length; i += BATCH) {
            const batch = cleaned.slice(i, i + BATCH);
            try {
                const snapshots = await this.client.getSnapshots(batch);
                for (const [sym, snap] of Object.entries(snapshots)) {
                    const price = snap?.latestTrade?.p ?? snap?.minuteBar?.c ?? 0;
                    if (price > 0)
                        priceMap.set(sym.toUpperCase(), price);
                }
            }
            catch {
                // Fall back to serial getSnapshot calls
                for (const sym of batch) {
                    try {
                        const snap = await this.client.getSnapshot(sym);
                        const price = snap?.latestTrade?.p ?? snap?.minuteBar?.c ?? 0;
                        if (price > 0)
                            priceMap.set(sym.toUpperCase(), price);
                    }
                    catch { }
                }
            }
        }
        return priceMap;
    }
    async isMarketOpen() {
        if (!this.client)
            return false;
        try {
            if (!this.isPaper) {
                const res = await fetch('https://api.alpaca.markets/v2/clock', {
                    headers: { 'APCA-API-KEY-ID': this.apiKey, 'APCA-API-SECRET-KEY': this.apiSecret },
                    signal: AbortSignal.timeout(8000),
                });
                if (res.ok) {
                    const d = await res.json();
                    return d.is_open ?? false;
                }
                return false;
            }
            const clock = await this.client.getClock();
            return clock.is_open;
        }
        catch {
            return false;
        }
    }
}
