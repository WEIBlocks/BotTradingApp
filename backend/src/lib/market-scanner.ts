import ccxt from 'ccxt';

const exchange = new ccxt.binance({ enableRateLimit: true });

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

// Cache for 60 seconds
let cachedRankings: AssetRanking[] = [];
let cacheTime = 0;

export async function getTopAssets(limit = 10, type: 'crypto' | 'all' = 'crypto'): Promise<AssetRanking[]> {
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

// Get current price for a symbol
export async function getPrice(symbol: string): Promise<{ price: number; change24h: number } | null> {
  try {
    const pair = symbol.includes('/') ? symbol : `${symbol.toUpperCase()}/USDT`;
    const ticker = await exchange.fetchTicker(pair);
    return {
      price: ticker.last || 0,
      change24h: ticker.percentage || 0,
    };
  } catch {
    return null;
  }
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
