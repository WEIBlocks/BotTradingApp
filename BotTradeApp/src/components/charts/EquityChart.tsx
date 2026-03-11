import React, {useMemo} from 'react';
import {View, StyleSheet, ViewStyle} from 'react-native';
import {Canvas, Path, LinearGradient, vec, Paint, BlurMaskFilter} from '@shopify/react-native-skia';

interface EquityChartProps {
  data: number[];
  width: number;
  height?: number;
  color?: string;
  style?: ViewStyle;
}

export default function EquityChart({data, width, height = 120, color = '#10B981', style}: EquityChartProps) {
  const {linePath, fillPath} = useMemo(() => {
    if (data.length < 2) return {linePath: '', fillPath: ''};

    const padding = {top: 8, bottom: 8, left: 2, right: 2};
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const minVal = Math.min(...data);
    const maxVal = Math.max(...data);
    const range = maxVal - minVal || 1;

    const points = data.map((val, i) => ({
      x: padding.left + (i / (data.length - 1)) * chartW,
      y: padding.top + chartH - ((val - minVal) / range) * chartH,
    }));

    // Build smooth cubic bezier path
    let lineSvg = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cp1x = prev.x + (curr.x - prev.x) / 3;
      const cp1y = prev.y;
      const cp2x = curr.x - (curr.x - prev.x) / 3;
      const cp2y = curr.y;
      lineSvg += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${curr.x} ${curr.y}`;
    }

    const fillSvg =
      lineSvg +
      ` L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

    return {linePath: lineSvg, fillPath: fillSvg};
  }, [data, width, height]);

  if (!linePath) return <View style={[{width, height}, style]} />;

  return (
    <Canvas style={[{width, height}, style]}>
      {/* Gradient fill */}
      <Path path={fillPath} style="fill">
        <LinearGradient
          start={vec(0, 0)}
          end={vec(0, height)}
          colors={['rgba(16,185,129,0.25)', 'rgba(16,185,129,0.0)']}
        />
      </Path>
      {/* Glowing line */}
      <Path path={linePath} style="stroke" strokeWidth={2.5} color={color}>
        <Paint>
          <BlurMaskFilter style="solid" sigma={3} respectCTM={false} />
        </Paint>
      </Path>
      {/* Main line on top */}
      <Path path={linePath} style="stroke" strokeWidth={2} color={color} />
    </Canvas>
  );
}
