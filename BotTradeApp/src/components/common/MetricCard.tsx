import React from 'react';
import {View, Text, StyleSheet, ViewStyle} from 'react-native';

interface MetricCardProps {
  label: string;
  value: string;
  valueColor?: string;
  subtitle?: string;
  style?: ViewStyle;
}

export default function MetricCard({label, value, valueColor = '#FFFFFF', subtitle, style}: MetricCardProps) {
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, {color: valueColor}]}>{value}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1C2333',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 6,
  },
  value: {
    fontFamily: 'Inter-Bold',
    fontSize: 20,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
});
