import React, {useMemo, useState, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import {CandlestickChart as WagmiCandlestick} from 'react-native-wagmi-charts';
import Svg, {Path} from 'react-native-svg';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface OHLC {
  time: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface WagmiCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

// ─── Realistic OHLC Generator ───────────────────────────────────────────────
// Produces candles with natural bull/bear mix, proper wicks, and realistic
// price action — not just monotonic increases.

export function generateOHLC(prices: number[]): OHLC[] {
  if (prices.length < 4) return [];

  const candleCount = Math.min(Math.max(20, Math.floor(prices.length / 2)), 60);
  const windowSize = Math.max(1, Math.floor(prices.length / candleCount));
  const candles: OHLC[] = [];

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const totalCandles = Math.ceil(prices.length / windowSize);

  for (let i = 0; i < prices.length; i += windowSize) {
    const slice = prices.slice(i, i + windowSize);
    if (slice.length === 0) continue;

    const candleIdx = candles.length;
    const date = new Date(
      now.getTime() - (totalCandles - candleIdx - 1) * 86400000,
    );

    // Use midpoint of the slice as reference price
    const midPrice = slice.reduce((a, b) => a + b, 0) / slice.length;
    const sliceRange = Math.max(...slice) - Math.min(...slice);
    const volatility = Math.max(sliceRange, midPrice * 0.008);

    // Determine open/close with natural randomness
    // Sometimes close > open (bull), sometimes close < open (bear)
    let open: number, close: number;
    if (candles.length > 0) {
      open = candles[candles.length - 1].close; // Continuity from prev candle
    } else {
      open = slice[0];
    }

    // Close trends toward end of slice but with randomness
    const sliceEnd = slice[slice.length - 1];
    const noise = (Math.random() - 0.5) * volatility * 0.6;
    close = sliceEnd + noise;

    // Ensure some variation — randomly flip direction ~35% of the time
    if (Math.random() < 0.35) {
      const temp = open;
      open = close;
      close = temp;
    }

    // High is always above both open and close
    const upper = Math.max(open, close);
    const lower = Math.min(open, close);
    const bodySize = upper - lower || midPrice * 0.003;

    const high = upper + bodySize * (0.2 + Math.random() * 0.8);
    const low = lower - bodySize * (0.2 + Math.random() * 0.8);

    const vol = Math.round(
      (500 + Math.random() * 4500) * (1 + (bodySize / midPrice) * 50),
    );

    candles.push({
      time: date.getTime(),
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume: vol,
    });
  }

  return candles;
}

// ─── Convert OHLC → Wagmi ───────────────────────────────────────────────────

function toWagmiData(candles: OHLC[]): WagmiCandle[] {
  return candles.map(c => {
    let timestamp: number;
    if (typeof c.time === 'number') {
      timestamp = c.time < 1e12 ? c.time * 1000 : c.time;
    } else {
      timestamp = new Date(c.time as string).getTime();
    }
    return {timestamp, open: c.open, high: c.high, low: c.low, close: c.close};
  });
}

// ─── Timeframe → visible candle count mapping ───────────────────────────────
// Selecting a timeframe changes how many candles are visible (zoom level)

const TF_CANDLE_COUNT: Record<string, number> = {
  '1m': 15,
  '5m': 20,
  '15m': 30,
  '1H': 40,
  '4H': 50,
  '1D': 60,
  '1W': 80,
  '1M': 120,
  '3M': 200,
  ALL: 9999,
};

// ─── Timeframe Bar ──────────────────────────────────────────────────────────

const DEFAULT_TIMEFRAMES = ['1H', '4H', '1D', '1W', 'ALL'];

function TimeframeBar({
  timeframes = DEFAULT_TIMEFRAMES,
  selected,
  onSelect,
}: {
  timeframes?: string[];
  selected: string;
  onSelect: (tf: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={tfStyles.scrollContent}
      style={tfStyles.scroll}>
      {timeframes.map(tf => {
        const active = tf === selected;
        return (
          <TouchableOpacity
            key={tf}
            activeOpacity={0.7}
            style={[tfStyles.chip, active && tfStyles.chipActive]}
            onPress={() => onSelect(tf)}>
            <Text style={[tfStyles.text, active && tfStyles.textActive]}>
              {tf}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const tfStyles = StyleSheet.create({
  scroll: {flexGrow: 0, marginBottom: 6},
  scrollContent: {gap: 6, paddingRight: 8},
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  chipActive: {backgroundColor: '#10B981'},
  text: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
  },
  textActive: {color: '#FFFFFF'},
});

// ─── Zoom Controls ──────────────────────────────────────────────────────────

function ZoomControls({
  onZoomIn,
  onZoomOut,
  canZoomIn,
  canZoomOut,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  canZoomIn: boolean;
  canZoomOut: boolean;
}) {
  return (
    <View style={zoomStyles.container}>
      <TouchableOpacity
        activeOpacity={0.6}
        style={[zoomStyles.btn, !canZoomIn && zoomStyles.btnDisabled]}
        onPress={onZoomIn}
        disabled={!canZoomIn}>
        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
          <Path
            d="M12 5v14M5 12h14"
            stroke={canZoomIn ? '#fff' : 'rgba(255,255,255,0.2)'}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        </Svg>
      </TouchableOpacity>
      <TouchableOpacity
        activeOpacity={0.6}
        style={[zoomStyles.btn, !canZoomOut && zoomStyles.btnDisabled]}
        onPress={onZoomOut}
        disabled={!canZoomOut}>
        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
          <Path
            d="M5 12h14"
            stroke={canZoomOut ? '#fff' : 'rgba(255,255,255,0.2)'}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        </Svg>
      </TouchableOpacity>
    </View>
  );
}

const zoomStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 6,
  },
  btn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnDisabled: {opacity: 0.4},
});

// ─── OHLC Header ────────────────────────────────────────────────────────────

function OHLCHeader({candle}: {candle: WagmiCandle}) {
  const isBull = candle.close >= candle.open;
  const color = isBull ? '#26a69a' : '#ef5350';
  const fmt = (v: number) => (v >= 1000 ? v.toFixed(0) : v.toFixed(2));

  return (
    <View style={ohlcStyles.row}>
      <Text style={ohlcStyles.label}>O </Text>
      <Text style={[ohlcStyles.val, {color}]}>{fmt(candle.open)}</Text>
      <Text style={ohlcStyles.label}>  H </Text>
      <Text style={[ohlcStyles.val, {color}]}>{fmt(candle.high)}</Text>
      <Text style={ohlcStyles.label}>  L </Text>
      <Text style={[ohlcStyles.val, {color}]}>{fmt(candle.low)}</Text>
      <Text style={ohlcStyles.label}>  C </Text>
      <Text style={[ohlcStyles.val, {color}]}>{fmt(candle.close)}</Text>
    </View>
  );
}

const ohlcStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 2,
    paddingBottom: 6,
  },
  label: {
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
  },
  val: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
  },
});

// ─── Price Axis ─────────────────────────────────────────────────────────────

function PriceAxis({
  candles,
  height,
}: {
  candles: WagmiCandle[];
  height: number;
}) {
  if (candles.length === 0) return null;

  const maxPrice = Math.max(...candles.map(c => c.high));
  const minPrice = Math.min(...candles.map(c => c.low));
  const range = maxPrice - minPrice || 1;
  const padding = 14;

  const labels = [];
  for (let i = 0; i < 5; i++) {
    const price = maxPrice - (range * i) / 4;
    const y = padding + (i / 4) * (height - padding * 2);
    labels.push({price, y});
  }

  return (
    <View style={axisStyles.container} pointerEvents="none">
      {labels.map((l, i) => (
        <Text key={i} style={[axisStyles.label, {top: l.y - 7}]}>
          {l.price >= 1000 ? l.price.toFixed(0) : l.price.toFixed(2)}
        </Text>
      ))}
    </View>
  );
}

const axisStyles = StyleSheet.create({
  container: {position: 'absolute', right: 2, top: 0, bottom: 0},
  label: {
    position: 'absolute',
    fontFamily: 'Inter-Regular',
    fontSize: 9,
    color: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(15,17,23,0.8)',
    paddingHorizontal: 2,
  },
});

// ─── Grid ───────────────────────────────────────────────────────────────────

function GridOverlay({height}: {height: number}) {
  const padding = 14;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({length: 5}).map((_, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            top: padding + (i / 4) * (height - padding * 2),
            left: 0,
            right: 0,
            height: StyleSheet.hairlineWidth,
            backgroundColor: 'rgba(255,255,255,0.05)',
          }}
        />
      ))}
    </View>
  );
}

