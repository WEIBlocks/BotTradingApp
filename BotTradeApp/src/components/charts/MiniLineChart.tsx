import React, {useMemo} from 'react';
import Svg, {Path} from 'react-native-svg';

interface MiniLineChartProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}

export default function MiniLineChart({data, width = 60, height = 30, color = '#10B981'}: MiniLineChartProps) {
  const path = useMemo(() => {
    if (data.length < 2) return '';
    const minVal = Math.min(...data);
    const maxVal = Math.max(...data);
    const range = maxVal - minVal || 1;
    const points = data.map((val, i) => ({
      x: (i / (data.length - 1)) * width,
      y: height - ((val - minVal) / range) * height,
    }));

    let svg = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      svg += ` L ${points[i].x} ${points[i].y}`;
    }
    return svg;
  }, [data, width, height]);

  if (!path) return null;

  return (
    <Svg width={width} height={height}>
      <Path d={path} stroke={color} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
