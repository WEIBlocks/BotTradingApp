import React, {useCallback} from 'react';
import {TouchableOpacity, Text, StyleSheet} from 'react-native';
import Animated, {useAnimatedStyle, useSharedValue, withSpring} from 'react-native-reanimated';

interface TabChipProps {
  label: string;
  active?: boolean;
  onPress?: () => void;
}

const AnimatedTouch = Animated.createAnimatedComponent(TouchableOpacity);

export default function TabChip({label, active = false, onPress}: TabChipProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({transform: [{scale: scale.value}]}));

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.95);
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1);
  }, [scale]);

  return (
    <AnimatedTouch
      style={[styles.chip, active && styles.chipActive, animatedStyle]}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}>
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
    </AnimatedTouch>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderColor: 'rgba(16,185,129,0.4)',
  },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  labelActive: {
    color: '#10B981',
  },
});
