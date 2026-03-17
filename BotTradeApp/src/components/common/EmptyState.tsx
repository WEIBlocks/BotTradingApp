import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import Svg, {Path, Circle, Rect} from 'react-native-svg';

type IconType = 'bot' | 'trade' | 'chat' | 'chart' | 'bell';

const ICONS: Record<IconType, React.FC> = {
  bot: () => (
    <Svg width={48} height={48} viewBox="0 0 24 24" fill="none">
      <Rect x={7} y={8} width={10} height={9} rx={2.5} stroke="rgba(255,255,255,0.15)" strokeWidth={1.4} />
      <Path d="M10 8V6M14 8V6" stroke="rgba(255,255,255,0.15)" strokeWidth={1.4} strokeLinecap="round" />
      <Circle cx={10} cy={12} r={1} fill="rgba(255,255,255,0.15)" />
      <Circle cx={14} cy={12} r={1} fill="rgba(255,255,255,0.15)" />
      <Path d="M4 12H7M17 12H20" stroke="rgba(255,255,255,0.15)" strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  ),
  trade: () => (
    <Svg width={48} height={48} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={14} width={4} height={6} rx={1} stroke="rgba(255,255,255,0.15)" strokeWidth={1.4} />
      <Rect x={10} y={9} width={4} height={11} rx={1} stroke="rgba(255,255,255,0.15)" strokeWidth={1.4} />
      <Rect x={16} y={4} width={4} height={16} rx={1} stroke="rgba(255,255,255,0.15)" strokeWidth={1.4} />
    </Svg>
  ),
  chat: () => (
    <Svg width={48} height={48} viewBox="0 0 24 24" fill="none">
      <Path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" stroke="rgba(255,255,255,0.15)" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),
  chart: () => (
    <Svg width={48} height={48} viewBox="0 0 24 24" fill="none">
      <Path d="M3 17L9 11L13 15L21 7" stroke="rgba(255,255,255,0.15)" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M15 7H21V13" stroke="rgba(255,255,255,0.15)" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),
  bell: () => (
    <Svg width={48} height={48} viewBox="0 0 24 24" fill="none">
      <Path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9z" stroke="rgba(255,255,255,0.15)" strokeWidth={1.2} strokeLinejoin="round" />
      <Path d="M13.73 21a2 2 0 01-3.46 0" stroke="rgba(255,255,255,0.15)" strokeWidth={1.2} strokeLinecap="round" />
    </Svg>
  ),
};

interface Props {
  icon?: IconType;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({icon = 'bot', title, subtitle, actionLabel, onAction}: Props) {
  const Icon = ICONS[icon];
  return (
    <View style={styles.container}>
      <Icon />
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {actionLabel && onAction ? (
        <TouchableOpacity style={styles.actionBtn} onPress={onAction} activeOpacity={0.8}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  title: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 16,
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    lineHeight: 19,
  },
  actionBtn: {
    marginTop: 20,
    height: 40,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    color: '#10B981',
  },
});
