import React from 'react';
import Svg, {Path, Rect} from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export default function CopyIcon({size = 24, color = '#FFFFFF', strokeWidth = 1.5}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="9" y="9" width="12" height="12" rx="2" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M15 9V5C15 3.89543 14.1046 3 13 3H5C3.89543 3 3 3.89543 3 5V13C3 14.1046 3.89543 15 5 15H9" stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}
