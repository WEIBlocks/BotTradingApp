import React, {useMemo, useState, useRef, useCallback, useEffect} from 'react';
import {View, Text, StyleSheet, PanResponder, GestureResponderEvent, PanResponderGestureState, ViewStyle, ScrollView} from 'react-native';
import Svg, {Path, Defs, LinearGradient, Stop, Line, Circle, Rect, Text as SvgText} from 'react-native-svg';

// ─── Timeframe chips (horizontal scroll) ─────────────────────────────────────

const DEFAULT_TIMEFRAMES = ['1m', '5m', '30m', '1H', '4H', '1D', '1W', '1M', 'ALL'];

interface TimeframeBarProps {
  timeframes?: string[];
  selected: string;
  onSelect: (tf: string) => void;
}

function TimeframeBar({timeframes = DEFAULT_TIMEFRAMES, selected, onSelect}: TimeframeBarProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={tfStyles.scrollContent}
      style={tfStyles.scroll}>
      {timeframes.map(tf => {
        const active = tf === selected;
        return (
          <View
            key={tf}
            style={[tfStyles.chip, active && tfStyles.chipActive]}
            onTouchEnd={() => onSelect(tf)}>
            <Text style={[tfStyles.text, active && tfStyles.textActive]}>{tf}</Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

const tfStyles = StyleSheet.create({
  scroll: {flexGrow: 0, marginBottom: 8},
  scrollContent: {gap: 4, paddingRight: 8},
  chip: {paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)'},
  chipActive: {backgroundColor: '#10B981'},
  text: {fontFamily: 'Inter-Medium', fontSize: 12, color: 'rgba(255,255,255,0.35)'},
  textActive: {color: '#FFFFFF'},
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildSmoothPath(points: {x: number; y: number}[]): string {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const p = points[i - 1];
    const c = points[i];
    const cp1x = p.x + (c.x - p.x) / 3;
    const cp2x = c.x - (c.x - p.x) / 3;
    d += ` C ${cp1x} ${p.y} ${cp2x} ${c.y} ${c.x} ${c.y}`;
  }
  return d;
}

function formatValue(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return '$0.00';
  if (v >= 1000) return '$' + v.toLocaleString('en-US', {maximumFractionDigits: 2});
  if (v >= 1) return '$' + v.toFixed(2);
  return '$' + v.toFixed(4);
}

function formatTimestamp(index: number, total: number, tf: string): string {
  const pct = total > 1 ? index / (total - 1) : 0;
  if (tf === '1m' || tf === '5m') return `${Math.round(pct * 60)}s`;
  if (tf === '30m') return `${Math.round(pct * 30)}m`;
  if (tf === '1H') return `${Math.round(pct * 60)}m`;
  if (tf === '4H') return `${(pct * 4).toFixed(1)}h`;
  if (tf === '1D') return `${Math.round(pct * 24)}h`;
  if (tf === '1W') return `D${Math.round(pct * 7)}`;
  if (tf === '1M' || tf === '3M') return `D${Math.round(pct * 30)}`;
  if (tf === '2W') return `D${Math.round(pct * 14)}`;
  return `${Math.round(pct * 100)}%`;
}

// ─── Interactive Chart ───────────────────────────────────────────────────────

export interface InteractiveChartProps {
  data: number[];
  width: number;
  height?: number;
  color?: string;
  showTimeframes?: boolean;
  timeframes?: string[];
  selectedTimeframe?: string;
  onTimeframeChange?: (tf: string) => void;
  showGradient?: boolean;
  showGrid?: boolean;
  showCrosshair?: boolean;
  showXLabels?: boolean;
  showYLabels?: boolean;
  style?: ViewStyle;
  label?: string;
}

export default function InteractiveChart({
  data,
  width,
  height = 200,
  color = '#10B981',
  showTimeframes = true,
  timeframes,
  selectedTimeframe: externalTF,
  onTimeframeChange,
  showGradient = true,
  showGrid = true,
  showCrosshair = true,
  showXLabels = true,
  showYLabels = true,
  style,
  label,
}: InteractiveChartProps) {
  const [internalTF, setInternalTF] = useState('1D');
  const selectedTF = externalTF ?? internalTF;
  const handleTFChange = (tf: string) => {
    if (onTimeframeChange) onTimeframeChange(tf);
    else setInternalTF(tf);
  };

  // Use refs for mutable gesture state so PanResponder always has fresh values
  const zoomRef = useRef(1);
  const panRef = useRef(0);
  const [renderKey, setRenderKey] = useState(0); // force re-render after gesture
  const [crosshairIndex, setCrosshairIndex] = useState<number | null>(null);
  const lastDist = useRef(0);
  const isPinching = useRef(false);
  const gestureStartPan = useRef(0);
  const crosshairTimer = useRef<any>(null);

  const safeData = useMemo(() => data.map(v => (v != null && !isNaN(v) ? v : 0)), [data]);

  // Reset zoom/pan when data or timeframe changes
  useEffect(() => {
    zoomRef.current = 1;
    panRef.current = 0;
    setRenderKey(k => k + 1);
  }, [safeData.length, selectedTF]);

  const padding = {top: 20, bottom: showXLabels ? 24 : 8, left: showYLabels ? 48 : 8, right: 8};
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Compute visible data range based on zoom and pan
  const zoomLevel = zoomRef.current;
  const panOffset = panRef.current;

  const visibleData = useMemo(() => {
    if (safeData.length < 2) return safeData;
    const windowSize = Math.max(4, Math.round(safeData.length / zoomLevel));
    const maxOffset = Math.max(0, safeData.length - windowSize);
    const offset = Math.min(Math.max(0, Math.round(panOffset)), maxOffset);
    return safeData.slice(offset, offset + windowSize);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeData, zoomLevel, panOffset, renderKey]);

  const {linePath, fillPath, points, minVal, maxVal} = useMemo(() => {
    if (visibleData.length < 2) return {linePath: '', fillPath: '', points: [] as {x: number; y: number}[], minVal: 0, maxVal: 0};
    const min = Math.min(...visibleData);
    const max = Math.max(...visibleData);
    const range = max - min || 1;

    const pts = visibleData.map((val, i) => ({
      x: padding.left + (i / (visibleData.length - 1)) * chartW,
      y: padding.top + chartH - ((val - min) / range) * chartH,
    }));

    const line = buildSmoothPath(pts);
    const fill = line + ` L ${pts[pts.length - 1].x} ${padding.top + chartH} L ${pts[0].x} ${padding.top + chartH} Z`;

    return {linePath: line, fillPath: fill, points: pts, minVal: min, maxVal: max};
  }, [visibleData, chartW, chartH, padding.left, padding.top]);

  // Grid lines
  const gridLines = useMemo(() => {
    if (!showGrid) return {horizontal: [] as number[], vertical: [] as number[]};
    const hCount = 4;
    const vCount = 5;
    const horizontal = Array.from({length: hCount}, (_, i) => padding.top + (i / (hCount - 1)) * chartH);
    const vertical = Array.from({length: vCount}, (_, i) => padding.left + (i / (vCount - 1)) * chartW);
    return {horizontal, vertical};
  }, [showGrid, chartH, chartW, padding.left, padding.top]);

  // Y-axis labels
  const yLabels = useMemo(() => {
    if (!showYLabels || maxVal === 0) return [];
    const range = maxVal - minVal || 1;
    return [0, 0.25, 0.5, 0.75, 1].map(pct => ({
      y: padding.top + chartH - pct * chartH,
      label: formatValue(minVal + pct * range),
    }));
  }, [showYLabels, minVal, maxVal, chartH, padding.top]);

  // X-axis labels
  const xLabels = useMemo(() => {
    if (!showXLabels || visibleData.length < 2) return [];
    const count = Math.min(5, visibleData.length);
    const indices = Array.from({length: count}, (_, i) => Math.round(i * (visibleData.length - 1) / (count - 1)));
    return indices.map(i => ({
      x: padding.left + (i / (visibleData.length - 1)) * chartW,
      label: formatTimestamp(i, visibleData.length, selectedTF),
    }));
  }, [showXLabels, visibleData, chartW, padding.left, selectedTF]);

  // Helper to find crosshair index from touch X
  const findCrosshairIdx = useCallback((locationX: number) => {
    const relX = locationX - padding.left;
    const idx = Math.round((relX / chartW) * (visibleData.length - 1));
    return Math.max(0, Math.min(idx, visibleData.length - 1));
  }, [chartW, padding.left, visibleData.length]);

  // Trigger re-render after gesture ends
  const forceUpdate = useCallback(() => setRenderKey(k => k + 1), []);

  // Pan responder using refs for fresh values
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 3 || Math.abs(gs.dy) > 3,
    onPanResponderGrant: (evt: GestureResponderEvent) => {
      const touches = evt.nativeEvent.touches;
      if (touches.length === 2) {
        isPinching.current = true;
        const dx = touches[0].pageX - touches[1].pageX;
        const dy = touches[0].pageY - touches[1].pageY;
        lastDist.current = Math.sqrt(dx * dx + dy * dy);
      } else {
        isPinching.current = false;
        gestureStartPan.current = panRef.current;
        // Show crosshair immediately
        if (showCrosshair) {
          const idx = findCrosshairIdx(touches[0].locationX);
          setCrosshairIndex(idx);
          if (crosshairTimer.current) clearTimeout(crosshairTimer.current);
        }
      }
    },
    onPanResponderMove: (evt: GestureResponderEvent, gs: PanResponderGestureState) => {
      const touches = evt.nativeEvent.touches;
      if (touches.length === 2) {
        // Pinch to zoom
        isPinching.current = true;
        const dx = touches[0].pageX - touches[1].pageX;
        const dy = touches[0].pageY - touches[1].pageY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (lastDist.current > 0) {
          const scale = dist / lastDist.current;
          const newZoom = Math.min(Math.max(1, zoomRef.current * scale), 10);
          zoomRef.current = newZoom;
          // Clamp pan
          const windowSize = Math.round(safeData.length / newZoom);
          const maxOff = Math.max(0, safeData.length - windowSize);
          panRef.current = Math.min(panRef.current, maxOff);
          forceUpdate();
        }
        lastDist.current = dist;
      } else if (!isPinching.current) {
        // Single finger
        if (zoomRef.current > 1.05) {
          // Pan the chart when zoomed
          const windowSize = Math.round(safeData.length / zoomRef.current);
          const pxPerPoint = chartW / windowSize;
          const pointDelta = -gs.dx / pxPerPoint;
          const newPan = gestureStartPan.current + pointDelta;
          const maxOff = Math.max(0, data.length - windowSize);
          panRef.current = Math.min(Math.max(0, newPan), maxOff);
          forceUpdate();
        }
        // Update crosshair
        if (showCrosshair && touches[0]) {
          const idx = findCrosshairIdx(touches[0].locationX);
          setCrosshairIndex(idx);
        }
      }
    },
    onPanResponderRelease: () => {
      isPinching.current = false;
      lastDist.current = 0;
      forceUpdate();
      // Hide crosshair after delay
      crosshairTimer.current = setTimeout(() => setCrosshairIndex(null), 3000);
    },
  // We intentionally recreate when data/chartW changes for fresh closure
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [safeData.length, chartW, showCrosshair, findCrosshairIdx, forceUpdate]);

  // Double tap to reset zoom
  const lastTap = useRef(0);
  const handleTouchEnd = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      zoomRef.current = 1;
      panRef.current = 0;
      setCrosshairIndex(null);
      forceUpdate();
    }
    lastTap.current = now;
  }, [forceUpdate]);

  // Crosshair data
  const crosshairData = useMemo(() => {
    if (crosshairIndex === null || crosshairIndex >= points.length || crosshairIndex < 0) return null;
    return {
      x: points[crosshairIndex].x,
      y: points[crosshairIndex].y,
      value: visibleData[crosshairIndex],
    };
  }, [crosshairIndex, points, visibleData]);

  // Stable gradient ID
  const gradientId = useRef(`cg_${Math.random().toString(36).slice(2)}`).current;

  if (safeData.length < 2) {
    return (
      <View style={[{width, height, justifyContent: 'center', alignItems: 'center'}, style]}>
        <Text style={{fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.3)'}}>No data available</Text>
      </View>
    );
  }

  return (
    <View style={style}>
      {/* Label */}
      {label && <Text style={chartStyles.label}>{label}</Text>}

      {/* Timeframe bar below label */}
      {showTimeframes && (
        <TimeframeBar
          timeframes={timeframes}
          selected={selectedTF}
          onSelect={handleTFChange}
        />
      )}

      {/* Chart area */}
      <View
        {...panResponder.panHandlers}
        onTouchEnd={handleTouchEnd}
        style={{width, height}}>
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity="0.2" />
              <Stop offset="1" stopColor={color} stopOpacity="0" />
            </LinearGradient>
          </Defs>

          {/* Grid */}
          {showGrid && gridLines.horizontal.map((y, i) => (
            <Line key={`h${i}`} x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
          ))}
          {showGrid && gridLines.vertical.map((x, i) => (
            <Line key={`v${i}`} x1={x} y1={padding.top} x2={x} y2={padding.top + chartH} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
          ))}

          {/* Y labels */}
          {yLabels.map((yl, i) => (
            <SvgText key={`yl${i}`} x={padding.left - 6} y={yl.y + 3} textAnchor="end" fontSize={9} fontFamily="Inter-Medium" fill="rgba(255,255,255,0.3)">
              {yl.label}
            </SvgText>
          ))}

          {/* X labels */}
          {xLabels.map((xl, i) => (
            <SvgText key={`xl${i}`} x={xl.x} y={height - 4} textAnchor="middle" fontSize={9} fontFamily="Inter-Medium" fill="rgba(255,255,255,0.3)">
              {xl.label}
            </SvgText>
          ))}

          {/* Gradient fill */}
          {showGradient && fillPath ? <Path d={fillPath} fill={`url(#${gradientId})`} /> : null}

          {/* Line */}
          {linePath ? (
            <Path d={linePath} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ) : null}

          {/* Crosshair */}
          {crosshairData && showCrosshair && (
            <>
              <Line x1={crosshairData.x} y1={padding.top} x2={crosshairData.x} y2={padding.top + chartH} stroke="rgba(255,255,255,0.3)" strokeWidth={1} strokeDasharray="4 3" />
              <Line x1={padding.left} y1={crosshairData.y} x2={width - padding.right} y2={crosshairData.y} stroke="rgba(255,255,255,0.3)" strokeWidth={1} strokeDasharray="4 3" />
              <Circle cx={crosshairData.x} cy={crosshairData.y} r={5} fill={color} stroke="#FFFFFF" strokeWidth={2} />
              <Rect
                x={Math.max(padding.left, Math.min(crosshairData.x - 35, width - padding.right - 70))}
                y={Math.max(padding.top, crosshairData.y - 30)}
                width={70}
                height={22}
                rx={6}
                fill="#1A1F2E"
                stroke="rgba(255,255,255,0.15)"
                strokeWidth={1}
              />
              <SvgText
                x={Math.max(padding.left + 35, Math.min(crosshairData.x, width - padding.right - 35))}
                y={Math.max(padding.top + 14, crosshairData.y - 14)}
                textAnchor="middle"
                fontSize={10}
                fontFamily="Inter-SemiBold"
                fill="#FFFFFF">
                {formatValue(crosshairData.value)}
              </SvgText>
            </>
          )}
        </Svg>
      </View>

      {/* Zoom indicator + double-tap hint */}
      {zoomRef.current > 1.05 && (
        <View style={chartStyles.zoomRow}>
          <View style={chartStyles.zoomBadge}>
            <Text style={chartStyles.zoomText}>{zoomRef.current.toFixed(1)}x zoom</Text>
          </View>
          <Text style={chartStyles.zoomHint}>Double-tap to reset</Text>
        </View>
      )}
    </View>
  );
}

const chartStyles = StyleSheet.create({
  label: {
    fontFamily: 'Inter-SemiBold', fontSize: 11, letterSpacing: 1.2,
    color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase',
    marginBottom: 8,
  },
  zoomRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    position: 'absolute', top: 1, right: 4,
  },
  zoomBadge: {
    backgroundColor: 'rgba(16,185,129,0.2)', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  zoomText: {fontFamily: 'Inter-SemiBold', fontSize: 10, color: '#10B981'},
  zoomHint: {fontFamily: 'Inter-Regular', fontSize: 9, color: 'rgba(255,255,255,0.25)'},
});
