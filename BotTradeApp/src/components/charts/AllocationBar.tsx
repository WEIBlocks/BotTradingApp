import React from 'react';
import {View, StyleSheet} from 'react-native';
import {AllocationItem} from '../../types';

interface AllocationBarProps {
  data: AllocationItem[];
  height?: number;
}

export default function AllocationBar({data, height = 8}: AllocationBarProps) {
  return (
    <View style={[styles.track, {height}]}>
      {data.map((item, i) => (
        <View
          key={item.label}
          style={{
            flex: item.percent,
            backgroundColor: item.color,
            borderTopLeftRadius: i === 0 ? 999 : 0,
            borderBottomLeftRadius: i === 0 ? 999 : 0,
            borderTopRightRadius: i === data.length - 1 ? 999 : 0,
            borderBottomRightRadius: i === data.length - 1 ? 999 : 0,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    overflow: 'hidden',
    gap: 2,
  },
});
