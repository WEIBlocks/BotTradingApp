import React from 'react';
import Svg, {Path, Rect} from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export default function GiftIcon({size = 24, color = '#10B981', strokeWidth = 1.5}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="8" width="18" height="4" rx="1" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M12 8V21M3 12H21M5 21H19C19.5523 21 20 20.5523 20 20V12H4V20C4 20.5523 4.44772 21 5 21Z" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M12 8C12 8 10 5 9 5C8 5 7 6 7 7C7 8 8 8 9 8H12Z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Path d="M12 8C12 8 14 5 15 5C16 5 17 6 17 7C17 8 16 8 15 8H12Z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
    </Svg>
  );
}
