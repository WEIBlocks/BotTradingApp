/**
 * ArenaMultilineChart — Skia-powered, UI-thread gestures
 *
 * Shows multiple bot equity curves as % return from start.
 * Controls: pinch zoom, pan, long-press crosshair, double-tap reset.
 * All gesture math + drawing runs on the UI thread via Skia + Reanimated.
 */

import React, {useMemo, useCallback, useState} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {
  Canvas,
  Path as SkPath,
  Line as SkLine,
  Circle as SkCircle,
  Group,
  Skia,
} from '@shopify/react-native-skia';
import {
  useSharedValue,
  useDerivedValue,
  runOnJS,
  clamp,
} from 'react-native-reanimated';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';

export const LINE_COLORS = ['#39FF14', '#A855F7', '#EC4899', '#22D3EE', '#EAB308'];

const PAD_L = 4;
const PAD_R = 4;
const PAD_T = 12;
const PAD_B = 12;
const MAX_ZOOM = 8;

interface ArenaMultilineChartProps {
  datasets: number[][];
  width: number;
  height?: number;
}

// ─── Worklet helpers ──────────────────────────────────────────────────────────

function wClamp(v: number, lo: number, hi: number): number {
  'worklet';
  return v < lo ? lo : v > hi ? hi : v;
}

function buildArenaPath(
  normalized: number[],
  chartW: number,
  chartH: number,
  minVal: number,
  range: number,
  zoom: number,
  panPx: number,
): ReturnType<typeof Skia.Path.Make> {
  'worklet';
  const n = normalized.length;
  if (n < 2) return Skia.Path.Make();

  const virtualW = chartW * zoom;
  const ppp      = virtualW / (n - 1);
  const toX      = (i: number) => PAD_L + i * ppp - panPx;
  const toY      = (v: number) => PAD_T + chartH - ((v - minVal) / range) * chartH;

  const drawS = wClamp(Math.floor(panPx / ppp) - 1, 0, n - 2);
  const drawE = wClamp(Math.ceil((panPx + chartW) / ppp) + 1, drawS + 1, n - 1);

  const path = Skia.Path.Make();
  path.moveTo(toX(drawS), toY(normalized[drawS]));
  for (let i = drawS + 1; i <= drawE; i++) {
    const px = toX(i - 1), py = toY(normalized[i - 1]);
    const cx = toX(i),     cy = toY(normalized[i]);
    const t = 0.35;
    path.cubicTo(px + (cx - px) * t, py, cx - (cx - px) * t, cy, cx, cy);
  }
  return path;
}

interface CrosshairResult {
  sx: number;
  values: number[]; // one per dataset
  idx: number;
}