// ─── CandlestickChart Component ─────────────────────────────────────────────

export interface CandlestickChartProps {
  data: number[] | OHLC[];
  width: number;
  height?: number;
  showTimeframes?: boolean;
  timeframes?: string[];
  selectedTimeframe?: string;
  onTimeframeChange?: (tf: string) => void;
  showVolume?: boolean;
  showGrid?: boolean;
  showCrosshair?: boolean;
  showXLabels?: boolean;
  showYLabels?: boolean;
  showMA?: boolean;
  style?: ViewStyle;
  label?: string;
  livePrice?: number; // Override displayed price with real-time value
}

export default function CandlestickChart({
  data,
  width,
  height = 300,
  showTimeframes = true,
  timeframes,
  livePrice,
  selectedTimeframe: externalTF,
  onTimeframeChange,
  showGrid = true,
  showCrosshair = true,
  showYLabels = true,
  style,
  label,
}: CandlestickChartProps) {
  const [internalTF, setInternalTF] = useState('1D');
  const [zoomLevel, setZoomLevel] = useState(0); // 0 = default, positive = zoomed in
  const selectedTF = externalTF ?? internalTF;

  const handleTFChange = useCallback(
    (tf: string) => {
      if (onTimeframeChange) onTimeframeChange(tf);
      else setInternalTF(tf);
      setZoomLevel(0); // reset zoom when changing timeframe
    },
    [onTimeframeChange],
  );

  // Generate full OHLC dataset
  const allCandles: WagmiCandle[] = useMemo(() => {
    if (!data || data.length === 0) return [];
    let ohlc: OHLC[];
    if (typeof data[0] === 'number') {
      ohlc = generateOHLC(data as number[]);
    } else {
      ohlc = data as OHLC[];
    }
    return toWagmiData(ohlc);
  }, [data]);

  // Slice data based on timeframe + zoom
  const visibleData: WagmiCandle[] = useMemo(() => {
    if (allCandles.length === 0) return [];

    // Base visible count from timeframe
    const baseTFCount = TF_CANDLE_COUNT[selectedTF] ?? 60;
    // Zoom adjusts visible count: zoom in = fewer candles, zoom out = more
    const zoomFactor = Math.pow(0.7, zoomLevel);
    const visibleCount = Math.max(
      8,
      Math.min(allCandles.length, Math.round(baseTFCount * zoomFactor)),
    );

    // Always show the most recent candles
    return allCandles.slice(-visibleCount);
  }, [allCandles, selectedTF, zoomLevel]);

  const handleZoomIn = useCallback(() => {
    setZoomLevel(prev => Math.min(prev + 1, 5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomLevel(prev => Math.max(prev - 1, -3));
  }, []);

  // No data fallback
  if (!data || data.length < 4 || visibleData.length === 0) {
    return (
      <View
        style={[
          {
            width,
            height: height + 40,
            justifyContent: 'center',
            alignItems: 'center',
          },
          style,
        ]}>
        <Text style={styles.noData}>No data available</Text>
      </View>
    );
  }

  const lastCandle = visibleData[visibleData.length - 1];
  const firstCandle = visibleData[0];
  const displayPrice = livePrice ?? lastCandle.close;
  const priceChange = displayPrice - firstCandle.open;
  const priceChangePercent = (
    (priceChange / (firstCandle.open || 1)) *
    100
  ).toFixed(2);
  const isBullish = priceChange >= 0;

  return (
    <View style={style}>
      {label && <Text style={styles.label}>{label}</Text>}

      {/* Current Price + Change */}
      <View style={styles.priceRow}>
        <View style={styles.priceLeft}>
          <Text style={styles.currentPrice}>
            {displayPrice >= 1000
              ? displayPrice.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : displayPrice.toFixed(2)}
          </Text>
          <View
            style={[
              styles.changeBadge,
              {
                backgroundColor: isBullish
                  ? 'rgba(38,166,154,0.15)'
                  : 'rgba(239,83,80,0.15)',
              },
            ]}>
            <Text
              style={[
                styles.changeText,
                {color: isBullish ? '#26a69a' : '#ef5350'},
              ]}>
              {isBullish ? '+' : ''}
              {priceChangePercent}%
            </Text>
          </View>
        </View>
        <ZoomControls
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          canZoomIn={zoomLevel < 5}
          canZoomOut={zoomLevel > -3}
        />
      </View>

      {/* OHLC values */}
      <OHLCHeader candle={lastCandle} />

      {showTimeframes && (
        <TimeframeBar
          timeframes={timeframes}
          selected={selectedTF}
          onSelect={handleTFChange}
        />
      )}

      {/* Candlestick Chart */}
      <View style={[styles.chartContainer, {width, height}]}>
        <WagmiCandlestick.Provider data={visibleData}>
          <WagmiCandlestick height={height} width={width}>
            <WagmiCandlestick.Candles
              positiveColor="#26a69a"
              negativeColor="#ef5350"
            />
            {showCrosshair && (
              <WagmiCandlestick.Crosshair>
                <WagmiCandlestick.Tooltip />
              </WagmiCandlestick.Crosshair>
            )}
          </WagmiCandlestick>
        </WagmiCandlestick.Provider>

        {showGrid && <GridOverlay height={height} />}
        {showYLabels && <PriceAxis candles={visibleData} height={height} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    letterSpacing: 1.2,
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  priceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  currentPrice: {
    fontFamily: 'Inter-Bold',
    fontSize: 22,
    color: '#FFFFFF',
  },
  changeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  changeText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
  },
  chartContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#0F1117',
  },
  noData: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
  },
});
