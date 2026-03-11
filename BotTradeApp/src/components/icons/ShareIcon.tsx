import React from 'react';
import Svg, {Path, Circle} from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export default function ShareIcon({size = 24, color = '#FFFFFF', strokeWidth = 1.5}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="18" cy="5" r="2.5" stroke={color} strokeWidth={strokeWidth} />
      <Circle cx="6" cy="12" r="2.5" stroke={color} strokeWidth={strokeWidth} />
      <Circle cx="18" cy="19" r="2.5" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M8.5 10.5L15.5 6.5M8.5 13.5L15.5 17.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}
