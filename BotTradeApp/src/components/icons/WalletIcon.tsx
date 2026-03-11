import React from 'react';
import Svg, {Path, Circle} from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export default function WalletIcon({size = 24, color = '#FFFFFF', strokeWidth = 1.5}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 7C4 5.89543 4.89543 5 6 5H20C21.1046 5 22 5.89543 22 7V17C22 18.1046 21.1046 19 20 19H4C2.89543 19 2 18.1046 2 17V7Z" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M16 12H18" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Circle cx="17" cy="12" r="1" fill={color} />
    </Svg>
  );
}
