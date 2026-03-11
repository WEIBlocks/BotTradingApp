import React from 'react';
import Svg, {Path} from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export default function TrophyIcon({size = 24, color = '#EAB308', strokeWidth = 1.5}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 16C15.3137 16 18 13.3137 18 10V4H6V10C6 13.3137 8.68629 16 12 16Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Path d="M12 16V20M8 20H16" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M6 6H2C2 9 4 10 6 10" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M18 6H22C22 9 20 10 18 10" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
