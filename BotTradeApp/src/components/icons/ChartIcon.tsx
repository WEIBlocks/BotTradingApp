import React from 'react';
import Svg, {Rect} from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export default function ChartIcon({size = 24, color = '#FFFFFF', strokeWidth = 1.5}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="12" width="4" height="9" rx="1" stroke={color} strokeWidth={strokeWidth} />
      <Rect x="10" y="7" width="4" height="14" rx="1" stroke={color} strokeWidth={strokeWidth} />
      <Rect x="17" y="3" width="4" height="18" rx="1" stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}
