import React, {useMemo} from 'react';
import {View, ViewStyle} from 'react-native';
import Svg, {Path, Defs, LinearGradient, Stop} from 'react-native-svg';

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

    let lineSvg = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cp1x = prev.x + (curr.x - prev.x) / 3;
      const cp2x = curr.x - (curr.x - prev.x) / 3;
      lineSvg += ` C ${cp1x} ${prev.y} ${cp2x} ${curr.y} ${curr.x} ${curr.y}`;
    }

    const fillSvg =
      lineSvg +
      ` L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

    return {linePath: lineSvg, fillPath: fillSvg};
  }, [data, width, height]);

  if (!linePath) return <View style={[{width, height}, style]} />;

  return (
    <Svg width={width} height={height} style={style}>
      <Defs>
        <LinearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.25" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Path d={fillPath} fill="url(#equityGrad)" />
      <Path d={linePath} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
