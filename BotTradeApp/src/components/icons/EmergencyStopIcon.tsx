import React from 'react';
import Svg, {Path, Polygon} from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export default function EmergencyStopIcon({size = 24, color = '#EF4444', strokeWidth = 1.5}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Polygon
        points="12,3 22,21 2,21"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M12 10V14" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M12 17.5V18" stroke={color} strokeWidth={strokeWidth + 0.5} strokeLinecap="round" />
    </Svg>
  );
}
