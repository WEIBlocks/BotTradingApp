/**
 * CandlestickChart — Pure Skia renderer, UI-thread gestures.
 *
 * Controls: pinch-zoom (focal-anchored), pan (scrub crosshair / scroll when zoomed),
 *           long-press crosshair, double-tap reset.
 * No wagmi dependency — all drawing on GPU canvas, zero React re-renders during gestures.
 */

import React, {useMemo, useState, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import {
  Canvas,
  Line as SkLine,
  RoundedRect,
  Group,
  Skia,
  Path as SkPath,
} from '@shopify/react-native-skia';
import {
  useSharedValue,
  useDerivedValue,
  runOnJS,
  clamp,
} from 'react-native-reanimated';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OHLC {
  time: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PAD_L   = 4;
const PAD_R   = 54;   // space for Y-axis labels
const PAD_T   = 8;
const PAD_B   = 8;
const MAX_ZOOM = 8;
const BULL    = '#26a69a';
const BEAR    = '#ef5350';

// ─── Realistic OHLC Generator ────────────────────────────────────────────────

export function generateOHLC(prices: number[]): OHLC[] {
  if (prices.length < 4) return [];
  const candleCount = Math.min(Math.max(20, Math.floor(prices.length / 2)), 60);
  const windowSize  = Math.max(1, Math.floor(prices.length / candleCount));
  const candles: OHLC[] = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const totalCandles = Math.ceil(prices.length / windowSize);

  for (let i = 0; i < prices.length; i += windowSize) {
    const slice = prices.slice(i, i + windowSize);
    if (slice.length === 0) continue;
    const candleIdx  = candles.length;
    const date       = new Date(now.getTime() - (totalCandles - candleIdx - 1) * 86400000);
    const midPrice   = slice.reduce((a, b) => a + b, 0) / slice.length;
    const sliceRange = Math.max(...slice) - Math.min(...slice);
    const volatility = Math.max(sliceRange, midPrice * 0.008);
    let open: number, close: number;
    open = candles.length > 0 ? candles[candles.length - 1].close : slice[0];
    const noise = (Math.random() - 0.5) * volatility * 0.6;
    close = slice[slice.length - 1] + noise;
    if (Math.random() < 0.35) { const t = open; open = close; close = t; }
    const upper    = Math.max(open, close);
    const lower    = Math.min(open, close);
    const bodySize = upper - lower || midPrice * 0.003;
    const high = upper + bodySize * (0.2 + Math.random() * 0.8);
    const low  = lower - bodySize * (0.2 + Math.random() * 0.8);
    candles.push({
      time: date.getTime(),
      open:  parseFloat(open.toFixed(2)),
      high:  parseFloat(high.toFixed(2)),
      low:   parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume: Math.round((500 + Math.random() * 4500) * (1 + (bodySize / midPrice) * 50)),
    });
  }
  return candles;
}

function toCandles(ohlc: OHLC[]): Candle[] {
  return ohlc.map(c => {
    const ts = typeof c.time === 'number'
      ? (c.time < 1e12 ? c.time * 1000 : c.time)
      : new Date(c.time as string).getTime();
    return {timestamp: ts, open: c.open, high: c.high, low: c.low, close: c.close};
  });
}

// ─── Timeframe → base visible candle count ───────────────────────────────────

const TF_CANDLE_COUNT: Record<string, number> = {
  '1m': 15, '5m': 20, '15m': 30,
  '1H': 40, '4H': 50, '1D': 60,
  '1W': 80, '1M': 120, '3M': 200, ALL: 9999,
};
const DEFAULT_TIMEFRAMES = ['1H', '4H', '1D', '1W', 'ALL'];

// ─── Worklet helpers ──────────────────────────────────────────────────────────

function wc(v: number, lo: number, hi: number): number {
  'worklet';
  return v < lo ? lo : v > hi ? hi : v;
}

// Build all candle rects + wick lines into Skia paths.
interface CandlePaths {
  bullBody: ReturnType<typeof Skia.Path.Make>;
  bearBody: ReturnType<typeof Skia.Path.Make>;
  bullWick: ReturnType<typeof Skia.Path.Make>;
  bearWick: ReturnType<typeof Skia.Path.Make>;
  crossX:    number;
  crossCloseY: number; // pixel Y of close price — for horizontal crosshair line
  crossHigh:  number;
  crossLow:   number;
  crossOpen:  number;
  crossClose: number;
  crossIsBull: boolean;
}

function buildCandlePaths(
  candles: Candle[],
  chartW: number,
  chartH: number,
  zoom: number,
  panPx: number,
  crossRawX: number,
): CandlePaths {
  'worklet';
  const n = candles.length;
  const empty: CandlePaths = {
    bullBody: Skia.Path.Make(), bearBody: Skia.Path.Make(),
    bullWick: Skia.Path.Make(), bearWick: Skia.Path.Make(),
    crossX: -1, crossCloseY: -1, crossHigh: 0, crossLow: 0, crossOpen: 0, crossClose: 0, crossIsBull: true,
  };
  if (n < 2) return empty;

  const virtualW  = chartW * zoom;
  const candleW   = virtualW / n;
  const bodyW     = wc(candleW * 0.6, 1.5, 18);
  const halfBody  = bodyW / 2;

  // visible range
  const startI = wc(Math.floor(panPx / candleW) - 1, 0, n - 1);
  const endI   = wc(Math.ceil((panPx + chartW) / candleW) + 1, startI, n - 1);

  // Y scale from visible data
  let minV = candles[startI].low, maxV = candles[startI].high;
  for (let i = startI + 1; i <= endI; i++) {
    if (candles[i].low  < minV) minV = candles[i].low;
    if (candles[i].high > maxV) maxV = candles[i].high;
  }
  const rng      = maxV - minV || Math.abs(maxV) * 0.01 || 1;
  const adjMin   = minV - rng * 0.05;
  const adjRange = rng * 1.1;

  const toX = (i: number) => PAD_L + (i + 0.5) * candleW - panPx;
  const toY = (v: number) => PAD_T + chartH - ((v - adjMin) / adjRange) * chartH;

  const bullBody = Skia.Path.Make();
  const bearBody = Skia.Path.Make();
  const bullWick = Skia.Path.Make();
  const bearWick = Skia.Path.Make();

  // Crosshair index
  const crossIdx = crossRawX >= 0
    ? wc(Math.floor((crossRawX - PAD_L + panPx) / candleW), 0, n - 1)
    : -1;

  for (let i = startI; i <= endI; i++) {
    const c    = candles[i];
    const cx   = toX(i);
    const isBull = c.close >= c.open;
    const bodyTop = toY(Math.max(c.open, c.close));
    const bodyBot = toY(Math.min(c.open, c.close));
    const bodyH   = Math.max(bodyBot - bodyTop, 1);
    const wickTop = toY(c.high);
    const wickBot = toY(c.low);

    if (isBull) {
      bullBody.addRect(Skia.XYWHRect(cx - halfBody, bodyTop, bodyW, bodyH));
      bullWick.moveTo(cx, wickTop); bullWick.lineTo(cx, bodyTop);
      bullWick.moveTo(cx, bodyBot); bullWick.lineTo(cx, wickBot);
    } else {
      bearBody.addRect(Skia.XYWHRect(cx - halfBody, bodyTop, bodyW, bodyH));
      bearWick.moveTo(cx, wickTop); bearWick.lineTo(cx, bodyTop);
      bearWick.moveTo(cx, bodyBot); bearWick.lineTo(cx, wickBot);
    }
  }

  let crossX = -1, crossCloseY = -1, crossHigh = 0, crossLow = 0, crossOpen = 0, crossClose = 0, crossIsBull = true;
  if (crossIdx >= 0) {
    const c    = candles[crossIdx];
    crossX      = toX(crossIdx);
    crossCloseY = toY(c.close);
    crossHigh   = c.high;
    crossLow    = c.low;
    crossOpen   = c.open;
    crossClose  = c.close;
    crossIsBull = c.close >= c.open;
  }

  return {bullBody, bearBody, bullWick, bearWick, crossX, crossCloseY, crossHigh, crossLow, crossOpen, crossClose, crossIsBull};
}

// ─── TimeframeBar ─────────────────────────────────────────────────────────────

function TimeframeBar({timeframes = DEFAULT_TIMEFRAMES, selected, onSelect}: {
  timeframes?: string[];
  selected: string;
  onSelect: (tf: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={tfStyles.scrollContent} style={tfStyles.scroll}>
      {timeframes.map(tf => {
        const active = tf === selected;
        return (
          <TouchableOpacity key={tf} activeOpacity={0.7}
            style={[tfStyles.chip, active && tfStyles.chipActive]}
            onPress={() => onSelect(tf)}>
            <Text style={[tfStyles.text, active && tfStyles.textActive]}>{tf}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const tfStyles = StyleSheet.create({
  scroll: {flexGrow: 0, marginBottom: 6},
  scrollContent: {gap: 6, paddingRight: 8},
  chip: {paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)'},
  chipActive: {backgroundColor: '#10B981'},
  text: {fontFamily: 'Inter-SemiBold', fontSize: 12, color: 'rgba(255,255,255,0.35)'},
  textActive: {color: '#FFFFFF'},
});

// ─── CandlestickChart ─────────────────────────────────────────────────────────

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
  livePrice?: number;
}

export default function CandlestickChart({
  data,
  width,
  height    = 300,
  showTimeframes = true,
  timeframes,
  livePrice,
  selectedTimeframe: externalTF,
  onTimeframeChange,
  showGrid  = true,
  showYLabels = true,
  style,
  label,
}: CandlestickChartProps) {

  const chartW = width  - PAD_L - PAD_R;
  const chartH = height - PAD_T - PAD_B;

  const [internalTF, setInternalTF] = useState('1D');
  const selectedTF = externalTF ?? internalTF;

  // ── Shared values ────────────────────────────────────────────────────────
  const sv_zoom        = useSharedValue(1);
  const sv_pan         = useSharedValue(0);
  const sv_cross       = useSharedValue(-1);   // raw touch X, -1 = hidden
  const sv_startZoom   = useSharedValue(1);
  const sv_startPan    = useSharedValue(0);
  const sv_startFocalV = useSharedValue(0);
  const sv_pinching    = useSharedValue(false);

  // ── JS state ─────────────────────────────────────────────────────────────
  const [jsZoom,      setJsZoom]      = useState(1);
  const [jsPan,       setJsPan]       = useState(0);
  const [liveOHLC,    setLiveOHLC]    = useState<{open:number;high:number;low:number;close:number;isBull:boolean} | null>(null);
  const [liveCrossX,  setLiveCrossX]  = useState<number>(-1);
  const [liveCloseY,  setLiveCloseY]  = useState<number>(-1);  // pixel Y of close — for price bubble

  const syncState = useCallback((z: number, p: number) => { setJsZoom(z); setJsPan(p); }, []);
  const syncLive  = useCallback((cx: number, cy: number, o: number, h: number, l: number, c: number, bull: boolean) => {
    setLiveCrossX(cx); setLiveCloseY(cy); setLiveOHLC({open: o, high: h, low: l, close: c, isBull: bull});
  }, []);
  const clearLive = useCallback(() => { setLiveCrossX(-1); setLiveCloseY(-1); setLiveOHLC(null); }, []);
  const reset     = useCallback(() => {
    sv_zoom.value = 1; sv_pan.value = 0; sv_cross.value = -1;
    setJsZoom(1); setJsPan(0); clearLive();
  }, []);

  // ── OHLC data ─────────────────────────────────────────────────────────────
  const allCandles: Candle[] = useMemo(() => {
    if (!data || data.length === 0) return [];
    let ohlc: OHLC[];
    if (typeof data[0] === 'number') { ohlc = generateOHLC(data as number[]); }
    else { ohlc = data as OHLC[]; }
    return toCandles(ohlc);
  }, [data]);

  // ── Derived Skia paths ────────────────────────────────────────────────────
  const candlesRef = useMemo(() => allCandles, [allCandles]);

  const derivedPaths = useDerivedValue(() => {
    if (candlesRef.length < 2) return {
      bullBody: Skia.Path.Make(), bearBody: Skia.Path.Make(),
      bullWick: Skia.Path.Make(), bearWick: Skia.Path.Make(),
      crossX: -1, crossHigh: 0, crossLow: 0, crossOpen: 0, crossClose: 0, crossIsBull: true,
    };
    return buildCandlePaths(candlesRef, chartW, chartH, sv_zoom.value, sv_pan.value, sv_cross.value);
  }, [sv_zoom, sv_pan, sv_cross]);

  const bullBodyPath = useDerivedValue(() => derivedPaths.value.bullBody, [derivedPaths]);
  const bearBodyPath = useDerivedValue(() => derivedPaths.value.bearBody, [derivedPaths]);
  const bullWickPath = useDerivedValue(() => derivedPaths.value.bullWick, [derivedPaths]);
  const bearWickPath = useDerivedValue(() => derivedPaths.value.bearWick, [derivedPaths]);

  const crossX       = useDerivedValue(() => derivedPaths.value.crossX,          [derivedPaths]);
  const crossOpacity = useDerivedValue(() => derivedPaths.value.crossX >= 0 ? 1 : 0, [derivedPaths]);
  const vLine1       = useDerivedValue(() => ({x: crossX.value, y: PAD_T}),          [crossX]);
  const vLine2       = useDerivedValue(() => ({x: crossX.value, y: PAD_T + chartH}), [crossX]);
  // horizontal line tracks close price Y
  const hLineY       = useDerivedValue(() => derivedPaths.value.crossCloseY >= 0 ? derivedPaths.value.crossCloseY : PAD_T, [derivedPaths]);
  const bubbleY      = useDerivedValue(() => hLineY.value - 9,                       [hLineY]);
  const hLine1       = useDerivedValue(() => ({x: PAD_L,           y: hLineY.value}), [hLineY]);
  const hLine2       = useDerivedValue(() => ({x: PAD_L + chartW,  y: hLineY.value}), [hLineY]);

  // ── Y-axis labels ─────────────────────────────────────────────────────────
  const yLabels = useMemo(() => {
    if (!allCandles || allCandles.length < 2) return [];
    const n        = allCandles.length;
    const virtualW = chartW * jsZoom;
    const candleW  = virtualW / n;
    const startI   = Math.max(0, Math.floor(jsPan / candleW) - 1);
    const endI     = Math.min(n - 1, Math.ceil((jsPan + chartW) / candleW) + 1);
    const slice    = allCandles.slice(startI, endI + 1);
    const minV     = Math.min(...slice.map(c => c.low));
    const maxV     = Math.max(...slice.map(c => c.high));
    const rng      = maxV - minV || Math.abs(maxV) * 0.01 || 1;
    const adjMin   = minV - rng * 0.05;
    const adjRange = rng * 1.1;
    return Array.from({length: 5}, (_, i) => ({
      val: adjMin + adjRange - (adjRange * i) / 4,
      y:   PAD_T + (i / 4) * chartH,
    }));
  }, [allCandles, jsZoom, jsPan, chartW, chartH]);

  // ── Gestures ──────────────────────────────────────────────────────────────

  const pinch = Gesture.Pinch()
    .onBegin((e) => {
      'worklet';
      sv_pinching.value    = true;
      sv_startZoom.value   = sv_zoom.value;
      sv_startPan.value    = sv_pan.value;
      sv_startFocalV.value = (e.focalX - PAD_L) + sv_pan.value;
    })
    .onUpdate((e) => {
      'worklet';
      const nz = clamp(sv_startZoom.value * e.scale, 1, MAX_ZOOM);
      sv_zoom.value = nz;
      sv_pan.value  = clamp(sv_startFocalV.value * (nz / sv_startZoom.value) - (e.focalX - PAD_L), 0, chartW * (nz - 1));
    })
    .onFinalize((e) => {
      'worklet';
      const rz  = sv_startZoom.value * e.scale;
      const nz  = rz < 1.08 ? 1 : clamp(rz, 1, MAX_ZOOM);
      const np  = nz === 1 ? 0 : clamp(sv_startFocalV.value * (nz / sv_startZoom.value) - (e.focalX - PAD_L), 0, chartW * (nz - 1));
      sv_zoom.value = nz; sv_pan.value = np; sv_pinching.value = false;
      runOnJS(syncState)(nz, np);
    });

  const panG = Gesture.Pan()
    .minDistance(2).averageTouches(false)
    .onBegin((e) => {
      'worklet';
      sv_startPan.value = sv_pan.value;
      // Show crosshair immediately on touch start
      sv_cross.value = e.x;
      const p = buildCandlePaths(candlesRef, chartW, chartH, sv_zoom.value, sv_pan.value, e.x);
      if (p.crossX >= 0) runOnJS(syncLive)(p.crossX, p.crossCloseY, p.crossOpen, p.crossHigh, p.crossLow, p.crossClose, p.crossIsBull);
    })
    .onUpdate((e) => {
      'worklet';
      if (sv_pinching.value) return;
      if (sv_zoom.value <= 1.02) {
        // Not zoomed: always scrub crosshair
        sv_cross.value = e.x;
        const p = buildCandlePaths(candlesRef, chartW, chartH, sv_zoom.value, sv_pan.value, e.x);
        if (p.crossX >= 0) runOnJS(syncLive)(p.crossX, p.crossCloseY, p.crossOpen, p.crossHigh, p.crossLow, p.crossClose, p.crossIsBull);
        return;
      }
      // Zoomed: pan the chart, also update crosshair position
      const newPan = clamp(sv_startPan.value - e.translationX, 0, chartW * (sv_zoom.value - 1));
      sv_pan.value   = newPan;
      sv_cross.value = e.x;
      const p = buildCandlePaths(candlesRef, chartW, chartH, sv_zoom.value, newPan, e.x);
      if (p.crossX >= 0) runOnJS(syncLive)(p.crossX, p.crossCloseY, p.crossOpen, p.crossHigh, p.crossLow, p.crossClose, p.crossIsBull);
    })
    .onEnd((e) => {
      'worklet';
      if (sv_pinching.value) return;
      if (sv_zoom.value > 1.02) {
        const p = clamp(sv_startPan.value - e.translationX, 0, chartW * (sv_zoom.value - 1));
        sv_pan.value = p;
        runOnJS(syncState)(sv_zoom.value, p);
      }
      sv_cross.value = -1;
      runOnJS(clearLive)();
    })
    .onFinalize(() => { 'worklet'; sv_cross.value = -1; runOnJS(clearLive)(); });

  const longPress = Gesture.LongPress().minDuration(160).maxDistance(9999)
    .onStart((e) => {
      'worklet';
      sv_cross.value = e.x;
      const p = buildCandlePaths(candlesRef, chartW, chartH, sv_zoom.value, sv_pan.value, e.x);
      if (p.crossX >= 0) runOnJS(syncLive)(p.crossX, p.crossCloseY, p.crossOpen, p.crossHigh, p.crossLow, p.crossClose, p.crossIsBull);
    })
    .onEnd(() => { 'worklet'; sv_cross.value = -1; runOnJS(clearLive)(); })
    .onFinalize(() => { 'worklet'; sv_cross.value = -1; runOnJS(clearLive)(); });

  const doubleTap = Gesture.Tap().numberOfTaps(2).maxDuration(300)
    .onEnd(() => { 'worklet'; sv_zoom.value = 1; sv_pan.value = 0; sv_cross.value = -1; runOnJS(reset)(); });

  const composed = Gesture.Simultaneous(pinch, Gesture.Exclusive(doubleTap, panG), longPress);

  // ── Header values ─────────────────────────────────────────────────────────
  const headerCandle = useMemo(() => {
    if (allCandles.length === 0) return null;
    return liveOHLC ?? (() => {
      const last  = allCandles[allCandles.length - 1];
      const first = allCandles[0];
      return {open: first.open, high: last.high, low: last.low, close: last.close, isBull: last.close >= first.open};
    })();
  }, [allCandles, liveOHLC]);

  // ── Early return ──────────────────────────────────────────────────────────
  if (!data || data.length < 4 || allCandles.length === 0) {
    return (
      <View style={[{width, height: height + 40, justifyContent: 'center', alignItems: 'center'}, style]}>
        <Text style={s.noData}>No data available</Text>
      </View>
    );
  }

  const lastCandle   = allCandles[allCandles.length - 1];
  const firstCandle  = allCandles[0];
  // When scrubbing, show that candle's close; otherwise show live/last price
  const displayPrice = liveOHLC ? liveOHLC.close : (livePrice ?? lastCandle.close);
  const priceBase    = liveOHLC ? liveOHLC.open : firstCandle.open;
  const priceChange  = displayPrice - priceBase;
  const pctStr       = ((priceChange / (priceBase || 1)) * 100).toFixed(2);
  const isBullish    = priceChange >= 0;
  const fmt          = (v: number) => v >= 1000 ? v.toFixed(0) : v.toFixed(2);

  return (
    <View style={style}>
      {label && <Text style={s.label}>{label}</Text>}

      {/* Price row */}
      <View style={s.priceRow}>
        <Text style={s.currentPrice}>
          {displayPrice >= 1000
            ? displayPrice.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})
            : displayPrice.toFixed(2)}
        </Text>
        <View style={[s.changeBadge, {backgroundColor: isBullish ? 'rgba(38,166,154,0.15)' : 'rgba(239,83,80,0.15)'}]}>
          <Text style={[s.changeText, {color: isBullish ? BULL : BEAR}]}>
            {isBullish ? '+' : ''}{pctStr}%
          </Text>
        </View>
      </View>

      {/* OHLC row */}
      {headerCandle && (
        <View style={s.ohlcRow}>
          {[['O', headerCandle.open], ['H', headerCandle.high], ['L', headerCandle.low], ['C', headerCandle.close]].map(([lbl, val]) => (
            <Text key={lbl as string} style={s.ohlcItem}>
              <Text style={s.ohlcLbl}>{lbl} </Text>
              <Text style={[s.ohlcVal, {color: headerCandle.isBull ? BULL : BEAR}]}>{fmt(val as number)}</Text>
            </Text>
          ))}
        </View>
      )}

      {showTimeframes && (
        <TimeframeBar timeframes={timeframes} selected={selectedTF}
          onSelect={tf => { if (onTimeframeChange) onTimeframeChange(tf); else setInternalTF(tf); }} />
      )}

      {/* Chart canvas */}
      <GestureDetector gesture={composed}>
        <View style={[s.chartContainer, {width, height}]}>
          <Canvas style={{position: 'absolute', top: 0, left: 0, width, height}}>

            {/* Grid lines */}
            {showGrid && Array.from({length: 5}, (_, i) => (
              <SkLine
                key={i}
                p1={{x: PAD_L, y: PAD_T + (i / 4) * chartH}}
                p2={{x: PAD_L + chartW, y: PAD_T + (i / 4) * chartH}}
                color="rgba(255,255,255,0.05)"
                strokeWidth={1}
              />
            ))}

            {/* Candle bodies + wicks clipped to chart area */}
            <Group clip={{x: PAD_L, y: 0, width: chartW, height}}>
              <SkPath path={bullWickPath} style="stroke" strokeWidth={1.5} color={BULL} />
              <SkPath path={bearWickPath} style="stroke" strokeWidth={1.5} color={BEAR} />
              <SkPath path={bullBodyPath} style="fill" color={BULL} />
              <SkPath path={bearBodyPath} style="fill" color={BEAR} />
            </Group>

            {/* Crosshair */}
            <Group opacity={crossOpacity}>
              <SkLine p1={vLine1} p2={vLine2} color="rgba(255,255,255,0.35)" strokeWidth={1} />
              <SkLine p1={hLine1} p2={hLine2} color="rgba(255,255,255,0.15)" strokeWidth={1} />
              {/* Price bubble background rect on Y-axis */}
              <RoundedRect
                x={PAD_L + chartW + 3} y={bubbleY}
                width={PAD_R - 5} height={18} r={4}
                color="rgba(255,255,255,0.15)"
              />
            </Group>
          </Canvas>

          {/* Y-axis labels */}
          {showYLabels && yLabels.map((yl, i) => (
            <Text key={i} style={[s.yLabel, {top: yl.y - 6}]}>
              {yl.val >= 1000 ? yl.val.toFixed(0) : yl.val.toFixed(2)}
            </Text>
          ))}

          {/* Price bubble text — overlaid as RN Text so it's actually visible */}
          {liveOHLC && liveCloseY >= 0 && (
            <View style={[s.priceBubble, {top: liveCloseY - 9}]}>
              <Text style={s.priceBubbleTxt} numberOfLines={1}>
                {fmt(liveOHLC.close)}
              </Text>
            </View>
          )}

          {/* Zoom indicator */}
          {jsZoom > 1.05 && (
            <View style={s.zoomPill}>
              <Text style={s.zoomTxt}>{jsZoom.toFixed(1)}×</Text>
            </View>
          )}

          {/* Crosshair OHLC tooltip — floats near vertical line */}
          {liveOHLC && liveCrossX >= 0 && (
            <View style={[s.crossTooltip, {left: Math.min(liveCrossX + 8, width - PAD_R - 90)}]}>
              {(['O', 'H', 'L', 'C'] as const).map((k, idx) => {
                const vals = [liveOHLC.open, liveOHLC.high, liveOHLC.low, liveOHLC.close];
                return (
                  <View key={k} style={s.crossTooltipRow}>
                    <Text style={s.crossTooltipLbl}>{k}</Text>
                    <Text style={[s.crossTooltipVal, {color: liveOHLC.isBull ? BULL : BEAR}]}>{fmt(vals[idx])}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </GestureDetector>
    </View>
  );
}

const s = StyleSheet.create({
  label: {
    fontFamily: 'Inter-SemiBold', fontSize: 11, letterSpacing: 1.2,
    color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', marginBottom: 8,
  },
  priceRow: {flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4},
  currentPrice: {fontFamily: 'Inter-Bold', fontSize: 22, color: '#FFFFFF'},
  changeBadge: {paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6},
  changeText:  {fontFamily: 'Inter-SemiBold', fontSize: 12},
  ohlcRow: {flexDirection: 'row', gap: 12, paddingBottom: 6, paddingHorizontal: 2},
  ohlcItem: {},
  ohlcLbl: {fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.35)'},
  ohlcVal: {fontFamily: 'Inter-SemiBold', fontSize: 11},
  chartContainer: {borderRadius: 12, overflow: 'hidden', backgroundColor: '#0F1117'},
  noData: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.3)'},
  yLabel: {
    position: 'absolute', right: 4, width: PAD_R - 6, textAlign: 'right',
    fontFamily: 'Inter-Regular', fontSize: 8, color: 'rgba(255,255,255,0.22)',
  },
  zoomPill: {
    position: 'absolute', top: 4, right: 4,
    backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  zoomTxt: {fontFamily: 'Inter-SemiBold', fontSize: 9, color: 'rgba(255,255,255,0.4)'},
  priceBubble: {
    position: 'absolute',
    right: 3,
    width: PAD_R - 5,
    height: 18,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  priceBubbleTxt: {
    fontFamily: 'Inter-SemiBold', fontSize: 8,
    color: '#FFFFFF', textAlign: 'center',
  },
  crossTooltip: {
    position: 'absolute', top: PAD_T + 4,
    backgroundColor: 'rgba(15,17,23,0.92)', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 6, gap: 3,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  crossTooltipRow: {flexDirection: 'row', alignItems: 'center', gap: 6},
  crossTooltipLbl: {fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.4)', width: 12},
  crossTooltipVal: {fontFamily: 'Inter-SemiBold', fontSize: 10},
});
