import ccxt from 'ccxt';

// Binance public API is geo-blocked on DigitalOcean NYC (HTTP 451).
// KuCoin has no such restriction and covers the same major pairs.
const exchange = new ccxt.kucoin({ enableRateLimit: true });

interface AssetRanking {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  volume24h: number;
  volumeScore: number;
  momentumScore: number;
  overallScore: number;
}

// ─── Stock Data via Alpaca ───────────────────────────────────────────────────

interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  timestamp: string;
}

// Cache stock quotes for 30 seconds
const stockCache = new Map<string, { data: StockQuote; at: number }>();
const STOCK_CACHE_TTL = 30000;

async function fetchAlpacaQuotes(symbols: string[]): Promise<Map<string, StockQuote>> {
  const result = new Map<string, StockQuote>();
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_API_SECRET;
  if (!key || !secret) return result;

  try {
    // Alpaca v2 latest trade + bars endpoint
    const syms = symbols.join(',');
    const headers = { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret };

    // Fetch latest bars (1Min) for price/volume
    const barsUrl = `https://data.alpaca.markets/v2/stocks/bars/latest?symbols=${syms}&feed=iex`;
    const barsRes = await fetch(barsUrl, { headers });
    if (!barsRes.ok) throw new Error(`Alpaca bars ${barsRes.status}`);
    const barsJson = await barsRes.json() as any;

    // Fetch previous close via daily bars
    const prevUrl = `https://data.alpaca.markets/v2/stocks/bars?symbols=${syms}&timeframe=1Day&limit=2&feed=iex`;
    const prevRes = await fetch(prevUrl, { headers });
    const prevJson = prevRes.ok ? await prevRes.json() as any : null;

    for (const sym of symbols) {
      const bar = barsJson?.bars?.[sym];
      if (!bar) continue;

      const prevBars = prevJson?.bars?.[sym];
      const prevClose = prevBars && prevBars.length >= 2 ? prevBars[prevBars.length - 2].c : bar.o;
      const price = bar.c;
      const change = price - prevClose;
      const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

      const quote: StockQuote = {
        symbol: sym,
        price,
        change,
        changePercent,
        volume: bar.v || 0,
        high: bar.h || price,
        low: bar.l || price,
        open: bar.o || price,
        previousClose: prevClose,
        timestamp: bar.t || new Date().toISOString(),
      };
      result.set(sym, quote);
      stockCache.set(sym, { data: quote, at: Date.now() });
    }
  } catch (err) {
    console.warn('[MarketScanner] Alpaca fetch failed:', err);
  }
  return result;
}

export async function getStockQuotes(symbols: string[]): Promise<StockQuote[]> {
  const now = Date.now();
  const toFetch: string[] = [];
  const results: StockQuote[] = [];

  for (const sym of symbols) {
    const cached = stockCache.get(sym.toUpperCase());
    if (cached && now - cached.at < STOCK_CACHE_TTL) {
      results.push(cached.data);
    } else {
      toFetch.push(sym.toUpperCase());
    }
  }

  if (toFetch.length > 0) {
    const fetched = await fetchAlpacaQuotes(toFetch);
    fetched.forEach(q => results.push(q));
  }

  return results;
}

export async function getStockQuote(symbol: string): Promise<StockQuote | null> {
  const quotes = await getStockQuotes([symbol]);
  return quotes[0] ?? null;
}

// Detect if a message mentions specific stock tickers (e.g. AAPL, TSLA, SPY)
// Returns array of uppercase ticker symbols found
export function extractStockTickers(message: string): string[] {
  // Common stock-ticker pattern: 1-5 uppercase letters, not part of a longer word
  // Also handles well-known tickers mentioned in lowercase
  const knownTickers = ['AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'TSLA', 'META', 'NVDA', 'AMD',
    'NFLX', 'SPY', 'QQQ', 'DIA', 'IWM', 'VTI', 'COIN', 'HOOD', 'RBLX', 'PLTR',
    'GME', 'AMC', 'BBBY', 'LCID', 'RIVN', 'NIO', 'BABA', 'JD', 'PDD', 'SHOP',
    'SQ', 'PYPL', 'V', 'MA', 'JPM', 'BAC', 'WFC', 'GS', 'MS', 'C',
    'XOM', 'CVX', 'COP', 'BP', 'OXY', 'INTC', 'QCOM', 'MU', 'AVGO', 'TXN',
    'DIS', 'CMCSA', 'T', 'VZ', 'TMUS', 'WMT', 'TGT', 'COST', 'AMGN', 'PFE', 'MRNA',
  ];

  const found = new Set<string>();
  const upper = message.toUpperCase();

  // Match known tickers
  for (const ticker of knownTickers) {
    const re = new RegExp(`\\b${ticker}\\b`);
    if (re.test(upper)) found.add(ticker);
  }

  // Also match explicit uppercase 2-5 letter sequences surrounded by word boundaries
  const matches = upper.match(/\b([A-Z]{2,5})\b/g) || [];
  for (const m of matches) {
    // Filter out common English words and crypto tokens
    const skip = ['RSI', 'MACD', 'EMA', 'SMA', 'ATR', 'OBV', 'DCA', 'USD', 'USDT',
      'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOT', 'DOGE', 'LTC', 'LINK',
      'API', 'URL', 'FAQ', 'PDF', 'BOT', 'AI', 'THE', 'AND', 'FOR', 'NOT', 'BUT',
      'HOW', 'WHY', 'WHAT', 'WHEN', 'DOES', 'CAN', 'YOU', 'YOUR', 'ITS', 'ETF',
      'TOP', 'NEW', 'ALL', 'SET', 'BUY', 'SELL', 'STOP', 'LOSS', 'HIGH', 'LOW',
      'WIN', 'PRO', 'MAX', 'MIN', 'YES', 'NO', 'MED', 'ROI', 'PNL', 'AVG', 'SUM',
    ];
    if (!skip.includes(m) && m.length >= 2) found.add(m);
  }

  return [...found].slice(0, 10); // max 10 tickers at once
}

