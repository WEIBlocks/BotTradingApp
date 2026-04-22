import ccxt from 'ccxt';
import { redisConnection } from '../../config/queue.js';
import { env } from '../../config/env.js';

// ─── Constants ────────────────────────────────────────────────────────────────

// All intervals the frontend can request (matches BINANCE_INTERVALS keys)
const VALID_CRYPTO_TIMEFRAMES = [
  '1m','3m','5m','15m','30m',
  '1h','2h','4h','6h','12h',
  '1d','3d','1w','1M',
];

function normalizeTf(tf: string): string {
  return tf; // no aliases anymore — all TFs are real exchange intervals
}

const KUCOIN_TF_MAP: Record<string, string> = {
  '1m':'1min','3m':'3min','5m':'5min','15m':'15min','30m':'30min',
  '1h':'1hour','2h':'2hour','4h':'4hour','6h':'6hour','8h':'8hour','12h':'12hour',
  '1d':'1day','3d':'3day','1w':'1week','1M':'1week',
};

const KRAKEN_TF_MAP: Record<string, number> = {
  '1m':1,'3m':3,'5m':5,'15m':15,'30m':30,
  '1h':60,'2h':120,'4h':240,'6h':360,'12h':720,
  '1d':1440,'3d':4320,'1w':10080,'1M':10080,
};

// Kraken REST OHLC pair names.
// MATIC → POLUSD (Polygon rebranded to POL on Kraken, Sep 2024)
const KRAKEN_SYMBOL_MAP: Record<string, string> = {
  'BTC/USDT':'XBTUSD','ETH/USDT':'ETHUSD','SOL/USDT':'SOLUSD',
  'BNB/USDT':'BNBUSD','XRP/USDT':'XRPUSD','ADA/USDT':'ADAUSD',
  'DOGE/USDT':'XDGUSD','LTC/USDT':'LTCUSD','LINK/USDT':'LINKUSD',
  'DOT/USDT':'DOTUSD','AVAX/USDT':'AVAXUSD',
  'MATIC/USDT':'POLUSD','POL/USDT':'POLUSD', // MATIC renamed to POL
  'ATOM/USDT':'ATOMUSD','UNI/USDT':'UNIUSD',
  'NEAR/USDT':'NEARUSD','FIL/USDT':'FILUSD','AAVE/USDT':'AAVEUSD',
  'MKR/USDT':'MKRUSD','SNX/USDT':'SNXUSD','CRV/USDT':'CRVUSD',
  'COMP/USDT':'COMPUSD','YFI/USDT':'YFIUSD','SUSHI/USDT':'SUSHIUSD',
  'INJ/USDT':'INJUSD','OP/USDT':'OPUSD','ARB/USDT':'ARBUSD',
  'TIA/USDT':'TIAUSD','SEI/USDT':'SEIUSD','SUI/USDT':'SUIUSD',
  'APT/USDT':'APTUSD','RNDR/USDT':'RENDERUSD','RENDER/USDT':'RENDERUSD',
  'FET/USDT':'FETUSD','IMX/USDT':'IMXUSD','PEPE/USDT':'PEPEUSD',
};

