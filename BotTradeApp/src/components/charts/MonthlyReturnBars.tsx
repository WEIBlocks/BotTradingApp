import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {MonthlyReturn} from '../../types';

interface MonthlyReturnBarsProps {
  data: MonthlyReturn[];
}

export default function MonthlyReturnBars({data}: MonthlyReturnBarsProps) {
  const maxAbs = Math.max(...data.map(d => Math.abs(d.percent)), 1);

  return (
    <View style={styles.container}>
      {data.map(item => {
        const isPositive = item.percent >= 0;
        const barHeight = (Math.abs(item.percent) / maxAbs) * 60;
        const color = isPositive ? '#10B981' : '#EF4444';
        const sign = isPositive ? '+' : '';

        return (
          <View key={item.month} style={styles.barGroup}>
            <Text style={[styles.pct, {color}]}>{sign}{item.percent.toFixed(0)}%</Text>
            <View style={styles.barTrack}>
              <View style={[styles.bar, {height: barHeight, backgroundColor: color}]} />
            </View>
            <Text style={styles.month}>{item.month}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    paddingVertical: 8,
  },
  barGroup: {
    flex: 1,
    alignItems: 'center',
  },
  pct: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 9,
    marginBottom: 4,
  },
  barTrack: {
    width: '100%',
    height: 60,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bar: {
    width: '70%',
    borderRadius: 3,
    minHeight: 3,
  },
  month: {
    fontFamily: 'Inter-Medium',
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 4,
  },
});
