/**
 * Technical Indicators Library
 * Provides RSI, EMA, MACD, Bollinger Bands, ATR calculations
 * for the bot trading engine.
 */
export interface IndicatorSnapshot {
    rsi: number | null;
    ema20: number | null;
    ema50: number | null;
    macd: {
        macd: number;
        signal: number;
        histogram: number;
    } | null;
    bollingerBands: {
        upper: number;
        middle: number;
        lower: number;
    } | null;
    atr: number | null;
    priceChangePercent: number | null;
    volumeChangePercent: number | null;
    currentPrice: number;
    high24h: number;
    low24h: number;
}
export declare function sma(prices: number[], period: number): number | null;
export declare function ema(prices: number[], period: number): number | null;
export declare function rsi(prices: number[], period?: number): number | null;
export declare function macd(prices: number[], fastPeriod?: number, slowPeriod?: number, signalPeriod?: number): {
    macd: number;
    signal: number;
    histogram: number;
} | null;
export declare function bollingerBands(prices: number[], period?: number, stdDevMultiplier?: number): {
    upper: number;
    middle: number;
    lower: number;
} | null;
export declare function atr(highs: number[], lows: number[], closes: number[], period?: number): number | null;
export declare function computeIndicators(prices: number[], currentPrice: number, high24h: number, low24h: number, volume?: number, prevVolume?: number): IndicatorSnapshot;
/**
 * Check if indicators have changed significantly enough to warrant an AI call.
 * Returns true if any trigger condition is met.
 */
export declare function hasSignificantChange(current: IndicatorSnapshot, previous: IndicatorSnapshot | null, thresholds?: {
    priceChangePct: number;
    rsiCrossLevels: number[];
    macdCrossover: boolean;
    bollingerTouch: boolean;
}): {
    triggered: boolean;
    reasons: string[];
};
