import React, {useEffect} from 'react';
import {View, StyleSheet, ViewStyle} from 'react-native';
import Animated, {useAnimatedStyle, useSharedValue, withTiming, Easing} from 'react-native-reanimated';

interface ProgressBarProps {
  progress: number; // 0 to 1
  color?: string;
  height?: number;
  style?: ViewStyle;
  animated?: boolean;
}

export default function ProgressBar({
  progress,
  color = '#10B981',
  height = 4,
  style,
  animated = true,
}: ProgressBarProps) {
  const width = useSharedValue(0);

  useEffect(() => {
    if (animated) {
      width.value = withTiming(progress, {duration: 500, easing: Easing.out(Easing.cubic)});
    } else {
      width.value = progress;
    }
  }, [progress, animated, width]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${width.value * 100}%`,
  }));

  return (
    <View style={[styles.track, {height}, style]}>
      <Animated.View style={[styles.fill, animatedStyle, {backgroundColor: color, height}]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 999,
    overflow: 'hidden',
  },
  fill: {
    borderRadius: 999,
  },
});