// CoinGecko ID map — exotic/LST tokens not listed on Kraken/Binance/Coinbase
const COINGECKO_ID_MAP: Record<string, string> = {
  'BSOL':'blazestake-staked-sol','MSOL':'msol','JITOSOL':'jito-staked-sol',
  'STSOL':'lido-staked-sol','WSOL':'wrapped-solana','RAY':'raydium',
  'SRM':'serum','BONK':'bonk','WIF':'dogwifcoin','JUP':'jupiter',
  'PYTH':'pyth-network','TIA':'celestia','SEI':'sei-network',
  'SUI':'sui','APT':'aptos','INJ':'injective-protocol',
  'RNDR':'render-token','RENDER':'render-token','FET':'fetch-ai',
  'IMX':'immutable-x','NEAR':'near','FIL':'filecoin',
  'AAVE':'aave','MKR':'maker','SNX':'havven','CRV':'curve-dao-token',
  'COMP':'compound-governance-token','YFI':'yearn-finance','SUSHI':'sushi',
  '1INCH':'1inch','SAND':'the-sandbox','MANA':'decentraland',
  'AXS':'axie-infinity','GALA':'gala','CHZ':'chiliz','ENJ':'enjincoin',
  'BAT':'basic-attention-token','ZRX':'0x','KNC':'kyber-network-crystal',
  'LRC':'loopring','OP':'optimism','ARB':'arbitrum','WLD':'worldcoin-wld',
  'BLUR':'blur','PEPE':'pepe','FLOKI':'floki','ORDI':'ordinals',
  'MATIC':'matic-network','POL':'matic-network',
  'GRT':'the-graph','OCEAN':'ocean-protocol','STORJ':'storj',
};

function getCoinGeckoId(symbol: string): string | null {
  const base = symbol.split('/')[0]?.toUpperCase() ?? '';
  return COINGECKO_ID_MAP[base] ?? null;
}

// KuCoin symbol — most exotic tokens listed as BASE-USDT
// For MATIC, KuCoin still uses MATIC-USDT (not POL)
function toKucoinSymbol(symbol: string): string {
  // Handle MATIC alias
  const s = symbol.replace('POL/', 'MATIC/');
  return s.replace('/', '-');
}

// ─── Candle fetchers ──────────────────────────────────────────────────────────

async function fetchKucoinCandles(symbol: string, tf: string, limit: number): Promise<any[]> {
  const interval = KUCOIN_TF_MAP[tf];
  if (!interval) throw new Error(`Invalid KuCoin timeframe: ${tf}`);
  const kcSymbol = toKucoinSymbol(symbol);
  const endAt = Math.floor(Date.now() / 1000);
  const url = `https://api.kucoin.com/api/v1/market/candles?type=${interval}&symbol=${kcSymbol}&endAt=${endAt}`;
  const res = await fetch(url, {signal: AbortSignal.timeout(10000)});
  if (!res.ok) throw new Error(`KuCoin HTTP ${res.status}`);
  const json: any = await res.json();
  if (json.code !== '200000' || !Array.isArray(json.data) || json.data.length === 0) {
    throw new Error(`KuCoin no data: ${json.msg ?? json.code}`);
  }
  return json.data
    .slice(0, limit)
    .reverse()
    .map((c: string[]) => ({
      timestamp: Number(c[0]) * 1000,
      open:   parseFloat(c[1]),
      close:  parseFloat(c[2]),
      high:   parseFloat(c[3]),
      low:    parseFloat(c[4]),
      volume: parseFloat(c[5]),
    }));
}

async function fetchKrakenCandles(symbol: string, tf: string, limit: number): Promise<any[]> {
  const interval = KRAKEN_TF_MAP[tf];
  if (!interval) throw new Error(`Invalid Kraken timeframe: ${tf}`);
  const krakenPair = KRAKEN_SYMBOL_MAP[symbol] ?? symbol.replace('/USDT','USD').replace('/USD','USD').replace('/','');
  const since = Math.floor((Date.now() - limit * interval * 60 * 1000) / 1000);
  const url = `https://api.kraken.com/0/public/OHLC?pair=${krakenPair}&interval=${interval}&since=${since}`;
  const res = await fetch(url, {signal: AbortSignal.timeout(10000)});
  if (!res.ok) throw new Error(`Kraken HTTP ${res.status}`);
  const json: any = await res.json();
  if (json.error?.length) throw new Error(`Kraken error: ${json.error[0]}`);
  const pairKey = Object.keys(json.result ?? {}).find(k => k !== 'last');
  if (!pairKey) throw new Error('Kraken: no pair data');
  return json.result[pairKey]
    .slice(-limit)
    .map((c: any[]) => ({
      timestamp: Number(c[0]) * 1000,
      open:   parseFloat(c[1]),
      high:   parseFloat(c[2]),
      low:    parseFloat(c[3]),
      close:  parseFloat(c[4]),
      volume: parseFloat(c[6]),
    }));
}

