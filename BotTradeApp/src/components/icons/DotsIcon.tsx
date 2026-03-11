import React from 'react';
import Svg, {Circle} from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
}

export default function DotsIcon({size = 24, color = '#FFFFFF'}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="1.5" fill={color} />
      <Circle cx="6" cy="12" r="1.5" fill={color} />
      <Circle cx="18" cy="12" r="1.5" fill={color} />
    </Svg>
  );
}
