import React from 'react';
import Svg, {Path, Rect} from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export default function MicIcon({size = 24, color = '#FFFFFF', strokeWidth = 1.5}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="9" y="2" width="6" height="12" rx="3" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M5 10C5 14.4183 8.13401 18 12 18C15.866 18 19 14.4183 19 10" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M12 18V22M9 22H15" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}