// Maps full names and common aliases → ticker symbol
const CRYPTO_NAME_MAP: Record<string, string> = {
  bitcoin: 'BTC', btc: 'BTC',
  ethereum: 'ETH', eth: 'ETH', ether: 'ETH',
  bnb: 'BNB', binance: 'BNB',
  solana: 'SOL', sol: 'SOL',
  xrp: 'XRP', ripple: 'XRP',
  cardano: 'ADA', ada: 'ADA',
  polkadot: 'DOT', dot: 'DOT',
  dogecoin: 'DOGE', doge: 'DOGE',
  litecoin: 'LTC', ltc: 'LTC',
  chainlink: 'LINK', link: 'LINK',
  avalanche: 'AVAX', avax: 'AVAX',
  polygon: 'MATIC', matic: 'MATIC',
  uniswap: 'UNI', uni: 'UNI',
  cosmos: 'ATOM', atom: 'ATOM',
  fantom: 'FTM', ftm: 'FTM',
  near: 'NEAR',
  algorand: 'ALGO', algo: 'ALGO',
  tron: 'TRX', trx: 'TRX',
  stellar: 'XLM', xlm: 'XLM',
  monero: 'XMR', xmr: 'XMR',
  filecoin: 'FIL', fil: 'FIL',
  aave: 'AAVE',
  compound: 'COMP', comp: 'COMP',
  maker: 'MKR', mkr: 'MKR',
  shiba: 'SHIB', shib: 'SHIB', 'shiba inu': 'SHIB',
  pepe: 'PEPE',
  sui: 'SUI',
  aptos: 'APT', apt: 'APT',
  arbitrum: 'ARB', arb: 'ARB',
  optimism: 'OP', op: 'OP',
  injective: 'INJ', inj: 'INJ',
  sei: 'SEI',
  ton: 'TON', toncoin: 'TON',
  worldcoin: 'WLD', wld: 'WLD',
  render: 'RNDR', rndr: 'RNDR',
  'fetch.ai': 'FET', fet: 'FET',
  ocean: 'OCEAN',
  sandbox: 'SAND', sand: 'SAND',
  decentraland: 'MANA', mana: 'MANA',
};

const STOCK_NAME_MAP: Record<string, string> = {
  apple: 'AAPL', aapl: 'AAPL',
  microsoft: 'MSFT', msft: 'MSFT',
  google: 'GOOGL', alphabet: 'GOOGL', googl: 'GOOGL',
  amazon: 'AMZN', amzn: 'AMZN',
  tesla: 'TSLA', tsla: 'TSLA',
  nvidia: 'NVDA', nvda: 'NVDA',
  meta: 'META', facebook: 'META',
  amd: 'AMD',
  netflix: 'NFLX', nflx: 'NFLX',
  coinbase: 'COIN', coin: 'COIN',
  palantir: 'PLTR', pltr: 'PLTR',
  robinhood: 'HOOD', hood: 'HOOD',
  gamestop: 'GME', gme: 'GME',
  rivian: 'RIVN', rivn: 'RIVN',
  lucid: 'LCID', lcid: 'LCID',
  nio: 'NIO',
  alibaba: 'BABA', baba: 'BABA',
  shopify: 'SHOP', shop: 'SHOP',
  paypal: 'PYPL', pypl: 'PYPL',
  'square': 'SQ', sq: 'SQ',
  visa: 'V',
  mastercard: 'MA',
  jpmorgan: 'JPM', jpm: 'JPM',
  'bank of america': 'BAC', bac: 'BAC',
  'goldman sachs': 'GS', gs: 'GS',
  intel: 'INTC', intc: 'INTC',
  qualcomm: 'QCOM', qcom: 'QCOM',
  broadcom: 'AVGO', avgo: 'AVGO',
  disney: 'DIS', dis: 'DIS',
  walmart: 'WMT', wmt: 'WMT',
  target: 'TGT', tgt: 'TGT',
  costco: 'COST', cost: 'COST',
  pfizer: 'PFE', pfe: 'PFE',
  moderna: 'MRNA', mrna: 'MRNA',
  spy: 'SPY', qqq: 'QQQ', dia: 'DIA',
};

