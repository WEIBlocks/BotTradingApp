import React from 'react';
import Svg, {Path} from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export default function EyeOffIcon({size = 24, color = '#FFFFFF', strokeWidth = 1.5}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 3L21 21M10.5 10.5C10.1833 10.8245 10 11.2611 10 11.7143C10 12.9768 11.3431 14 13 14C13.4706 14 13.9157 13.9009 14.3 13.7246M7.2 7.2C5.0 8.6 3 11 3 11C3 11 6 17 12 17C13.7 17 15.2 16.5 16.5 15.7M9.9 5.1C10.6 5 11.3 5 12 5C18 5 21 11 21 11C21 11 20.2 12.7 18.8 14.2" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}