async function fetchBinanceCandles(symbol: string, tf: string, limit: number): Promise<any[]> {
  const binSym = symbol.replace('/', '').toUpperCase();
  const url = `https://api.binance.com/api/v3/klines?symbol=${binSym}&interval=${tf}&limit=${limit}`;
  const res = await fetch(url, {signal: AbortSignal.timeout(8000)});
  if (!res.ok) throw new Error(`Binance HTTP ${res.status}`);
  const json: any[] = await res.json();
  return json.map((c: any[]) => ({
    timestamp: Number(c[0]),
    open:   parseFloat(c[1]), high: parseFloat(c[2]),
    low:    parseFloat(c[3]), close: parseFloat(c[4]),
    volume: parseFloat(c[5]),
  }));
}

async function fetchCoinbaseCandles(symbol: string, tf: string, limit: number): Promise<any[]> {
  // Coinbase product IDs: BTC/USDT → BTC-USD, MATIC/USDT → MATIC-USD (Coinbase hasn't rebranded)
  const productId = symbol
    .replace('/USDT','-USD').replace('/USD','-USD').replace('/','-')
    .replace('POL-USD','MATIC-USD'); // Coinbase still uses MATIC
  const granMap: Record<string,string> = {
    '1m':'ONE_MINUTE','5m':'FIVE_MINUTE','15m':'FIFTEEN_MINUTE',
    '1h':'ONE_HOUR','4h':'SIX_HOUR','1d':'ONE_DAY',
  };
  const granularity = granMap[tf] ?? 'ONE_HOUR';
  const granSecs: Record<string,number> = {
    'ONE_MINUTE':60,'FIVE_MINUTE':300,'FIFTEEN_MINUTE':900,
    'ONE_HOUR':3600,'SIX_HOUR':21600,'ONE_DAY':86400,
  };
  const end   = Math.floor(Date.now() / 1000);
  const start = end - limit * (granSecs[granularity] ?? 3600);
  const url = `https://api.coinbase.com/api/v3/brokerage/market/products/${productId}/candles?start=${start}&end=${end}&granularity=${granularity}&limit=${limit}`;
  const res = await fetch(url, {signal: AbortSignal.timeout(8000)});
  if (!res.ok) throw new Error(`Coinbase HTTP ${res.status}`);
  const json: any = await res.json();
  if (!Array.isArray(json.candles) || json.candles.length === 0) throw new Error('Coinbase: no candles');
  return json.candles.slice(0, limit).reverse().map((c: any) => ({
    timestamp: Number(c.start) * 1000,
    open:   parseFloat(c.open), high: parseFloat(c.high),
    low:    parseFloat(c.low),  close: parseFloat(c.close),
    volume: parseFloat(c.volume),
  }));
}

