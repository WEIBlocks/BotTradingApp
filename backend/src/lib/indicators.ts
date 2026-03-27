/**
 * Technical Indicators Library
 * Provides RSI, EMA, MACD, Bollinger Bands, ATR calculations
 * for the bot trading engine.
 */

export interface IndicatorSnapshot {
  rsi: number | null;
  ema20: number | null;
  ema50: number | null;
  macd: { macd: number; signal: number; histogram: number } | null;
  bollingerBands: { upper: number; middle: number; lower: number } | null;
  atr: number | null;
  priceChangePercent: number | null;
  volumeChangePercent: number | null;
  currentPrice: number;
  high24h: number;
  low24h: number;
}

// ─── Simple Moving Average ──────────────────────────────────────────────────

export function sma(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

// ─── Exponential Moving Average ─────────────────────────────────────────────

export function ema(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let emaVal = sma(prices.slice(0, period), period)!;
  for (let i = period; i < prices.length; i++) {
    emaVal = prices[i] * k + emaVal * (1 - k);
  }
  return emaVal;
}

// ─── RSI (Relative Strength Index) ─────────────────────────────────────────

export function rsi(prices: number[], period: number = 14): number | null {
  if (prices.length < period + 1) return null;

  let gains = 0;
  let losses = 0;

  // Initial average gain/loss
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  // Smoothed RSI
  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (change < 0 ? Math.abs(change) : 0)) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// ─── MACD ───────────────────────────────────────────────────────────────────

export function macd(
  prices: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): { macd: number; signal: number; histogram: number } | null {
  if (prices.length < slowPeriod + signalPeriod) return null;

  // Calculate MACD line values for signal calculation
  const macdValues: number[] = [];
  for (let i = slowPeriod; i <= prices.length; i++) {
    const slice = prices.slice(0, i);
    const fastEma = ema(slice, fastPeriod);
    const slowEma = ema(slice, slowPeriod);
    if (fastEma !== null && slowEma !== null) {
      macdValues.push(fastEma - slowEma);
    }
  }

  if (macdValues.length < signalPeriod) return null;

  const macdLine = macdValues[macdValues.length - 1];
  const signalLine = ema(macdValues, signalPeriod);
  if (signalLine === null) return null;

  return {
    macd: macdLine,
    signal: signalLine,
    histogram: macdLine - signalLine,
  };
}

// ─── Bollinger Bands ────────────────────────────────────────────────────────

export function bollingerBands(
  prices: number[],
  period = 20,
  stdDevMultiplier = 2,
): { upper: number; middle: number; lower: number } | null {
  if (prices.length < period) return null;

  const slice = prices.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;

  const variance = slice.reduce((sum, p) => sum + (p - middle) ** 2, 0) / period;
  const stdDev = Math.sqrt(variance);

  return {
    upper: middle + stdDevMultiplier * stdDev,
    middle,
    lower: middle - stdDevMultiplier * stdDev,
  };
}

// ─── ATR (Average True Range) ───────────────────────────────────────────────

export function atr(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14,
): number | null {
  if (highs.length < period + 1) return null;

  const trueRanges: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    );
    trueRanges.push(tr);
  }

  if (trueRanges.length < period) return null;

  let atrVal = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trueRanges.length; i++) {
    atrVal = (atrVal * (period - 1) + trueRanges[i]) / period;
  }

  return atrVal;
}

// ─── Compute Full Snapshot ──────────────────────────────────────────────────

export function computeIndicators(
  prices: number[],
  currentPrice: number,
  high24h: number,
  low24h: number,
  volume?: number,
  prevVolume?: number,
): IndicatorSnapshot {
  return {
    rsi: rsi(prices, 14),
    ema20: ema(prices, 20),
    ema50: ema(prices, 50),
    macd: macd(prices),
    bollingerBands: bollingerBands(prices),
    atr: null, // ATR needs OHLC data; use when available
    priceChangePercent: prices.length >= 2
      ? ((currentPrice - prices[prices.length - 2]) / prices[prices.length - 2]) * 100
      : null,
    volumeChangePercent: volume && prevVolume && prevVolume > 0
      ? ((volume - prevVolume) / prevVolume) * 100
      : null,
    currentPrice,
    high24h,
    low24h,
  };
}

/**
 * Check if indicators have changed significantly enough to warrant an AI call.
 * Returns true if any trigger condition is met.
 */
export function hasSignificantChange(
  current: IndicatorSnapshot,
  previous: IndicatorSnapshot | null,
  thresholds = {
    priceChangePct: 0.5,      // 0.5% price move
    rsiCrossLevels: [30, 70], // RSI crossing oversold/overbought
    macdCrossover: true,       // MACD line crossing signal line
    bollingerTouch: true,      // Price touching Bollinger bands
  },
): { triggered: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (!previous) {
    reasons.push('First analysis cycle');
    return { triggered: true, reasons };
  }

  // Price change trigger
  if (current.priceChangePercent !== null && Math.abs(current.priceChangePercent) >= thresholds.priceChangePct) {
    reasons.push(`Price moved ${current.priceChangePercent.toFixed(2)}%`);
  }

  // RSI cross trigger
  if (current.rsi !== null && previous.rsi !== null) {
    for (const level of thresholds.rsiCrossLevels) {
      if ((previous.rsi < level && current.rsi >= level) || (previous.rsi > level && current.rsi <= level)) {
        reasons.push(`RSI crossed ${level} (now ${current.rsi.toFixed(1)})`);
      }
    }
    // RSI in extreme zones
    if (current.rsi < 25 || current.rsi > 75) {
      reasons.push(`RSI in extreme zone: ${current.rsi.toFixed(1)}`);
    }
  }

  // MACD crossover trigger
  if (thresholds.macdCrossover && current.macd && previous.macd) {
    const prevSign = Math.sign(previous.macd.histogram);
    const currSign = Math.sign(current.macd.histogram);
    if (prevSign !== currSign && prevSign !== 0) {
      reasons.push(`MACD ${currSign > 0 ? 'bullish' : 'bearish'} crossover`);
    }
  }

  // Bollinger Band touch trigger
  if (thresholds.bollingerTouch && current.bollingerBands) {
    const bb = current.bollingerBands;
    if (current.currentPrice >= bb.upper * 0.998) {
      reasons.push(`Price at upper Bollinger Band ($${bb.upper.toFixed(2)})`);
    }
    if (current.currentPrice <= bb.lower * 1.002) {
      reasons.push(`Price at lower Bollinger Band ($${bb.lower.toFixed(2)})`);
    }
  }

  return { triggered: reasons.length > 0, reasons };
}
