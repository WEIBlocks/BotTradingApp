/**
 * EquityChart — Skia-powered with full gesture controls.
 * Used on BotDetailsScreen for bot equity curve.
 * Controls: pinch-zoom, pan, long-press crosshair, double-tap reset.
 */

import React, {useMemo, useCallback, useState} from 'react';
import {View, Text, StyleSheet, ViewStyle} from 'react-native';
import {
  Canvas,
  Path as SkPath,
  LinearGradient as SkLinearGradient,
  Circle as SkCircle,
  Line as SkLine,
  Group,
  RoundedRect,
  vec,
  Skia,
} from '@shopify/react-native-skia';
import {
  useSharedValue,
  useDerivedValue,
  runOnJS,
  clamp,
} from 'react-native-reanimated';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';

interface EquityChartProps {
  data: number[];
  width: number;
  height?: number;
  color?: string;
  style?: ViewStyle;
}

const PAD_L  = 4;
const PAD_R  = 52;
const PAD_T  = 8;
const PAD_B  = 8;
const MAX_ZOOM = 8;

function wc(v: number, lo: number, hi: number): number {
  'worklet';
  return v < lo ? lo : v > hi ? hi : v;
}

function fmtV(v: number): string {
  'worklet';
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(2) + 'M';
  if (v >= 10_000)    return '$' + (v / 1_000).toFixed(1) + 'K';
  if (v >= 1_000)     return '$' + Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return '$' + v.toFixed(2);
}

function buildPaths(
  data: number[],
  chartW: number,
  chartH: number,
  zoom: number,
  panPx: number,
): {line: ReturnType<typeof Skia.Path.Make>; fill: ReturnType<typeof Skia.Path.Make>} {
  'worklet';
  const n = data.length;
  if (n < 2) return {line: Skia.Path.Make(), fill: Skia.Path.Make()};

  const virtualW = chartW * zoom;
  const ppp      = virtualW / (n - 1);

  const startI = wc(Math.floor(panPx / ppp), 0, n - 2);
  const endI   = wc(Math.ceil((panPx + chartW) / ppp), startI + 1, n - 1);

  let minV = data[startI], maxV = data[startI];
  for (let i = startI + 1; i <= endI; i++) {
    if (data[i] < minV) minV = data[i];
    if (data[i] > maxV) maxV = data[i];
  }
  const range    = maxV - minV || Math.abs(maxV) * 0.01 || 1;
  const adjMin   = minV - range * 0.05;
  const adjRange = range * 1.1;

  const toX = (i: number) => PAD_L + i * ppp - panPx;
  const toY = (v: number) => PAD_T + chartH - ((v - adjMin) / adjRange) * chartH;

  const drawS = Math.max(0, startI - 1);
  const drawE = Math.min(n - 1, endI + 1);

  const line = Skia.Path.Make();
  line.moveTo(toX(drawS), toY(data[drawS]));
  for (let i = drawS + 1; i <= drawE; i++) {
    const px = toX(i - 1), py = toY(data[i - 1]);
    const cx = toX(i),     cy = toY(data[i]);
    const t  = 0.35;
    line.cubicTo(px + (cx - px) * t, py, cx - (cx - px) * t, cy, cx, cy);
  }

  const fill = Skia.Path.Make();
  fill.addPath(line);
  fill.lineTo(toX(drawE), PAD_T + chartH);
  fill.lineTo(toX(drawS), PAD_T + chartH);
  fill.close();

  return {line, fill};
}

function resolveCross(
  data: number[],
  chartW: number,
  chartH: number,
  zoom: number,
  panPx: number,
  rawX: number,
): {sx: number; sy: number; value: number; idx: number} {
  'worklet';
  const n        = data.length;
  if (n < 2) return {sx: -1, sy: -1, value: 0, idx: 0};
  const virtualW = chartW * zoom;
  const ppp      = virtualW / (n - 1);
  const startI   = wc(Math.floor(panPx / ppp), 0, n - 2);
  const endI     = wc(Math.ceil((panPx + chartW) / ppp), startI + 1, n - 1);

  let minV = data[startI], maxV = data[startI];
  for (let i = startI + 1; i <= endI; i++) {
    if (data[i] < minV) minV = data[i];
    if (data[i] > maxV) maxV = data[i];
  }
  const range    = maxV - minV || Math.abs(maxV) * 0.01 || 1;
  const adjMin   = minV - range * 0.05;
  const adjRange = range * 1.1;

  const idx = wc(Math.round((rawX - PAD_L + panPx) / ppp), 0, n - 1);
  const sx  = PAD_L + idx * ppp - panPx;
  const sy  = PAD_T + chartH - ((data[idx] - adjMin) / adjRange) * chartH;
  return {sx, sy, value: data[idx], idx};
}