// CoinGecko OHLC — rate-limited via Redis (max 1 req/geckoId per 90s across all server instances)
async function fetchCoinGeckoCandles(symbol: string, _tf: string, limit: number): Promise<{candles: any[]; source: string}> {
  const geckoId = getCoinGeckoId(symbol);
  if (!geckoId) throw new Error(`No CoinGecko ID for ${symbol}`);

  // Server-side rate limit guard: at most 1 OHLC request per geckoId per 90s
  const rateLimitKey = `cg:ohlc:rl:${geckoId}`;
  const alreadyFetched = await redisConnection.get(rateLimitKey).catch(() => null);
  if (alreadyFetched) {
    const cached = await redisConnection.get(`cg:ohlc:${geckoId}`).catch(() => null);
    if (cached) return JSON.parse(cached);
    // Rate-limited, no cache — wait rather than throw so caller can retry later
    return {candles: [], source: 'CoinGecko'};
  }

  const days = limit > 90 ? 180 : limit > 30 ? 90 : limit > 14 ? 30 : 14;
  const url = `https://api.coingecko.com/api/v3/coins/${geckoId}/ohlc?vs_currency=usd&days=${days}`;
  const res = await fetch(url, {signal: AbortSignal.timeout(10000)});
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
  const json: any[] = await res.json();
  if (!Array.isArray(json) || json.length === 0) throw new Error('CoinGecko: empty response');

  const candles = json.slice(-limit).map((c: any[]) => ({
    timestamp: Number(c[0]),
    open: Number(c[1]), high: Number(c[2]), low: Number(c[3]), close: Number(c[4]),
    volume: 0,
  }));
  const result = {candles, source: 'CoinGecko'};

  // Cache for 5 minutes + set rate limit key for 90s
  await Promise.all([
    redisConnection.set(`cg:ohlc:${geckoId}`, JSON.stringify(result), 'EX', 300).catch(() => {}),
    redisConnection.set(rateLimitKey, '1', 'EX', 90).catch(() => {}),
  ]);
  return result;
}

// ─── Main crypto candle fetcher with full fallback chain ──────────────────────

async function fetchCryptoCandles(symbol: string, tf: string, limit: number, exchange?: string): Promise<{candles: any[]; source: string}> {
  const attempts: Array<() => Promise<{candles: any[]; source: string}>> = [];

  // Exchange-first ordering
  if (exchange === 'binance') {
    attempts.push(async () => { const c = await fetchBinanceCandles(symbol, tf, limit); return {candles: c, source: 'Binance'}; });
  }
  if (exchange === 'coinbase') {
    attempts.push(async () => { const c = await fetchCoinbaseCandles(symbol, tf, limit); return {candles: c, source: 'Coinbase'}; });
  }
  if (exchange === 'kraken' || !exchange) {
    attempts.push(async () => { const c = await fetchKrakenCandles(symbol, tf, limit); return {candles: c, source: 'Kraken'}; });
  }

  // Universal fallbacks (always tried if primary fails)
  attempts.push(async () => { const c = await fetchKucoinCandles(symbol, tf, limit); return {candles: c, source: 'KuCoin'}; });

  if (exchange !== 'kraken') {
    attempts.push(async () => { const c = await fetchKrakenCandles(symbol, tf, limit); return {candles: c, source: 'Kraken'}; });
  }
  if (exchange !== 'binance') {
    attempts.push(async () => { const c = await fetchBinanceCandles(symbol, tf, limit); return {candles: c, source: 'Binance'}; });
  }
  if (exchange !== 'coinbase') {
    attempts.push(async () => { const c = await fetchCoinbaseCandles(symbol, tf, limit); return {candles: c, source: 'Coinbase'}; });
  }

  // Last resort: CoinGecko (rate-limited, exotic tokens only)
  attempts.push(() => fetchCoinGeckoCandles(symbol, tf, limit));

  for (const attempt of attempts) {
    try {
      const result = await attempt();
      if (result.candles.length > 0) return result;
    } catch (e: any) {
      console.warn(`[Market] candle fallback failed for ${symbol}: ${e.message}`);
    }
  }

  return {candles: [], source: 'none'};
}

// ─── Stock candles (Alpaca primary, Twelve Data fallback) ─────────────────────

const ALPACA_TF_MAP: Record<string, string> = {
  '1m':'1Min','3m':'3Min','5m':'5Min','15m':'15Min','30m':'30Min',
  '1h':'1Hour','2h':'2Hour','4h':'4Hour','6h':'6Hour','12h':'12Hour',
  '1d':'1Day','1w':'1Week',
  // Monthly not available from Alpaca — fall back to daily
  '1M':'1Day',
};