// Detect crypto pairs/symbols in a message — handles full names AND tickers
export function extractCryptoPairs(message: string): string[] {
  const lower = message.toLowerCase();
  const upper = message.toUpperCase();
  const found = new Set<string>();

  // Match by full name / alias
  for (const [name, ticker] of Object.entries(CRYPTO_NAME_MAP)) {
    if (lower.includes(name)) found.add(ticker);
  }

  // Also match bare tickers (word-boundary)
  const tickers = Object.values(CRYPTO_NAME_MAP);
  for (const ticker of tickers) {
    if (new RegExp(`\\b${ticker}\\b`).test(upper)) found.add(ticker);
  }

  return [...found];
}

// Detect stock tickers/names in a message
export function extractStockSymbols(message: string): string[] {
  const lower = message.toLowerCase();
  const upper = message.toUpperCase();
  const found = new Set<string>();

  for (const [name, ticker] of Object.entries(STOCK_NAME_MAP)) {
    if (lower.includes(name)) found.add(ticker);
  }

  // Also match bare uppercase tickers
  const tickers = [...new Set(Object.values(STOCK_NAME_MAP))];
  for (const ticker of tickers) {
    if (new RegExp(`\\b${ticker}\\b`).test(upper)) found.add(ticker);
  }

  return [...found];
}

// Cache for 60 seconds
let cachedRankings: AssetRanking[] = [];
let cacheTime = 0;

export async function getTopAssets(limit = 10, _type: 'crypto' | 'all' = 'crypto'): Promise<AssetRanking[]> {
  // Return cached if fresh
  if (Date.now() - cacheTime < 60000 && cachedRankings.length > 0) {
    return cachedRankings.slice(0, limit);
  }

  try {
    const tickers = await exchange.fetchTickers();

    // Filter USDT pairs only for consistency
    const usdtPairs = Object.entries(tickers)
      .filter(([symbol]) => symbol.endsWith('/USDT') && !symbol.includes(':'))
      .map(([symbol, ticker]) => {
        const change = ticker.percentage || 0;
        const volume = ticker.quoteVolume || 0;
        const price = ticker.last || 0;

        // Momentum score: weighted by price change magnitude
        const momentumScore = Math.abs(change) * (change > 0 ? 1.2 : 0.8);

        // Volume score: normalized (log scale)
        const volumeScore = volume > 0 ? Math.log10(volume) : 0;

        // Overall score: momentum * volume weight
        const overallScore = momentumScore * (volumeScore / 10);

        return {
          symbol: symbol.replace('/USDT', ''),
          name: symbol,
          price,
          change24h: change,
          volume24h: volume,
          volumeScore,
          momentumScore,
          overallScore,
        };
      })
      .filter(a => a.volume24h > 100000) // minimum volume filter
      .sort((a, b) => b.overallScore - a.overallScore);

    cachedRankings = usdtPairs;
    cacheTime = Date.now();

    return usdtPairs.slice(0, limit);
  } catch (error) {
    console.error('[MarketScanner] Error:', error);
    return cachedRankings.slice(0, limit); // return stale cache on error
  }
}

// ─── DexScreener Integration ─────────────────────────────────────────────────

export interface DexToken {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  volume24h: number;
  liquidity: number;
  marketCap: number;
  chain: string;
  dexName: string;
  pairAddress: string;
  baseAddress: string;
  priceUsd: string;
  txns24h: { buys: number; sells: number };
}

const dexCache = new Map<string, { data: DexToken[]; at: number }>();
const DEX_CACHE_TTL = 20_000; // 20 seconds

/**
 * Search DexScreener for a token by symbol or name.
 * Returns the top matching pairs sorted by liquidity (most liquid = most reliable price).
 */
