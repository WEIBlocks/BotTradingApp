import React, {useMemo} from 'react';
import Svg, {Path, Line} from 'react-native-svg';

const LINE_COLORS = ['#39FF14', '#A855F7', '#EC4899', '#22D3EE', '#EAB308'];

interface ArenaMultilineChartProps {
  datasets: number[][];
  width: number;
  height?: number;
}

export default function ArenaMultilineChart({datasets, width, height = 200}: ArenaMultilineChartProps) {
  const chartData = useMemo(() => {
    if (datasets.length === 0) return {paths: [], zeroY: null};

    const padding = {top: 12, bottom: 12, left: 4, right: 4};
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    // Normalize each dataset to % return from its first value
    // This ensures all bots start at 0% and diverge meaningfully
    const normalized = datasets.map(data => {
      if (data.length < 2) return [];
      const initial = data[0] || 10000;
      return data.map(v => ((v - initial) / initial) * 100);
    });

    const allVals = normalized.flat();
    if (allVals.length === 0) return {paths: [], zeroY: null};

    // Always include 0 in the range so the baseline is visible
    const minVal = Math.min(...allVals, 0);
    const maxVal = Math.max(...allVals, 0);
    const range = maxVal - minVal || 1;

    const toY = (val: number) => padding.top + chartH - ((val - minVal) / range) * chartH;
    const zeroY = toY(0);

    const paths = normalized.map(data => {
      if (data.length < 2) return '';
      const points = data.map((val, i) => ({
        x: padding.left + (i / (data.length - 1)) * chartW,
        y: toY(val),
      }));

      let svg = `M ${points[0].x} ${points[0].y}`;
      for (let i = 1; i < points.length; i++) {
        const p = points[i - 1];
        const c = points[i];
        svg += ` C ${p.x + (c.x - p.x) / 3} ${p.y} ${c.x - (c.x - p.x) / 3} ${c.y} ${c.x} ${c.y}`;
      }
      return svg;
    });

    return {paths, zeroY};
  }, [datasets, width, height]);

  const {paths, zeroY} = chartData;

  return (
    <Svg width={width} height={height}>
      {/* Zero baseline */}
      {zeroY !== null && (
        <Line
          x1={4} y1={zeroY} x2={width - 4} y2={zeroY}
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={1}
          strokeDasharray="4,4"
        />
      )}
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