async function fetchStockBars(symbol: string, timeframe: string, limit: number): Promise<any[]> {
  const apiKey    = env.ALPACA_API_KEY;
  const apiSecret = env.ALPACA_API_SECRET;

  if (apiKey && apiSecret && apiKey !== 'PLACEHOLDER') {
    try {
      // Calculate the correct lookback window per timeframe so we get `limit` bars.
      // For intraday: ~390 trading minutes/day, 5 trading days/week.
      // We add a 50% buffer and cap calendar days per timeframe to avoid hitting Alpaca limits.
      const minutesPerBar: Record<string, number> = {
        '1Min': 1, '3Min': 3, '5Min': 5, '15Min': 15, '30Min': 30,
        '1Hour': 60, '2Hour': 120, '4Hour': 240, '6Hour': 360, '12Hour': 720,
        '1Day': 390, '1Week': 390 * 5, // treat 1 bar = 1 trading day / 5-day week
      };
      const minsPerBar = minutesPerBar[timeframe] ?? 390;
      const tradingMinsNeeded = limit * minsPerBar * 1.5; // 50% buffer for non-trading hours
      const tradingDaysNeeded = tradingMinsNeeded / 390;
      const calendarDays = Math.ceil(tradingDaysNeeded * 7 / 5) + 5;
      const start = new Date(Date.now() - calendarDays * 86400000).toISOString().split('T')[0];
      const url = `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/bars?timeframe=${timeframe}&limit=${limit}&feed=sip&sort=asc&start=${start}`;
      const response = await fetch(url, {
        headers: {'APCA-API-KEY-ID': apiKey, 'APCA-API-SECRET-KEY': apiSecret},
      });
      if (response.ok) {
        const data = await response.json();
        if (data.bars?.length > 0) {
          let bars = data.bars;
          // If last bar is stale (>5 calendar days old — covers weekends + holidays),
          // fetch a small top-up to get any recent bars we missed.
          const lastBarDate = new Date(bars[bars.length - 1].t);
          if ((Date.now() - lastBarDate.getTime()) / 86400000 > 5 && bars.length >= limit) {
            const recentStart = new Date(lastBarDate.getTime() + 86400000).toISOString().split('T')[0];
            const recentRes = await fetch(
              `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/bars?timeframe=${timeframe}&limit=30&feed=sip&sort=asc&start=${recentStart}`,
              {headers: {'APCA-API-KEY-ID': apiKey, 'APCA-API-SECRET-KEY': apiSecret}},
            );
            if (recentRes.ok) {
              const rd = await recentRes.json();
              if (rd.bars?.length > 0) {
                bars = [...bars, ...rd.bars];
                if (bars.length > limit) bars = bars.slice(-limit);
              }
            }
          }
          return bars.map((b: any) => ({
            timestamp: new Date(b.t).getTime(), open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v,
          }));
        }
      } else {
        console.warn(`[Market] Alpaca ${symbol} failed: ${response.status}`);
      }
    } catch (err: any) {
      console.warn(`[Market] Alpaca ${symbol} error: ${err.message}`);
    }
  }

  // Twelve Data fallback
  try {
    const tdInterval = timeframe === '1Day' ? '1day' : timeframe === '1Hour' ? '1h' : timeframe === '4Hour' ? '4h' : timeframe === '1Week' ? '1week' : '1day';
    const tdKey = env.TWELVE_DATA_API_KEY || 'demo';
    const response = await fetch(`https://api.twelvedata.com/time_series?symbol=${symbol}&interval=${tdInterval}&outputsize=${limit}&format=JSON&apikey=${tdKey}`);
    if (response.ok) {
      const data = await response.json();
      if (data.values?.length > 0) {
        return data.values.reverse().map((v: any) => ({
          timestamp: new Date(v.datetime).getTime(),
          open: parseFloat(v.open), high: parseFloat(v.high),
          low: parseFloat(v.low),  close: parseFloat(v.close),
          volume: parseInt(v.volume || '0'),
        }));
      }
    }
  } catch {}

  // ccxt alpaca fallback
  try {
    const alpacaExchange = new ccxt.alpaca({enableRateLimit: true});
    const ohlcv = await alpacaExchange.fetchOHLCV(`${symbol}/USD`, timeframe === '1Day' ? '1d' : '1h', undefined, limit);
    return ohlcv.map(c => ({
      timestamp: Number(c[0]), open: Number(c[1]), high: Number(c[2]),
      low: Number(c[3]), close: Number(c[4]), volume: Number(c[5]),
    }));
  } catch {}

  return [];
}

