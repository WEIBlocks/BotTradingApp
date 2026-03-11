import React from 'react';
import Svg, {Path, Circle} from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  hasDot?: boolean;
}

export default function BellIcon({size = 24, color = '#FFFFFF', strokeWidth = 1.5, hasDot = false}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5.268 15C5.268 15 5 14.366 5 12.5C5 9.46243 7.46243 7 10.5 7H13.5C16.5376 7 19 9.46243 19 12.5C19 14.366 18.732 15 18.732 15C18.732 15 20 15.5 20 17H4C4 15.5 5.268 15 5.268 15Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Path d="M10 17C10 18.1046 10.8954 19 12 19C13.1046 19 14 18.1046 14 17" stroke={color} strokeWidth={strokeWidth} />
      {hasDot && <Circle cx="18" cy="6" r="3" fill="#EF4444" />}
    </Svg>
  );
}
