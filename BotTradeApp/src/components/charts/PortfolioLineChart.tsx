import React, {useMemo, useState, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import Svg, {Path, Defs, LinearGradient, Stop, Circle, Line} from 'react-native-svg';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EquityPoint {
  date: string | Date;
  value: number;
}

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

// ─── Timeframe Config ───────────────────────────────────────────────────────

const TIMEFRAMES = [
  {label: '1W', days: 7},
  {label: '1M', days: 30},
  {label: '3M', days: 90},
  {label: '6M', days: 180},
  {label: '1Y', days: 365},
  {label: 'ALL', days: 9999},
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatCurrency(val: number): string {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 10_000) return `$${(val / 1_000).toFixed(1)}K`;
  if (val >= 1_000) return `$${val.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`;
  return `$${val.toFixed(2)}`;
}

function formatDate(date: Date, totalDays: number): string {
  if (totalDays <= 7) {
    return date.toLocaleDateString('en-US', {weekday: 'short'});
  }
  if (totalDays <= 90) {
    return date.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
  }
  return date.toLocaleDateString('en-US', {month: 'short', year: '2-digit'});
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function PortfolioLineChart({
  data,
  dates,
  currentValue,
  width,
  height = 220,
  isRealData = false,
  onTimeframeChange,
  loading = false,
  style,
}: PortfolioLineChartProps) {
  const [selectedTF, setSelectedTF] = useState(30); // default 1M
  const [touchIndex, setTouchIndex] = useState<number | null>(null);

  const handleTFChange = useCallback((days: number) => {
    setSelectedTF(days);
    setTouchIndex(null);
    onTimeframeChange?.(days);
  }, [onTimeframeChange]);

  // Chart dimensions
  const padding = {top: 16, bottom: 24, left: 8, right: 50};
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Compute chart paths
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return null;

    // Use data as-is — these are real values, no randomness
    const values = data;
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal || maxVal * 0.01 || 1;

    // Add 5% padding to range
    const adjMin = minVal - range * 0.05;
    const adjRange = range * 1.1;

    const points = values.map((val, i) => ({
      x: padding.left + (values.length > 1 ? (i / (values.length - 1)) * chartW : chartW / 2),
      y: padding.top + chartH - ((val - adjMin) / adjRange) * chartH,
      value: val,
    }));

    // Smooth line path (cubic bezier)
    let linePath = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const tension = 0.3;
      const cp1x = prev.x + (curr.x - prev.x) * tension;
      const cp2x = curr.x - (curr.x - prev.x) * tension;
      linePath += ` C ${cp1x} ${prev.y} ${cp2x} ${curr.y} ${curr.x} ${curr.y}`;
    }

    // Fill path (area under curve)
    const fillPath = linePath +
      ` L ${points[points.length - 1].x} ${padding.top + chartH}` +
      ` L ${points[0].x} ${padding.top + chartH} Z`;

    // Y-axis labels (5 levels)
    const yLabels = [];
    for (let i = 0; i < 5; i++) {
      const val = adjMin + adjRange - (adjRange * i) / 4;
      const y = padding.top + (i / 4) * chartH;
      yLabels.push({val, y});
    }

    // X-axis labels (4-5 evenly spaced dates)
    const xLabels: {label: string; x: number}[] = [];
    if (dates && dates.length > 1) {
      const labelCount = Math.min(5, dates.length);
      for (let i = 0; i < labelCount; i++) {
        const idx = Math.round((i / (labelCount - 1)) * (dates.length - 1));
        const d = new Date(dates[idx]);
        if (!isNaN(d.getTime())) {
          xLabels.push({
            label: formatDate(d, selectedTF),
            x: points[idx]?.x ?? 0,
          });
        }
      }
    }

    // Performance
    const firstVal = values[0];
    const lastVal = values[values.length - 1];
    const change = lastVal - firstVal;
    const changePercent = firstVal > 0 ? (change / firstVal) * 100 : 0;
    const isPositive = change >= 0;

    return {points, linePath, fillPath, yLabels, xLabels, isPositive, change, changePercent, minVal, maxVal};
  }, [data, dates, chartW, chartH, padding.left, padding.top, selectedTF]);

  const lineColor = chartData?.isPositive ? '#10B981' : '#EF4444';

  // Touch value display
  const displayValue = touchIndex !== null && chartData
    ? chartData.points[touchIndex]?.value ?? currentValue
    : currentValue;
  const displayDate = touchIndex !== null && dates && dates[touchIndex]
    ? new Date(dates[touchIndex]).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})
    : null;

  return (
    <View style={[styles.container, style]}>
      {/* Value Display */}
      <View style={styles.valueRow}>
        <View>
          <Text style={styles.valueLabel}>
            {displayDate ?? 'Portfolio Value'}
          </Text>
          <Text style={styles.valueText}>
            {formatCurrency(displayValue)}
          </Text>
        </View>
        {chartData && (
          <View style={[styles.changeBadge, {backgroundColor: chartData.isPositive ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)'}]}>
            <Text style={[styles.changeText, {color: lineColor}]}>
              {chartData.isPositive ? '+' : ''}{chartData.changePercent.toFixed(2)}%
            </Text>
          </View>
        )}
      </View>

      {/* Timeframe Buttons */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tfRow}>
        {TIMEFRAMES.map(tf => (
          <TouchableOpacity
            key={tf.label}
            activeOpacity={0.7}
            style={[styles.tfBtn, selectedTF === tf.days && styles.tfBtnActive]}
            onPress={() => handleTFChange(tf.days)}>
            <Text style={[styles.tfText, selectedTF === tf.days && styles.tfTextActive]}>
              {tf.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Chart Area */}
      {loading ? (
        <View style={[styles.chartArea, {width, height, justifyContent: 'center', alignItems: 'center'}]}>
          <ActivityIndicator size="small" color="#10B981" />
        </View>
      ) : !chartData || data.length < 2 ? (
        <View style={[styles.chartArea, {width, height, justifyContent: 'center', alignItems: 'center'}]}>
          <Text style={styles.noData}>
            {!isRealData ? 'Portfolio snapshots will appear after your first day' : 'Not enough data for this timeframe'}
          </Text>
        </View>
      ) : (
        <View style={[styles.chartArea, {width, height}]}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderMove={(e) => {
            const x = e.nativeEvent.locationX - padding.left;
            if (x >= 0 && x <= chartW && chartData.points.length > 1) {
              const idx = Math.round((x / chartW) * (chartData.points.length - 1));
              setTouchIndex(Math.max(0, Math.min(idx, chartData.points.length - 1)));
            }
          }}
          onResponderRelease={() => setTouchIndex(null)}
        >
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={lineColor} stopOpacity="0.2" />
                <Stop offset="0.8" stopColor={lineColor} stopOpacity="0.02" />
                <Stop offset="1" stopColor={lineColor} stopOpacity="0" />
              </LinearGradient>
            </Defs>

            {/* Grid lines */}
            {chartData.yLabels.map((yl, i) => (
              <Line
                key={i}
                x1={padding.left}
                y1={yl.y}
                x2={width - padding.right}
                y2={yl.y}
                stroke="rgba(255,255,255,0.05)"
                strokeWidth={1}
              />
            ))}

            {/* Area fill */}
            <Path d={chartData.fillPath} fill="url(#areaGrad)" />

            {/* Line */}
            <Path
              d={chartData.linePath}
              stroke={lineColor}
              strokeWidth={2}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Touch crosshair */}
            {touchIndex !== null && chartData.points[touchIndex] && (
              <>
                <Line
                  x1={chartData.points[touchIndex].x}
                  y1={padding.top}
                  x2={chartData.points[touchIndex].x}
                  y2={padding.top + chartH}
                  stroke="rgba(255,255,255,0.3)"
                  strokeWidth={1}
                  strokeDasharray="4,4"
                />
                <Circle
                  cx={chartData.points[touchIndex].x}
                  cy={chartData.points[touchIndex].y}
                  r={5}
                  fill={lineColor}
                  stroke="#0F1117"
                  strokeWidth={2}
                />
              </>
            )}

            {/* Last point dot */}
            {!touchIndex && chartData.points.length > 0 && (
              <Circle
                cx={chartData.points[chartData.points.length - 1].x}
                cy={chartData.points[chartData.points.length - 1].y}
                r={4}
                fill={lineColor}
                stroke="#0F1117"
                strokeWidth={2}
              />
            )}
          </Svg>

          {/* Y-axis labels */}
          {chartData.yLabels.map((yl, i) => (
            <Text key={i} style={[styles.yLabel, {top: yl.y - 7, right: 2}]}>
              {formatCurrency(yl.val)}
            </Text>
          ))}

          {/* X-axis labels */}
          <View style={styles.xAxisRow}>
            {chartData.xLabels.map((xl, i) => (
              <Text key={i} style={[styles.xLabel, {left: xl.x - 20}]}>
                {xl.label}
              </Text>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {},
  valueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  valueLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  valueText: {
    fontFamily: 'Inter-Bold',
    fontSize: 26,
    color: '#FFFFFF',
  },
  changeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  changeText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
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
  tfBtnActive: {
    backgroundColor: '#10B981',
  },
  tfText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
  },
  tfTextActive: {
    color: '#FFFFFF',
  },
  chartArea: {
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
    fontFamily: 'Inter-Regular',
    fontSize: 9,
    color: 'rgba(255,255,255,0.25)',
  },
  xAxisRow: {
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
});
