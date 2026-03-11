import React from 'react';
import {View, StyleSheet, ViewStyle} from 'react-native';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  variant?: 'base' | 'elevated' | 'bordered';
  glowColor?: string;
  padding?: number;
}

export default function Card({children, style, variant = 'base', glowColor, padding = 16}: CardProps) {
  const containerStyles: ViewStyle[] = [styles.base, styles[variant]];

  if (glowColor) {
    containerStyles.push({
      shadowColor: glowColor,
      shadowOffset: {width: 0, height: 0},
      shadowOpacity: 0.3,
      shadowRadius: 16,
      elevation: 8,
    });
  }

  return (
    <View style={[containerStyles, {padding}, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: '#161B22',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  elevated: {
    backgroundColor: '#1C2333',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  bordered: {
    backgroundColor: '#161B22',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
  },
});
