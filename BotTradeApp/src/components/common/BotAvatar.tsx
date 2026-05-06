import React, {useState} from 'react';
import {View, Text, Image, StyleSheet, ViewStyle, StyleProp} from 'react-native';
import Svg, {Circle, Ellipse, Rect} from 'react-native-svg';
import {API_BASE_URL} from '../../config/api';

// Green robot mascot — shown as a fallback when no avatarUrl is set and the
// caller asks for `fallback="robot"`. Mirrors the shape used in the marketplace
// list so the look is consistent across screens.
function RobotMark({size}: {size: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Rect x={14} y={18} width={36} height={30} rx={8} fill="#10B981" opacity={0.9} />
      <Ellipse cx={24} cy={31} rx={4} ry={4} fill="#0F1117" />
      <Ellipse cx={40} cy={31} rx={4} ry={4} fill="#0F1117" />
      <Ellipse cx={25} cy={30} rx={1.5} ry={1.5} fill="#FFFFFF" />
      <Ellipse cx={41} cy={30} rx={1.5} ry={1.5} fill="#FFFFFF" />
      <Rect x={23} y={38} width={18} height={3} rx={1.5} fill="#0F1117" />
      <Rect x={30} y={10} width={4} height={8} rx={2} fill="#10B981" opacity={0.9} />
      <Circle cx={32} cy={9} r={3} fill="#34D399" />
      <Rect x={8} y={27} width={6} height={10} rx={3} fill="#10B981" opacity={0.7} />
      <Rect x={50} y={27} width={6} height={10} rx={3} fill="#10B981" opacity={0.7} />
    </Svg>
  );
}

// Resolves a stored avatarUrl to an absolute URL the device can fetch.
// The backend stores relative paths like "/uploads/abc.png"; we prepend the
// API base. Absolute http(s) URLs and data URIs pass through unchanged.
export function resolveAvatarUrl(url?: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^(https?:|data:|file:|content:)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) return `${API_BASE_URL}${trimmed}`;
  return `${API_BASE_URL}/${trimmed}`;
}

type Props = {
  size?: number;
  /** Optional uploaded image URL — wins over the letter+color fallback. */
  avatarUrl?: string | null;
  /** Fallback background color when no image. */
  avatarColor?: string;
  /** Fallback initial when no image. */
  avatarLetter?: string;
  /** Border radius — defaults to a square-ish 28% of size for a "rounded square" look. */
  borderRadius?: number;
  /** What to render when no image is available. Defaults to the letter+color
   *  circle. Pass `"robot"` to use the green mascot used in the marketplace. */
  fallback?: 'letter' | 'robot';
  style?: StyleProp<ViewStyle>;
};

export default function BotAvatar({
  size = 40,
  avatarUrl,
  avatarColor = '#6C63FF',
  avatarLetter = '?',
  borderRadius,
  fallback = 'letter',
  style,
}: Props) {
  // Fall back to the letter+color circle if the image fails to load (e.g. file
  // deleted on the server, or device offline).
  const [imgFailed, setImgFailed] = useState(false);
  const resolved = resolveAvatarUrl(avatarUrl);
  const radius = borderRadius ?? Math.round(size * 0.28);

  const baseStyle: ViewStyle = {
    width: size,
    height: size,
    borderRadius: radius,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: avatarColor,
  };

  if (resolved && !imgFailed) {
    return (
      <View style={[baseStyle, style]}>
        <Image
          source={{uri: resolved}}
          style={{width: size, height: size}}
          resizeMode="cover"
          onError={() => setImgFailed(true)}
        />
      </View>
    );
  }

  // Robot fallback — used on dashboard / portfolio / marketplace lists so a
  // bot without an uploaded image still shows the friendly mascot rather than
  // a letter circle.
  if (fallback === 'robot') {
    return (
      <View style={[baseStyle, {backgroundColor: '#0F1117'}, style]}>
        <RobotMark size={Math.round(size * 0.85)} />
      </View>
    );
  }

  // Letter fallback. Shrink the font as the avatar gets smaller.
  const fontSize = Math.max(10, Math.round(size * 0.42));
  return (
    <View style={[baseStyle, style]}>
      <Text style={[styles.letter, {fontSize, color: '#FFFFFF'}]}>
        {(avatarLetter || '?').slice(0, 2).toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  letter: {fontFamily: 'Inter-Bold'},
});
