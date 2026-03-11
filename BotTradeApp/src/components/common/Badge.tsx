import React from 'react';
import {View, Text, StyleSheet, ViewStyle} from 'react-native';

type BadgeVariant = 'green' | 'blue' | 'red' | 'orange' | 'purple' | 'outline' | 'dark';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  style?: ViewStyle;
  dot?: boolean;
}

export default function Badge({label, variant = 'green', size = 'md', style, dot = false}: BadgeProps) {
  return (
    <View style={[styles.base, styles[variant], size === 'sm' && styles.small, style]}>
      {dot && <View style={[styles.dot, {backgroundColor: dotColors[variant]}]} />}
      <Text style={[styles.text, styles[`${variant}Text`], size === 'sm' && styles.smallText]}>
        {label}
      </Text>
    </View>
  );
}

const dotColors: Record<BadgeVariant, string> = {
  green: '#10B981',
  blue: '#0D7FF2',
  red: '#EF4444',
  orange: '#F97316',
  purple: '#A855F7',
  outline: '#FFFFFF',
  dark: '#FFFFFF',
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  small: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  text: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  smallText: {fontSize: 10},

  // Variants
  green: {backgroundColor: 'rgba(16,185,129,0.15)'},
  greenText: {color: '#10B981'},
  blue: {backgroundColor: 'rgba(13,127,242,0.15)'},
  blueText: {color: '#0D7FF2'},
  red: {backgroundColor: 'rgba(239,68,68,0.15)'},
  redText: {color: '#EF4444'},
  orange: {backgroundColor: 'rgba(249,115,22,0.15)'},
  orangeText: {color: '#F97316'},
  purple: {backgroundColor: 'rgba(168,85,247,0.15)'},
  purpleText: {color: '#A855F7'},
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  outlineText: {color: 'rgba(255,255,255,0.8)'},
  dark: {backgroundColor: 'rgba(255,255,255,0.08)'},
  darkText: {color: 'rgba(255,255,255,0.7)'},
});
