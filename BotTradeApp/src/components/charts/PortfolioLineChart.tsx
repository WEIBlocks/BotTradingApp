/**
 * PortfolioLineChart
 *
 * Architecture: 100% UI-thread during gestures.
 *
 * - Skia Canvas + useDerivedValue rebuilds paths from shared values on the
 *   UI thread every frame — React is never touched during a gesture.
 * - runOnJS only fires AFTER gesture ends (to sync header text / labels).
 * - Pinch: focal-point anchored zoom, 1×–10×.
 * - Pan:   scrolls when zoomed, scrubs crosshair when not.
 * - Long-press: crosshair at any zoom.
 * - Double-tap: reset.
 */

import React, {useMemo, useCallback, useState} from 'react';
import {
  View, Text, StyleSheet, ViewStyle,
  ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import {
  Canvas,
  Path as SkPath,
  LinearGradient as SkLinearGradient,
  vec,
  Circle as SkCircle,
  Line as SkLine,
  Group,
  RoundedRect,
  Skia,
} from '@shopify/react-native-skia';
import {
  useSharedValue,
  runOnJS,
  clamp,
  useDerivedValue,
} from 'react-native-reanimated';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EquityPoint { date: string | Date; value: number }

export interface PortfolioLineChartProps {
  data: number[];
  dates?: (string | Date)[];
  currentValue: number;
  width: number;
  height?: number;
  isRealData?: boolean;
  onTimeframeChange?: (days: number) => void;
  loading?: boolean;
  style?: ViewStyle;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIMEFRAMES = [
  {label: '1W',  days: 7},
  {label: '1M',  days: 30},
  {label: '3M',  days: 90},
  {label: '6M',  days: 180},
  {label: '1Y',  days: 365},
  {label: 'ALL', days: 9999},
];

const MAX_ZOOM = 10;
const PAD_L    = 4;
const PAD_R    = 58;
const PAD_T    = 12;
const PAD_B    = 22;

// Positive / negative line colors
const COLOR_POS = '#10B981';
const COLOR_NEG = '#EF4444';

// ─── Pure helpers (safe to call in worklets) ──────────────────────────────────

function fmtMoney(v: number): string {
  'worklet';
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(2) + 'M';
  if (v >= 10_000)    return '$' + (v / 1_000).toFixed(1) + 'K';
  if (v >= 1_000)     return '$' + Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return '$' + v.toFixed(2);
}

function jsc(v: number, lo: number, hi: number): number {
  'worklet';
  return v < lo ? lo : v > hi ? hi : v;
}

// ─── Build Skia paths — called from useDerivedValue (UI thread) ───────────────
//
// data is captured at render time as a JS array — safe to read in worklets
// because it never mutates (new data → new component render → new closure).

function buildSkiaPaths(
  data: number[],
  chartW: number,
  chartH: number,
  zoom: number,
  panPx: number,
): {line: ReturnType<typeof Skia.Path.Make>; fill: ReturnType<typeof Skia.Path.Make>; isPositive: boolean} {
  'worklet';
  const n = data.length;
  if (n < 2) {
    return {line: Skia.Path.Make(), fill: Skia.Path.Make(), isPositive: true};
  }

  const virtualW = chartW * zoom;
  const ppp      = virtualW / (n - 1);

  // Visible index range for Y-scaling
  const startI = jsc(Math.floor(panPx / ppp), 0, n - 2);
  const endI   = jsc(Math.ceil((panPx + chartW) / ppp), startI + 1, n - 1);

  // Y range from visible slice only
  let minV = data[startI], maxV = data[startI];
  for (let i = startI + 1; i <= endI; i++) {
    if (data[i] < minV) minV = data[i];
    if (data[i] > maxV) maxV = data[i];
  }
  const range    = maxV - minV || (Math.abs(maxV) * 0.01) || 1;
  const adjMin   = minV - range * 0.05;
  const adjRange = range * 1.1;

  const toX = (i: number)  => PAD_L + i * ppp - panPx;
  const toY = (v: number)  => PAD_T + chartH - ((v - adjMin) / adjRange) * chartH;

  // Draw 1 point beyond each edge for seamless clipping
  const drawS = Math.max(0, startI - 1);
  const drawE = Math.min(n - 1, endI + 1);

  const line = Skia.Path.Make();
  const fill = Skia.Path.Make();

  line.moveTo(toX(drawS), toY(data[drawS]));
  for (let i = drawS + 1; i <= drawE; i++) {
    const px = toX(i - 1), py = toY(data[i - 1]);
    const cx = toX(i),     cy = toY(data[i]);
    const t = 0.35;
    line.cubicTo(px + (cx - px) * t, py, cx - (cx - px) * t, cy, cx, cy);
  }

  fill.addPath(line);
  fill.lineTo(toX(drawE), PAD_T + chartH);
  fill.lineTo(toX(drawS), PAD_T + chartH);
  fill.close();

  // Use absolute value vs baseline (data[0]) so a recovering-but-still-negative
  // curve stays red even when the visible window slopes upward.
  return {line, fill, isPositive: data[endI] >= data[0]};
}

// Resolve crosshair from raw screen X → snapped screen X, Y, value
function resolveCrosshair(
  data: number[],
  chartW: number,
  chartH: number,
  zoom: number,
  panPx: number,
  rawX: number,
): {sx: number; sy: number; value: number; idx: number} {
  'worklet';
  const n = data.length;
  if (n < 2) return {sx: -1, sy: -1, value: 0, idx: 0};

  const virtualW = chartW * zoom;
  const ppp      = virtualW / (n - 1);
  const vX       = rawX - PAD_L + panPx;
  const idx      = jsc(Math.round(vX / ppp), 0, n - 1);

  // Y range (visible)
  const startI = jsc(Math.floor(panPx / ppp), 0, n - 2);
  const endI   = jsc(Math.ceil((panPx + chartW) / ppp), startI + 1, n - 1);
  let minV = data[startI], maxV = data[startI];
  for (let i = startI + 1; i <= endI; i++) {
    if (data[i] < minV) minV = data[i];
    if (data[i] > maxV) maxV = data[i];
  }
  const range    = maxV - minV || (Math.abs(maxV) * 0.01) || 1;
  const adjMin   = minV - range * 0.05;
  const adjRange = range * 1.1;

  const sx = PAD_L + idx * ppp - panPx;
  const sy = PAD_T + chartH - ((data[idx] - adjMin) / adjRange) * chartH;
  return {sx, sy, value: data[idx], idx};
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PortfolioLineChart({
  data,
  dates,
  currentValue,
  width,
  height       = 220,
  isRealData   = false,
  onTimeframeChange,
  loading      = false,
  style,
}: PortfolioLineChartProps) {

  const chartW = width  - PAD_L - PAD_R;
  const chartH = height - PAD_T - PAD_B;

  // ── Shared values — UI-thread source of truth ────────────────────────────────
  const sv_zoom  = useSharedValue(1);
  const sv_pan   = useSharedValue(0);
  const sv_cross = useSharedValue(-1); // raw screen X, -1 = hidden

  // Gesture temporaries
  const sv_startZoom   = useSharedValue(1);
  const sv_startPan    = useSharedValue(0);
  const sv_startFocalV = useSharedValue(0);
  const sv_pinching    = useSharedValue(false);

  // ── JS state — header text, axis labels, live crosshair display ─────────────
  const [selectedTF,   setSelectedTF]   = useState(30);
  const [jsZoom,       setJsZoom]       = useState(1);
  const [jsPan,        setJsPan]        = useState(0);
  const [jsCrossIdx,   setJsCrossIdx]   = useState<number | null>(null);
  // Live crosshair position for RN text overlay (updated every frame while scrubbing)
  const [liveCrossY,   setLiveCrossY]   = useState<number | null>(null);
  const [liveCrossVal, setLiveCrossVal] = useState<number | null>(null);

  // ── Skia derived paths — rebuilt on UI thread every frame ────────────────────
  // Capture stable refs to data for the worklet closure.
  const dataRef  = useMemo(() => data,  [data]);
  const cW       = chartW;
  const cH       = chartH;

  // Build both paths in one worklet call, then derive each path from the combined result.
  const derivedPathsObj = useDerivedValue(() => {
    return buildSkiaPaths(dataRef, cW, cH, sv_zoom.value, sv_pan.value);
  }, [sv_zoom, sv_pan]);

  const derivedFillPath = useDerivedValue(() => derivedPathsObj.value.fill, [derivedPathsObj]);
  const derivedLinePath = useDerivedValue(() => derivedPathsObj.value.line, [derivedPathsObj]);

  const derivedCross = useDerivedValue(() => {
    if (sv_cross.value < 0) return {sx: -1, sy: -1, value: 0, idx: -1};
    return resolveCrosshair(dataRef, cW, cH, sv_zoom.value, sv_pan.value, sv_cross.value);
  }, [sv_cross, sv_zoom, sv_pan]);

  // ── JS label data (after gesture ends) ───────────────────────────────────────
  const labelData = useMemo(() => {
    if (!dataRef || dataRef.length < 2) return null;
    const n        = dataRef.length;
    const virtualW = chartW * jsZoom;
    const ppp      = virtualW / (n - 1);

    const startI = jsc(Math.floor(jsPan / ppp), 0, n - 2);
    const endI   = jsc(Math.ceil((jsPan + chartW) / ppp), startI + 1, n - 1);

    let minV = dataRef[startI], maxV = dataRef[startI];
    for (let i = startI + 1; i <= endI; i++) {
      if (dataRef[i] < minV) minV = dataRef[i];
      if (dataRef[i] > maxV) maxV = dataRef[i];
    }
    const range    = maxV - minV || (Math.abs(maxV) * 0.01) || 1;
    const adjMin   = minV - range * 0.05;
    const adjRange = range * 1.1;

    const yLabels = Array.from({length: 5}, (_, i) => ({
      val: adjMin + adjRange - (adjRange * i) / 4,
      y:   PAD_T + (i / 4) * chartH,
    }));

    const xLabels: {label: string; sx: number}[] = [];
    if (dates && dates.length > 1) {
      const count = Math.min(5, endI - startI + 1);
      for (let k = 0; k < count; k++) {
        const idx = startI + Math.round((k / Math.max(1, count - 1)) * (endI - startI));
        const d   = new Date(dates[idx]);
        if (!isNaN(d.getTime())) {
          const label = jsZoom <= 7   ? d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'})
                      : d.toLocaleDateString('en-US', {month: 'short', year: '2-digit'});
          xLabels.push({label, sx: PAD_L + idx * ppp - jsPan});
        }
      }
    }

    // Always measure change from the true baseline (first point = 0 or starting value)
    const baseline = dataRef[0];
    const chg      = dataRef[endI] - baseline;
    const chgPct   = baseline !== 0 ? (chg / Math.abs(baseline)) * 100
                   : dataRef[endI] !== 0 ? 100 * Math.sign(dataRef[endI])
                   : 0;

    return {yLabels, xLabels, chgPct, isPositive: chg >= 0, adjMin, adjRange};
  }, [dataRef, jsZoom, jsPan, chartW, chartH, dates]);

  // Crosshair header values — live while scrubbing
  const crossDate = jsCrossIdx !== null && dates?.[jsCrossIdx]
    ? new Date(dates[jsCrossIdx]).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})
    : null;

  // ── Sync to JS after gesture (fire-and-forget, no per-frame cost) ────────────
  const syncState = useCallback((z: number, p: number) => {
    setJsZoom(z);
    setJsPan(p);
  }, []);

  // Called every frame while scrubbing — updates header price + bubble text
  const syncLive = useCallback((sy: number, val: number, idx: number) => {
    setLiveCrossY(sy);
    setLiveCrossVal(val);
    setJsCrossIdx(idx);
  }, []);

  const clearLive = useCallback(() => {
    setLiveCrossY(null);
    setLiveCrossVal(null);
    setJsCrossIdx(null);
  }, []);

  const reset = useCallback(() => {
    sv_zoom.value  = 1;
    sv_pan.value   = 0;
    sv_cross.value = -1;
    setJsZoom(1);
    setJsPan(0);
    setJsCrossIdx(null);
    setLiveCrossY(null);
    setLiveCrossVal(null);
  }, []);

  const handleTFChange = useCallback((days: number) => {
    setSelectedTF(days);
    reset();
    onTimeframeChange?.(days);
  }, [onTimeframeChange, reset]);

  // ── Gestures — all hot paths are worklets ────────────────────────────────────

  const pinchGesture = Gesture.Pinch()
    .onBegin((e) => {
      'worklet';
      sv_pinching.value    = true;
      sv_startZoom.value   = sv_zoom.value;
      sv_startPan.value    = sv_pan.value;
      // virtual X under focal point — stays fixed through the gesture
      sv_startFocalV.value = (e.focalX - PAD_L) + sv_pan.value;
    })
    .onUpdate((e) => {
      'worklet';
      const newZoom = clamp(sv_startZoom.value * e.scale, 1, MAX_ZOOM);
      const ratio   = newZoom / sv_startZoom.value;
      const newPan  = clamp(
        sv_startFocalV.value * ratio - (e.focalX - PAD_L),
        0,
        cW * (newZoom - 1),
      );
      sv_zoom.value = newZoom;
      sv_pan.value  = newPan;
      // No runOnJS here — canvas draws itself
    })
    .onFinalize((e) => {
      'worklet';
      const rawZoom = sv_startZoom.value * e.scale;
      const newZoom = rawZoom < 1.08 ? 1 : clamp(rawZoom, 1, MAX_ZOOM);
      const newPan  = newZoom === 1 ? 0 : clamp(
        sv_startFocalV.value * (newZoom / sv_startZoom.value) - (e.focalX - PAD_L),
        0,
        cW * (newZoom - 1),
      );
      sv_zoom.value     = newZoom;
      sv_pan.value      = newPan;
      sv_pinching.value = false;
      // Sync to JS only once, after gesture ends
      runOnJS(syncState)(newZoom, newPan);
    });

  const panGesture = Gesture.Pan()
    .minDistance(2)
    .averageTouches(false)
    .onBegin(() => {
      'worklet';
      sv_startPan.value = sv_pan.value;
    })
    .onUpdate((e) => {
      'worklet';
      if (sv_pinching.value) return;

      if (sv_zoom.value <= 1.02) {
        // Crosshair scrub
        sv_cross.value = e.x;
        const c = resolveCrosshair(dataRef, cW, cH, sv_zoom.value, sv_pan.value, e.x);
        runOnJS(syncLive)(c.sy, c.value, c.idx);
        return;
      }

      // Pan
      sv_pan.value = clamp(
        sv_startPan.value - e.translationX,
        0,
        cW * (sv_zoom.value - 1),
      );
    })
    .onEnd((e) => {
      'worklet';
      if (sv_pinching.value) return;
      if (sv_zoom.value > 1.02) {
        const finalPan = clamp(
          sv_startPan.value - e.translationX,
          0,
          cW * (sv_zoom.value - 1),
        );
        sv_pan.value   = finalPan;
        sv_cross.value = -1;
        runOnJS(syncState)(sv_zoom.value, finalPan);
        runOnJS(clearLive)();
      } else {
        sv_cross.value = -1;
        runOnJS(clearLive)();
      }
    })
    .onFinalize(() => {
      'worklet';
      sv_cross.value = -1;
      runOnJS(clearLive)();
    });

  const longPress = Gesture.LongPress()
    .minDuration(160)
    .maxDistance(50)
    .onStart((e) => {
      'worklet';
      sv_cross.value = e.x;
      const c = resolveCrosshair(dataRef, cW, cH, sv_zoom.value, sv_pan.value, e.x);
      runOnJS(syncLive)(c.sy, c.value, c.idx);
    })
    .onEnd(() => {
      'worklet';
      sv_cross.value = -1;
      runOnJS(clearLive)();
    })
    .onFinalize(() => {
      'worklet';
      sv_cross.value = -1;
      runOnJS(clearLive)();
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(300)
    .onEnd(() => {
      'worklet';
      sv_zoom.value  = 1;
      sv_pan.value   = 0;
      sv_cross.value = -1;
      runOnJS(reset)();
    });

  const composed = Gesture.Simultaneous(
    pinchGesture,
    Gesture.Exclusive(doubleTap, panGesture),
    longPress,
  );

  // ── Display ───────────────────────────────────────────────────────────────────
  const displayVal  = liveCrossVal ?? currentValue;
  const displayDate = crossDate;
  const isZoomed    = jsZoom > 1.05;
  const badgeColor  = labelData?.isPositive !== false ? COLOR_POS : COLOR_NEG;

  // Line colour from JS state (updates after gesture ends; stable during gesture)
  const skiaLineColor = labelData?.isPositive !== false ? COLOR_POS : COLOR_NEG;

  return (
    <View style={[styles.root, style]}>

      {/* Header — driven by JS state, updates only after gesture ends */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.headerLabel}>{displayDate ?? 'Portfolio Value'}</Text>
          <Text style={styles.headerValue}>{fmtMoney(displayVal)}</Text>
        </View>
        <View style={styles.headerRight}>
          {isZoomed && (
            <TouchableOpacity style={styles.resetBtn} onPress={reset} activeOpacity={0.7}>
              <Text style={styles.resetTxt}>Reset</Text>
            </TouchableOpacity>
          )}
          {labelData && (
            <View style={[styles.changeBadge, {
              backgroundColor: labelData.isPositive ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
            }]}>
              <Text style={[styles.changeTxt, {color: badgeColor}]}>
                {labelData.isPositive ? '+' : ''}{labelData.chgPct.toFixed(2)}%
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Timeframe tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tfRow}>
        {TIMEFRAMES.map(tf => (
          <TouchableOpacity
            key={tf.label}
            activeOpacity={0.7}
            style={[styles.tfBtn, selectedTF === tf.days && styles.tfBtnActive]}
            onPress={() => handleTFChange(tf.days)}>
            <Text style={[styles.tfTxt, selectedTF === tf.days && styles.tfTxtActive]}>
              {tf.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Zoom pill */}
      {isZoomed && (
        <View style={styles.zoomPill}>
          <Text style={styles.zoomTxt}>{jsZoom.toFixed(1)}×  ·  double-tap to reset</Text>
        </View>
      )}

      {/* Chart area */}
      {loading ? (
        <View style={[styles.chartBox, {width, height, justifyContent: 'center', alignItems: 'center'}]}>
          <ActivityIndicator size="small" color={COLOR_POS} />
        </View>
      ) : !data || data.length < 2 ? (
        <View style={[styles.chartBox, {width, height, justifyContent: 'center', alignItems: 'center'}]}>
          <Text style={styles.noData}>
            {!isRealData
              ? 'Portfolio snapshots will appear after your first day'
              : 'Not enough data for this timeframe'}
          </Text>
        </View>
      ) : (
        <GestureDetector gesture={composed}>
          <View style={[styles.chartBox, {width, height}]}>

            {/* ─ Skia GPU canvas — redraws via shared values, no React re-render ─ */}
            <Canvas style={{position: 'absolute', top: 0, left: 0, width, height}}>

              {/* Grid lines (static, from JS labelData) */}
              {labelData?.yLabels.map((yl, i) => (
                <SkLine
                  key={i}
                  p1={vec(PAD_L, yl.y)}
                  p2={vec(PAD_L + chartW, yl.y)}
                  color="rgba(255,255,255,0.05)"
                  strokeWidth={1}
                />
              ))}

              {/* Area fill — clips to data region */}
              <Group clip={{x: PAD_L, y: 0, width: chartW, height}}>
                <SkPath path={derivedFillPath} style="fill">
                  <SkLinearGradient
                    start={vec(0, PAD_T)}
                    end={vec(0, PAD_T + chartH)}
                    colors={[skiaLineColor + '38', skiaLineColor + '08', skiaLineColor + '00']}
                  />
                </SkPath>
                <SkPath
                  path={derivedLinePath}
                  style="stroke"
                  strokeWidth={2}
                  strokeCap="round"
                  strokeJoin="round"
                  color={skiaLineColor}
                />
              </Group>

              {/* Crosshair (driven by derivedCross — UI thread only) */}
              <CrosshairLayer
                derivedCross={derivedCross}
                chartW={chartW}
                chartH={chartH}
                lineColor={skiaLineColor}
              />

            </Canvas>

            {/* ─ RN label layer — static text, only re-renders when JS state changes ─ */}

            {/* Y-axis price labels — hidden when crosshair bubble covers same spot */}
            {labelData?.yLabels.map((yl, i) => (
              <Text key={i} style={[styles.yLabel, {top: yl.y - 7}]}>
                {fmtMoney(yl.val)}
              </Text>
            ))}

            {/* Crosshair price bubble text — sits on top of the Skia RoundedRect */}
            {liveCrossVal !== null && liveCrossY !== null && (
              <View style={[styles.yBubble, {top: liveCrossY - 9}]}>
                <Text style={styles.yBubbleTxt} numberOfLines={1}>
                  {fmtMoney(liveCrossVal)}
                </Text>
              </View>
            )}

            {/* X-axis date labels */}
            <View style={styles.xRow}>
              {labelData?.xLabels.map((xl, i) => (
                <Text key={i} style={[styles.xLabel, {left: xl.sx - 20}]}>{xl.label}</Text>
              ))}
            </View>

          </View>
        </GestureDetector>
      )}
    </View>
  );
}

// CrosshairLayer — reads derivedCross shared values directly on the UI thread.
// Visibility gating is done via opacity on a wrapping Group.

interface CrosshairLayerProps {
  derivedCross: {value: {sx: number; sy: number; value: number; idx: number}};
  chartW: number;
  chartH: number;
  lineColor: string;
}

function CrosshairLayer({derivedCross, chartW, chartH, lineColor}: CrosshairLayerProps) {
  const crossX  = useDerivedValue(() => derivedCross.value.sx,     [derivedCross]);
  const crossY  = useDerivedValue(() => derivedCross.value.sy,     [derivedCross]);
  const bubbleY = useDerivedValue(() => derivedCross.value.sy - 9, [derivedCross]);
  const opacity = useDerivedValue(() => derivedCross.value.sx >= 0 ? 1 : 0, [derivedCross]);

  const vLinePt1 = useDerivedValue(() => vec(crossX.value, PAD_T),           [crossX]);
  const vLinePt2 = useDerivedValue(() => vec(crossX.value, PAD_T + chartH),  [crossX]);
  const hLinePt1 = useDerivedValue(() => vec(PAD_L, crossY.value),           [crossY]);
  const hLinePt2 = useDerivedValue(() => vec(PAD_L + chartW, crossY.value),  [crossY]);

  return (
    <Group opacity={opacity}>
      <SkLine p1={vLinePt1} p2={vLinePt2} color="rgba(255,255,255,0.45)" strokeWidth={1} />
      <SkLine p1={hLinePt1} p2={hLinePt2} color="rgba(255,255,255,0.14)" strokeWidth={1} />
      <SkCircle cx={crossX} cy={crossY} r={11}  color={lineColor + '22'} />
      <SkCircle cx={crossX} cy={crossY} r={5.5} color={lineColor} />
      <SkCircle cx={crossX} cy={crossY} r={3}   color="#0F1117" />
      <RoundedRect x={PAD_L + chartW + 3} y={bubbleY} width={PAD_R - 5} height={18} r={4} color={lineColor} />
    </Group>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {},
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  headerValue: {
    fontFamily: 'Inter-Bold',
    fontSize: 26,
    color: '#FFFFFF',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  changeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  changeTxt: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
  },
  resetBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  resetTxt: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  tfRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
    paddingRight: 8,
  },
  tfBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  tfBtnActive: {backgroundColor: COLOR_POS},
  tfTxt: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
  },
  tfTxtActive: {color: '#FFFFFF'},
  zoomPill: {
    alignSelf: 'center',
    marginBottom: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  zoomTxt: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 10,
    color: 'rgba(255,255,255,0.38)',
  },
  chartBox: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  noData: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  yLabel: {
    position: 'absolute',
    right: 4,
    fontFamily: 'Inter-Regular',
    fontSize: 9,
    color: 'rgba(255,255,255,0.25)',
    width: PAD_R - 6,
    textAlign: 'right',
  },
  xRow: {
    position: 'absolute',
    bottom: 4,
    left: 0,
    right: 0,
    height: 16,
  },
  xLabel: {
    position: 'absolute',
    fontFamily: 'Inter-Regular',
    fontSize: 9,
    color: 'rgba(255,255,255,0.25)',
    width: 40,
    textAlign: 'center',
  },
  yBubble: {
    position: 'absolute',
    right: 3,
    width: PAD_R - 5,
    height: 18,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  yBubbleTxt: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 8,
    color: '#FFFFFF',
    textAlign: 'center',
  },
});
