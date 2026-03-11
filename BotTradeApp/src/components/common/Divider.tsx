import React from 'react';
import {View, Text, StyleSheet} from 'react-native';

interface DividerProps {
  label?: string;
}

export default function Divider({label}: DividerProps) {
  if (!label) {
    return <View style={styles.line} />;
  }
  return (
    <View style={styles.row}>
      <View style={styles.lineFlex} />
      <Text style={styles.label}>{label}</Text>
      <View style={styles.lineFlex} />
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  lineFlex: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    paddingHorizontal: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