// ─── Public getCandles ────────────────────────────────────────────────────────

export async function getCandles(symbol: string, timeframe: string = '4h', limit: number = 100, exchange?: string) {
  // Preserve case for monthly TFs (1M must stay uppercase); lowercase only intraday/daily/weekly
  const rawTf = normalizeTf(timeframe);
  const tf    = ['1M'].includes(rawTf) ? rawTf : rawTf.toLowerCase();
  // Stock if no slash, or ends with /USD but NOT /USDT (e.g. QQQ/USD, AAPL/USD)
  const isStock = !symbol.includes('/') || (symbol.endsWith('/USD') && !symbol.endsWith('/USDT'));
  const exKey  = exchange ?? 'default';
  const cacheKey = `ohlcv3:${symbol.replace('/','+')}:${tf}:${limit}:${exKey}`;

  const cached = await redisConnection.get(cacheKey).catch(() => null);
  if (cached) return JSON.parse(cached);

  let candles: any[];
  let source = 'unknown';

  if (isStock) {
    const alpacaTF = ALPACA_TF_MAP[tf] ?? ALPACA_TF_MAP['1d'];
    if (!alpacaTF) throw new Error(`Invalid timeframe for stocks: ${tf}`);
    candles = await fetchStockBars(symbol.replace('/USD',''), alpacaTF, limit);
    source  = 'Alpaca';
  } else {
    if (!VALID_CRYPTO_TIMEFRAMES.includes(tf)) throw new Error(`Invalid timeframe: ${tf}`);
    const result = await fetchCryptoCandles(symbol, tf, limit, exchange);
    candles = result.candles;
    source  = result.source;
  }

  const ttl = isStock
    ? (tf === '1m' || tf === '3m' || tf === '5m' ? 20 : tf === '15m' || tf === '30m' ? 45 : 120)
    : (tf === '1m' ? 30 : tf === '5m' ? 60 : 300);
  const payload = {candles, source};
  // Only cache non-empty results — empty results should be retried next request
  if (candles.length > 0) {
    await redisConnection.set(cacheKey, JSON.stringify(payload), 'EX', ttl).catch(() => {});
  }
  return payload;
}

// ─── Live Price ───────────────────────────────────────────────────────────────

async function fetchLivePriceKraken(symbol: string): Promise<number | null> {
  try {
    const pair = KRAKEN_SYMBOL_MAP[symbol] ?? symbol.replace('/USDT','USD').replace('/USD','USD').replace('/','');
    const res = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${pair}`, {signal: AbortSignal.timeout(5000)});
    if (!res.ok) return null;
    const json: any = await res.json();
    if (json.error?.length) return null;
    const key = Object.keys(json.result ?? {})[0];
    if (!key) return null;
    return parseFloat(json.result[key].c[0]);
  } catch { return null; }
}

async function fetchLivePriceBinance(symbol: string): Promise<number | null> {
  try {
    const s = symbol.replace('/','').toUpperCase();
    const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${s}`, {signal: AbortSignal.timeout(5000)});
    if (!res.ok) return null;
    const json: any = await res.json();
    return parseFloat(json.price);
  } catch { return null; }
}