export default function EquityChart({
  data,
  width,
  height = 120,
  color  = '#10B981',
  style,
}: EquityChartProps) {
  const chartW = width  - PAD_L - PAD_R;
  const chartH = height - PAD_T - PAD_B;

  const sv_zoom        = useSharedValue(1);
  const sv_pan         = useSharedValue(0);
  const sv_cross       = useSharedValue(-1);
  const sv_startZoom   = useSharedValue(1);
  const sv_startPan    = useSharedValue(0);
  const sv_startFocalV = useSharedValue(0);
  const sv_pinching    = useSharedValue(false);

  const [liveCrossY,   setLiveCrossY]   = useState<number | null>(null);
  const [liveCrossVal, setLiveCrossVal] = useState<number | null>(null);
  const [jsZoom,       setJsZoom]       = useState(1);
  const [jsPan,        setJsPan]        = useState(0);

  const dataRef = useMemo(() => data, [data]);
  const cW = chartW, cH = chartH;

  const syncState = useCallback((z: number, p: number) => { setJsZoom(z); setJsPan(p); }, []);
  const syncLive  = useCallback((sy: number, val: number) => { setLiveCrossY(sy); setLiveCrossVal(val); }, []);
  const clearLive = useCallback(() => { setLiveCrossY(null); setLiveCrossVal(null); }, []);
  const reset     = useCallback(() => {
    sv_zoom.value = 1; sv_pan.value = 0; sv_cross.value = -1;
    setJsZoom(1); setJsPan(0); setLiveCrossY(null); setLiveCrossVal(null);
  }, []);

  const derivedPathsObj = useDerivedValue(() => buildPaths(dataRef, cW, cH, sv_zoom.value, sv_pan.value), [sv_zoom, sv_pan]);
  const derivedFill     = useDerivedValue(() => derivedPathsObj.value.fill, [derivedPathsObj]);
  const derivedLine     = useDerivedValue(() => derivedPathsObj.value.line, [derivedPathsObj]);

  const derivedCross = useDerivedValue(() => {
    if (sv_cross.value < 0) return {sx: -1, sy: -1};
    const c = resolveCross(dataRef, cW, cH, sv_zoom.value, sv_pan.value, sv_cross.value);
    return {sx: c.sx, sy: c.sy};
  }, [sv_cross, sv_zoom, sv_pan]);

  const crossX    = useDerivedValue(() => derivedCross.value.sx,     [derivedCross]);
  const crossY    = useDerivedValue(() => derivedCross.value.sy,     [derivedCross]);
  const opacity   = useDerivedValue(() => derivedCross.value.sx >= 0 ? 1 : 0, [derivedCross]);
  const bubbleY   = useDerivedValue(() => derivedCross.value.sy - 9, [derivedCross]);
  const vLinePt1  = useDerivedValue(() => vec(crossX.value, PAD_T),           [crossX]);
  const vLinePt2  = useDerivedValue(() => vec(crossX.value, PAD_T + cH),      [crossX]);
  const hLinePt1  = useDerivedValue(() => vec(PAD_L, crossY.value),           [crossY]);
  const hLinePt2  = useDerivedValue(() => vec(PAD_L + cW, crossY.value),      [crossY]);

  // Y-axis labels from JS state
  const yLabels = useMemo(() => {
    if (!data || data.length < 2) return [];
    const n        = data.length;
    const virtualW = chartW * jsZoom;
    const ppp      = virtualW / (n - 1);
    const startI   = Math.max(0, Math.floor(jsPan / ppp));
    const endI     = Math.min(n - 1, Math.ceil((jsPan + chartW) / ppp));
    const slice    = data.slice(startI, endI + 1);
    const minV     = Math.min(...slice), maxV = Math.max(...slice);
    const rng      = maxV - minV || Math.abs(maxV) * 0.01 || 1;
    const adjMin   = minV - rng * 0.05;
    const adjRange = rng * 1.1;
    return Array.from({length: 4}, (_, i) => ({
      val: adjMin + adjRange - (adjRange * i) / 3,
      y:   PAD_T + (i / 3) * chartH,
    }));
  }, [data, jsZoom, jsPan, chartW, chartH]);

  const pinch = Gesture.Pinch()
    .onBegin((e) => {
      'worklet';
      sv_pinching.value = true; sv_startZoom.value = sv_zoom.value; sv_startPan.value = sv_pan.value;
      sv_startFocalV.value = (e.focalX - PAD_L) + sv_pan.value;
    })
    .onUpdate((e) => {
      'worklet';
      const nz = clamp(sv_startZoom.value * e.scale, 1, MAX_ZOOM);
      sv_zoom.value = nz;
      sv_pan.value  = clamp(sv_startFocalV.value * (nz / sv_startZoom.value) - (e.focalX - PAD_L), 0, cW * (nz - 1));
    })
    .onFinalize((e) => {
      'worklet';
      const rz  = sv_startZoom.value * e.scale;
      const nz  = rz < 1.08 ? 1 : clamp(rz, 1, MAX_ZOOM);
      const np  = nz === 1 ? 0 : clamp(sv_startFocalV.value * (nz / sv_startZoom.value) - (e.focalX - PAD_L), 0, cW * (nz - 1));
      sv_zoom.value = nz; sv_pan.value = np; sv_pinching.value = false;
      runOnJS(syncState)(nz, np);
    });

  const panG = Gesture.Pan()
    .minDistance(2).averageTouches(false)
    .onBegin(() => { 'worklet'; sv_startPan.value = sv_pan.value; })
    .onUpdate((e) => {
      'worklet';
      if (sv_pinching.value) return;
      if (sv_zoom.value <= 1.02) {
        sv_cross.value = e.x;
        const c = resolveCross(dataRef, cW, cH, sv_zoom.value, sv_pan.value, e.x);
        runOnJS(syncLive)(c.sy, c.value);
        return;
      }
      sv_pan.value = clamp(sv_startPan.value - e.translationX, 0, cW * (sv_zoom.value - 1));
    })
    .onEnd((e) => {
      'worklet';
      if (sv_pinching.value) return;
      if (sv_zoom.value > 1.02) {
        const p = clamp(sv_startPan.value - e.translationX, 0, cW * (sv_zoom.value - 1));
        sv_pan.value = p; sv_cross.value = -1;
        runOnJS(syncState)(sv_zoom.value, p); runOnJS(clearLive)();
      } else { sv_cross.value = -1; runOnJS(clearLive)(); }
    })
    .onFinalize(() => { 'worklet'; sv_cross.value = -1; runOnJS(clearLive)(); });

  const longPress = Gesture.LongPress().minDuration(160).maxDistance(50)
    .onStart((e) => {
      'worklet';
      sv_cross.value = e.x;
      const c = resolveCross(dataRef, cW, cH, sv_zoom.value, sv_pan.value, e.x);
      runOnJS(syncLive)(c.sy, c.value);
    })
    .onEnd(() => { 'worklet'; sv_cross.value = -1; runOnJS(clearLive)(); })
    .onFinalize(() => { 'worklet'; sv_cross.value = -1; runOnJS(clearLive)(); });

  const doubleTap = Gesture.Tap().numberOfTaps(2).maxDuration(300)
    .onEnd(() => { 'worklet'; sv_zoom.value = 1; sv_pan.value = 0; sv_cross.value = -1; runOnJS(reset)(); });

  const composed = Gesture.Simultaneous(pinch, Gesture.Exclusive(doubleTap, panG), longPress);

  if (!data || data.length < 2) return <View style={[{width, height}, style]} />;

  return (
    <GestureDetector gesture={composed}>
      <View style={[{width, height, position: 'relative'}, style]}>
        <Canvas style={{position: 'absolute', top: 0, left: 0, width, height}}>
          {/* Fill */}
          <Group clip={{x: PAD_L, y: 0, width: chartW, height}}>
            <SkPath path={derivedFill} style="fill">
              <SkLinearGradient
                start={vec(0, PAD_T)}
                end={vec(0, PAD_T + chartH)}
                colors={[color + '40', color + '08', color + '00']}
              />
            </SkPath>
            <SkPath path={derivedLine} style="stroke" strokeWidth={2} strokeCap="round" strokeJoin="round" color={color} />
          </Group>

          {/* Crosshair */}
          <Group opacity={opacity}>
            <SkLine p1={vLinePt1} p2={vLinePt2} color="rgba(255,255,255,0.4)" strokeWidth={1} />
            <SkLine p1={hLinePt1} p2={hLinePt2} color="rgba(255,255,255,0.12)" strokeWidth={1} />
            <SkCircle cx={crossX} cy={crossY} r={10} color={color + '22'} />
            <SkCircle cx={crossX} cy={crossY} r={5}  color={color} />
            <SkCircle cx={crossX} cy={crossY} r={3}  color="#0F1117" />
            <RoundedRect x={PAD_L + chartW + 3} y={bubbleY} width={PAD_R - 5} height={18} r={4} color={color} />
          </Group>
        </Canvas>

        {/* Y-axis labels */}
        {yLabels.map((yl, i) => (
          <Text key={i} style={[s.yLabel, {top: yl.y - 6}]}>{fmtV(yl.val)}</Text>
        ))}

        {/* Price bubble text */}
        {liveCrossVal !== null && liveCrossY !== null && (
          <View style={[s.bubble, {top: liveCrossY - 9}]}>
            <Text style={s.bubbleTxt} numberOfLines={1}>{fmtV(liveCrossVal)}</Text>
          </View>
        )}
      </View>
    </GestureDetector>
  );
}

const s = StyleSheet.create({
  yLabel: {
    position: 'absolute',
    right: 4,
    width: PAD_R - 6,
    textAlign: 'right',
    fontFamily: 'Inter-Regular',
    fontSize: 8,
    color: 'rgba(255,255,255,0.22)',
  },
  bubble: {
    position: 'absolute',
    right: 3,
    width: PAD_R - 5,
    height: 18,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bubbleTxt: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 8,
    color: '#FFFFFF',
    textAlign: 'center',
  },
});