export async function searchDexScreener(query: string): Promise<DexToken[]> {
  const key = query.toLowerCase().trim();
  const cached = dexCache.get(key);
  if (cached && Date.now() - cached.at < DEX_CACHE_TTL) return cached.data;

  try {
    const url = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'BotTradeApp/1.0' },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return [];
    const json = await res.json() as any;
    const pairs: any[] = json?.pairs ?? [];

    if (pairs.length === 0) return [];

    // Normalise and filter: only USD/USDT/USDC quote tokens, liquidity > $1k
    const results: DexToken[] = pairs
      .filter(p => {
        const quote = (p.quoteToken?.symbol ?? '').toUpperCase();
        return (quote === 'USD' || quote === 'USDT' || quote === 'USDC' || quote === 'WETH' || quote === 'WBNB') &&
          (p.liquidity?.usd ?? 0) > 1000;
      })
      .map(p => ({
        symbol: (p.baseToken?.symbol ?? query).toUpperCase(),
        name: p.baseToken?.name ?? query,
        price: parseFloat(p.priceUsd ?? '0'),
        change24h: p.priceChange?.h24 ?? 0,
        volume24h: p.volume?.h24 ?? 0,
        liquidity: p.liquidity?.usd ?? 0,
        marketCap: p.marketCap ?? p.fdv ?? 0,
        chain: p.chainId ?? 'unknown',
        dexName: p.dexId ?? 'unknown',
        pairAddress: p.pairAddress ?? '',
        baseAddress: p.baseToken?.address ?? '',
        priceUsd: p.priceUsd ?? '0',
        txns24h: {
          buys: p.txns?.h24?.buys ?? 0,
          sells: p.txns?.h24?.sells ?? 0,
        },
      }))
      // Sort by liquidity descending — most liquid pair = most trustworthy price
      .sort((a, b) => b.liquidity - a.liquidity);

    // Deduplicate: keep best pair per chain
    const seen = new Map<string, DexToken>();
    for (const t of results) {
      const chainKey = `${t.symbol}-${t.chain}`;
      if (!seen.has(chainKey)) seen.set(chainKey, t);
    }
    const deduped = [...seen.values()].slice(0, 5);

    dexCache.set(key, { data: deduped, at: Date.now() });
    return deduped;
  } catch (err) {
    console.warn('[DexScreener] search failed:', err);
    return [];
  }
}

/**
 * Get best DexScreener price for a token (most liquid pair).
 */
export async function getDexPrice(symbolOrName: string): Promise<DexToken | null> {
  const results = await searchDexScreener(symbolOrName);
  return results[0] ?? null;
}

// ─── Unified price resolver: Binance first, DexScreener fallback ─────────────

export interface ResolvedPrice {
  symbol: string;
  name?: string;
  price: number;
  change24h: number;
  volume24h?: number;
  liquidity?: number;
  marketCap?: number;
  chain?: string;
  source: 'binance' | 'dexscreener';
}

/**
 * Try Binance first (fast, reliable for top coins).
 * If not listed on Binance, fall back to DexScreener (covers all DEX tokens).
 */
export async function resolveTokenPrice(symbol: string): Promise<ResolvedPrice | null> {
  // 1. Try Binance
  try {
    const pair = symbol.includes('/') ? symbol : `${symbol.toUpperCase()}/USDT`;
    const ticker = await exchange.fetchTicker(pair);
    if (ticker.last && ticker.last > 0) {
      return {
        symbol: symbol.toUpperCase(),
        price: ticker.last,
        change24h: ticker.percentage ?? 0,
        volume24h: ticker.quoteVolume ?? 0,
        source: 'binance',
      };
    }
  } catch {
    // Not on Binance — fall through to DexScreener
  }

  // 2. Fall back to DexScreener
  const dex = await getDexPrice(symbol);
  if (dex && dex.price > 0) {
    return {
      symbol: dex.symbol,
      name: dex.name,
      price: dex.price,
      change24h: dex.change24h,
      volume24h: dex.volume24h,
      liquidity: dex.liquidity,
      marketCap: dex.marketCap,
      chain: dex.chain,
      source: 'dexscreener',
    };
  }

  return null;
}

// Get current price for a symbol — uses unified resolver
export async function getPrice(symbol: string): Promise<{ price: number; change24h: number } | null> {
  const resolved = await resolveTokenPrice(symbol);
  if (!resolved) return null;
  return { price: resolved.price, change24h: resolved.change24h };
}

// Get market overview
export async function getMarketOverview(): Promise<{
  totalMarketCap: string;
  btcDominance: string;
  topGainers: AssetRanking[];
  topLosers: AssetRanking[];
  topVolume: AssetRanking[];
}> {
  const all = await getTopAssets(100);

  const sorted = [...all].sort((a, b) => b.change24h - a.change24h);
  const topGainers = sorted.slice(0, 5);
  const topLosers = sorted.slice(-5).reverse();
  const topVolume = [...all].sort((a, b) => b.volume24h - a.volume24h).slice(0, 5);

  return {
    totalMarketCap: 'N/A', // would need CoinGecko for this
    btcDominance: 'N/A',
    topGainers,
    topLosers,
    topVolume,
  };
}