async function fetchLivePriceCoinbase(symbol: string): Promise<number | null> {
  try {
    // Coinbase still uses MATIC, not POL
    const productId = symbol.replace('/USDT','-USD').replace('/USD','-USD').replace('/','-').replace('POL-USD','MATIC-USD');
    const res = await fetch(`https://api.coinbase.com/api/v3/brokerage/market/products/${productId}`, {signal: AbortSignal.timeout(5000)});
    if (!res.ok) return null;
    const json: any = await res.json();
    return parseFloat(json.price ?? json.best_bid ?? '0') || null;
  } catch { return null; }
}

async function fetchLivePriceKuCoin(symbol: string): Promise<number | null> {
  try {
    const kcSym = toKucoinSymbol(symbol);
    const res = await fetch(`https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=${kcSym}`, {signal: AbortSignal.timeout(5000)});
    if (!res.ok) return null;
    const json: any = await res.json();
    return parseFloat(json.data?.price ?? '0') || null;
  } catch { return null; }
}

async function fetchLivePriceCoinGecko(symbol: string): Promise<number | null> {
  try {
    const geckoId = getCoinGeckoId(symbol);
    if (!geckoId) return null;
    // Rate-limit guard: 1 request per geckoId per 30s
    const rlKey = `cg:price:rl:${geckoId}`;
    const blocked = await redisConnection.get(rlKey).catch(() => null);
    if (blocked) {
      // Return cached price if available
      const cached = await redisConnection.get(`cg:price:${geckoId}`).catch(() => null);
      return cached ? parseFloat(cached) : null;
    }
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=usd`,
      {signal: AbortSignal.timeout(5000)},
    );
    if (!res.ok) return null;
    const json: any = await res.json();
    const price = json[geckoId]?.usd ?? null;
    if (price) {
      await Promise.all([
        redisConnection.set(`cg:price:${geckoId}`, String(price), 'EX', 60).catch(() => {}),
        redisConnection.set(rlKey, '1', 'EX', 30).catch(() => {}),
      ]);
    }
    return price;
  } catch { return null; }
}

export async function getLivePrice(symbol: string, exchange?: string): Promise<{price: number; source: string} | null> {
  const isStock = !symbol.includes('/') || (symbol.endsWith('/USD') && !symbol.endsWith('/USDT'));

  if (isStock) {
    try {
      const apiKey    = env.ALPACA_API_KEY;
      const apiSecret = env.ALPACA_API_SECRET;
      if (!apiKey || apiKey === 'PLACEHOLDER') return null;
      const cleanSym = symbol.replace('/USD','');
      const res = await fetch(`https://data.alpaca.markets/v2/stocks/${cleanSym}/trades/latest`, {
        headers: {'APCA-API-KEY-ID': apiKey, 'APCA-API-SECRET-KEY': apiSecret},
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      const json: any = await res.json();
      const price = parseFloat(json.trade?.p ?? '0');
      return price > 0 ? {price, source: 'Alpaca'} : null;
    } catch { return null; }
  }

  // Full fallback chain — requested exchange first, then all others
  const tryOrder = exchange
    ? [exchange, 'kraken', 'kucoin', 'coinbase', 'binance', 'coingecko']
    : ['kraken', 'kucoin', 'coinbase', 'binance', 'coingecko'];
  const seen = new Set<string>();

  for (const ex of tryOrder) {
    if (seen.has(ex)) continue;
    seen.add(ex);
    let price: number | null = null;
    let source = '';

    switch (ex) {
      case 'kraken':    price = await fetchLivePriceKraken(symbol);   source = 'Kraken';    break;
      case 'binance':   price = await fetchLivePriceBinance(symbol);  source = 'Binance';   break;
      case 'coinbase':  price = await fetchLivePriceCoinbase(symbol); source = 'Coinbase';  break;
      case 'kucoin':    price = await fetchLivePriceKuCoin(symbol);   source = 'KuCoin';    break;
      case 'coingecko': price = await fetchLivePriceCoinGecko(symbol);source = 'CoinGecko'; break;
    }

    if (price && price > 0) return {price, source};
  }

  return null;
}
