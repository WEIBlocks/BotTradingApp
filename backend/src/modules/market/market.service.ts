import ccxt from 'ccxt';
import { redisConnection } from '../../config/queue.js';

const binance = new ccxt.binance({ enableRateLimit: true });

const VALID_CRYPTO_TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'];

// Alpaca timeframe mapping
const ALPACA_TF_MAP: Record<string, string> = {
  '1m': '1Min', '5m': '5Min', '15m': '15Min',
  '1h': '1Hour', '4h': '4Hour', '1d': '1Day', '1w': '1Week',
};

let alpacaClient: any = null;
async function getAlpacaClient() {
  if (alpacaClient) return alpacaClient;
  try {
    const Alpaca = (await import('@alpacahq/alpaca-trade-api')).default;
    alpacaClient = new Alpaca({
      keyId: process.env.ALPACA_API_KEY || 'PLACEHOLDER',
      secretKey: process.env.ALPACA_API_SECRET || 'PLACEHOLDER',
      paper: true,
      usePolygon: false,
    });
    return alpacaClient;
  } catch {
    return null;
  }
}

export async function getCandles(symbol: string, timeframe: string = '4h', limit: number = 100) {
  const tf = timeframe.toLowerCase();
  const isStock = !symbol.includes('/');

  // Check cache
  const cacheKey = `ohlcv:${symbol.replace('/', ':')}:${tf}:${limit}`;
  const cached = await redisConnection.get(cacheKey).catch(() => null);
  if (cached) return JSON.parse(cached);

  let candles: any[];

  if (isStock) {
    // Fetch from Alpaca
    const alpaca = await getAlpacaClient();
    if (!alpaca) throw new Error('Stock market data unavailable');

    const alpacaTF = ALPACA_TF_MAP[tf];
    if (!alpacaTF) throw new Error(`Invalid timeframe for stocks: ${tf}. Valid: ${Object.keys(ALPACA_TF_MAP).join(', ')}`);

    const cleanSymbol = symbol.replace('/USD', '');
    const bars: any[] = [];
    const barsIter = alpaca.getBarsV2(cleanSymbol, {
      timeframe: alpacaTF,
      limit,
      feed: 'iex', // free data feed
    });
    for await (const bar of barsIter) {
      bars.push(bar);
    }

    candles = bars.map((b: any) => ({
      timestamp: new Date(b.Timestamp ?? b.t).getTime(),
      open: b.OpenPrice ?? b.o ?? 0,
      high: b.HighPrice ?? b.h ?? 0,
      low: b.LowPrice ?? b.l ?? 0,
      close: b.ClosePrice ?? b.c ?? 0,
      volume: b.Volume ?? b.v ?? 0,
    }));
  } else {
    // Fetch from Binance
    if (!VALID_CRYPTO_TIMEFRAMES.includes(tf)) {
      throw new Error(`Invalid timeframe: ${tf}. Valid: ${VALID_CRYPTO_TIMEFRAMES.join(', ')}`);
    }

    const ohlcv = await binance.fetchOHLCV(symbol, tf, undefined, limit);
    candles = ohlcv.map((c) => ({
      timestamp: Number(c[0] ?? 0),
      open: Number(c[1] ?? 0),
      high: Number(c[2] ?? 0),
      low: Number(c[3] ?? 0),
      close: Number(c[4] ?? 0),
      volume: Number(c[5] ?? 0),
    }));
  }

  // Cache: stocks 5min (market data less frequent), crypto varies by TF
  const ttl = isStock ? 300 : (tf === '1m' ? 60 : tf === '5m' ? 120 : 300);
  await redisConnection.set(cacheKey, JSON.stringify(candles), 'EX', ttl).catch(() => {});

  return candles;
}
