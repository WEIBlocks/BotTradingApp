import React, {useMemo} from 'react';
import Svg, {Path} from 'react-native-svg';

const LINE_COLORS = ['#39FF14', '#A855F7', '#EC4899', '#22D3EE', '#EAB308'];

interface ArenaMultilineChartProps {
  datasets: number[][];
  width: number;
  height?: number;
}

export default function ArenaMultilineChart({datasets, width, height = 200}: ArenaMultilineChartProps) {
  const paths = useMemo(() => {
    const allVals = datasets.flat();
    if (allVals.length === 0) return [];

    const padding = {top: 12, bottom: 12, left: 4, right: 4};
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;
    const minVal = Math.min(...allVals);
    const maxVal = Math.max(...allVals);
    const range = maxVal - minVal || 1;

    return datasets.map(data => {
      if (data.length < 2) return '';
      const points = data.map((val, i) => ({
        x: padding.left + (i / (data.length - 1)) * chartW,
        y: padding.top + chartH - ((val - minVal) / range) * chartH,
      }));

      let svg = `M ${points[0].x} ${points[0].y}`;
      for (let i = 1; i < points.length; i++) {
        const p = points[i - 1];
        const c = points[i];
        svg += ` C ${p.x + (c.x - p.x) / 3} ${p.y} ${c.x - (c.x - p.x) / 3} ${c.y} ${c.x} ${c.y}`;
      }
      return svg;
    });
  }, [datasets, width, height]);

  return (
    <Svg width={width} height={height}>
      {paths.map((path, i) =>
        path ? (
          <Path
            key={i}
            d={path}
            stroke={LINE_COLORS[i % LINE_COLORS.length]}
            strokeWidth={2.5}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null,
      )}
    </Svg>
  );
}