function resolveCrosshair(
  datasets: number[][],
  chartW: number,
  zoom: number,
  panPx: number,
  rawX: number,
): CrosshairResult {
  'worklet';
  if (datasets.length === 0 || datasets[0].length < 2) {
    return {sx: -1, values: [], idx: -1};
  }
  const n       = datasets[0].length;
  const virtualW = chartW * zoom;
  const ppp     = virtualW / (n - 1);
  const vX      = rawX - PAD_L + panPx;
  const idx     = wClamp(Math.round(vX / ppp), 0, n - 1);
  const sx      = PAD_L + idx * ppp - panPx;
  return {sx, values: datasets.map(d => d[idx] ?? 0), idx};
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ArenaMultilineChart({
  datasets,
  width,
  height = 200,
}: ArenaMultilineChartProps) {
  const chartW = width  - PAD_L - PAD_R;
  const chartH = height - PAD_T - PAD_B;

  // ── Normalize datasets once ───────────────────────────────────────────────
  const {normalized, minVal, range, zeroY} = useMemo(() => {
    if (datasets.length === 0) return {normalized: [], minVal: 0, range: 1, zeroY: PAD_T + chartH / 2};

    const norm = datasets.map(data => {
      if (data.length < 2) return [] as number[];
      const initial = data[0] || 10000;
      return data.map(v => ((v - initial) / initial) * 100);
    });

    const allVals = norm.flat();
    if (allVals.length === 0) return {normalized: norm, minVal: -1, range: 2, zeroY: PAD_T + chartH / 2};

    const minV  = Math.min(...allVals, 0);
    const maxV  = Math.max(...allVals, 0);
    const rng   = maxV - minV || 1;
    const zY    = PAD_T + chartH - ((0 - minV) / rng) * chartH;

    return {normalized: norm, minVal: minV, range: rng, zeroY: zY};
  }, [datasets, chartH]);

  // ── Shared values ─────────────────────────────────────────────────────────
  const sv_zoom        = useSharedValue(1);
  const sv_pan         = useSharedValue(0);
  const sv_cross       = useSharedValue(-1);
  const sv_startZoom   = useSharedValue(1);
  const sv_startPan    = useSharedValue(0);
  const sv_startFocalV = useSharedValue(0);
  const sv_pinching    = useSharedValue(false);

  // ── JS state for crosshair label overlay ──────────────────────────────────
  const [liveCross, setLiveCross] = useState<{sx: number; values: number[]; idx: number} | null>(null);
  const [jsZoom, setJsZoom]       = useState(1);
  const [jsPan,  setJsPan]        = useState(0);

  const syncState = useCallback((z: number, p: number) => { setJsZoom(z); setJsPan(p); }, []);
  const syncLive  = useCallback((sx: number, values: number[], idx: number) => setLiveCross({sx, values, idx}), []);
  const clearLive = useCallback(() => setLiveCross(null), []);

  const reset = useCallback(() => {
    sv_zoom.value = 1; sv_pan.value = 0; sv_cross.value = -1;
    setJsZoom(1); setJsPan(0); setLiveCross(null);
  }, []);

  // ── Skia derived paths ────────────────────────────────────────────────────
  const derivedPaths = normalized.map((norm, i) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => {
      if (norm.length < 2) return Skia.Path.Make();
      return buildArenaPath(norm, chartW, chartH, minVal, range, sv_zoom.value, sv_pan.value);
    }, [sv_zoom, sv_pan])
  );

  const derivedCross = useDerivedValue(() => {
    if (sv_cross.value < 0) return {sx: -1, vLineY1: PAD_T, vLineY2: PAD_T + chartH};
    const c = resolveCrosshair(normalized, chartW, sv_zoom.value, sv_pan.value, sv_cross.value);
    return {sx: c.sx, vLineY1: PAD_T, vLineY2: PAD_T + chartH};
  }, [sv_cross, sv_zoom, sv_pan]);

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
      const newZoom = clamp(sv_startZoom.value * e.scale, 1, MAX_ZOOM);
      const newPan  = clamp(
        sv_startFocalV.value * (newZoom / sv_startZoom.value) - (e.focalX - PAD_L),
        0, chartW * (newZoom - 1),
      );
      sv_zoom.value = newZoom;
      sv_pan.value  = newPan;
    })
    .onFinalize((e) => {
      'worklet';
      const rawZoom = sv_startZoom.value * e.scale;
      const newZoom = rawZoom < 1.08 ? 1 : clamp(rawZoom, 1, MAX_ZOOM);
      const newPan  = newZoom === 1 ? 0 : clamp(
        sv_startFocalV.value * (newZoom / sv_startZoom.value) - (e.focalX - PAD_L),
        0, chartW * (newZoom - 1),
      );
      sv_zoom.value = newZoom; sv_pan.value = newPan; sv_pinching.value = false;
      runOnJS(syncState)(newZoom, newPan);
    });

  const pan = Gesture.Pan()
    .minDistance(2)
    .averageTouches(false)
    .onBegin(() => { 'worklet'; sv_startPan.value = sv_pan.value; })
    .onUpdate((e) => {
      'worklet';
      if (sv_pinching.value) return;
      if (sv_zoom.value <= 1.02) {
        sv_cross.value = e.x;
        const c = resolveCrosshair(normalized, chartW, sv_zoom.value, sv_pan.value, e.x);
        runOnJS(syncLive)(c.sx, c.values, c.idx);
        return;
      }
      sv_pan.value = clamp(sv_startPan.value - e.translationX, 0, chartW * (sv_zoom.value - 1));
    })
    .onEnd((e) => {
      'worklet';
      if (sv_pinching.value) return;
      if (sv_zoom.value > 1.02) {
        const p = clamp(sv_startPan.value - e.translationX, 0, chartW * (sv_zoom.value - 1));
        sv_pan.value = p; sv_cross.value = -1;
        runOnJS(syncState)(sv_zoom.value, p); runOnJS(clearLive)();
      } else {
        sv_cross.value = -1; runOnJS(clearLive)();
      }
    })
    .onFinalize(() => { 'worklet'; sv_cross.value = -1; runOnJS(clearLive)(); });

  const longPress = Gesture.LongPress()
    .minDuration(160).maxDistance(50)
    .onStart((e) => {
      'worklet';
      sv_cross.value = e.x;
      const c = resolveCrosshair(normalized, chartW, sv_zoom.value, sv_pan.value, e.x);
      runOnJS(syncLive)(c.sx, c.values, c.idx);
    })
    .onEnd(() => { 'worklet'; sv_cross.value = -1; runOnJS(clearLive)(); })
    .onFinalize(() => { 'worklet'; sv_cross.value = -1; runOnJS(clearLive)(); });

  const doubleTap = Gesture.Tap().numberOfTaps(2).maxDuration(300)
    .onEnd(() => { 'worklet'; sv_zoom.value = 1; sv_pan.value = 0; sv_cross.value = -1; runOnJS(reset)(); });

  const composed = Gesture.Simultaneous(pinch, Gesture.Exclusive(doubleTap, pan), longPress);

  const isZoomed = jsZoom > 1.05;

  return (
    <GestureDetector gesture={composed}>
      <View style={{width, height}}>
        <Canvas style={{position: 'absolute', top: 0, left: 0, width, height}}>
          {/* Zero baseline */}
          <SkLine
            p1={{x: PAD_L, y: zeroY}}
            p2={{x: PAD_L + chartW, y: zeroY}}
            color="rgba(255,255,255,0.12)"
            strokeWidth={1}
          />

          {/* Bot lines */}
          <Group clip={{x: PAD_L, y: 0, width: chartW, height}}>
            {derivedPaths.map((dp, i) => (
              <SkPath
                key={i}
                path={dp}
                style="stroke"
                strokeWidth={2.5}
                strokeCap="round"
                strokeJoin="round"
                color={LINE_COLORS[i % LINE_COLORS.length]}
              />
            ))}
          </Group>

          {/* Crosshair vertical line */}
          <CrosshairVLine derivedCross={derivedCross} />

          {/* Crosshair dots for each bot */}
          {liveCross && liveCross.sx >= PAD_L && liveCross.sx <= PAD_L + chartW &&
            liveCross.values.map((val, i) => {
              const cy = PAD_T + chartH - ((val - minVal) / range) * chartH;
              return (
                <SkCircle
                  key={i}
                  cx={liveCross.sx}
                  cy={cy}
                  r={5}
                  color={LINE_COLORS[i % LINE_COLORS.length]}
                />
              );
            })
          }
        </Canvas>

        {/* Crosshair value labels */}
        {liveCross && liveCross.values.length > 0 && (
          <View style={[styles.crossLabel, {left: Math.min(liveCross.sx + 6, width - 100)}]}>
            {liveCross.values.map((val, i) => (
              <View key={i} style={styles.crossLabelRow}>
                <View style={[styles.crossDot, {backgroundColor: LINE_COLORS[i % LINE_COLORS.length]}]} />
                <Text style={styles.crossLabelTxt}>
                  {val >= 0 ? '+' : ''}{val.toFixed(2)}%
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Zoom pill */}
        {isZoomed && (
          <View style={styles.zoomPill}>
            <Text style={styles.zoomTxt}>{jsZoom.toFixed(1)}×</Text>
          </View>
        )}
      </View>
    </GestureDetector>
  );
}

// Small sub-component to render crosshair line from derived value
function CrosshairVLine({derivedCross}: {
  derivedCross: {value: {sx: number; vLineY1: number; vLineY2: number}};
}) {
  const sx      = useDerivedValue(() => derivedCross.value.sx,       [derivedCross]);
  const visible = useDerivedValue(() => derivedCross.value.sx >= 0 ? 1 : 0, [derivedCross]);
  const pt1     = useDerivedValue(() => ({x: sx.value, y: derivedCross.value.vLineY1}), [sx, derivedCross]);
  const pt2     = useDerivedValue(() => ({x: sx.value, y: derivedCross.value.vLineY2}), [sx, derivedCross]);

  return (
    <Group opacity={visible}>
      <SkLine p1={pt1} p2={pt2} color="rgba(255,255,255,0.4)" strokeWidth={1} />
    </Group>
  );
}

const styles = StyleSheet.create({
  crossLabel: {
    position: 'absolute',
    top: PAD_T + 4,
    backgroundColor: 'rgba(15,17,23,0.85)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    gap: 3,
  },
  crossLabelRow: {flexDirection: 'row', alignItems: 'center', gap: 5},
  crossDot: {width: 7, height: 7, borderRadius: 3.5},
  crossLabelTxt: {fontFamily: 'Inter-SemiBold', fontSize: 10, color: '#FFFFFF'},
  zoomPill: {
    position: 'absolute',
    top: 4, right: 4,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  zoomTxt: {fontFamily: 'Inter-SemiBold', fontSize: 9, color: 'rgba(255,255,255,0.4)'},
});
