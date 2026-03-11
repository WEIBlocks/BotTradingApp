import React from 'react';
import Svg, {Path, Rect, Circle} from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export default function BotIcon({size = 24, color = '#FFFFFF', strokeWidth = 1.5}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="4" y="9" width="16" height="10" rx="2" stroke={color} strokeWidth={strokeWidth} />
      <Circle cx="9" cy="14" r="1.5" fill={color} />
      <Circle cx="15" cy="14" r="1.5" fill={color} />
      <Path d="M12 9V6M9 6H15" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M7 19V21M17 19V21" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}
