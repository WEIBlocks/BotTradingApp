import React, {useCallback} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, ViewStyle} from 'react-native';
import Animated, {useAnimatedStyle, useSharedValue, withSpring} from 'react-native-reanimated';
import Badge from './Badge';
import {Bot} from '../../types';

interface BotCardProps {
  bot: Bot;
  onPress?: () => void;
  style?: ViewStyle;
  compact?: boolean;
}

const AnimatedTouch = Animated.createAnimatedComponent(TouchableOpacity);

export default function BotCard({bot, onPress, style, compact = false}: BotCardProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({transform: [{scale: scale.value}]}));

  const handlePressIn = useCallback(() => { scale.value = withSpring(0.97); }, [scale]);
  const handlePressOut = useCallback(() => { scale.value = withSpring(1); }, [scale]);

  const returnColor = bot.returnPercent >= 0 ? '#10B981' : '#EF4444';
  const returnSign = bot.returnPercent >= 0 ? '+' : '';

  return (
    <AnimatedTouch
      style={[styles.container, compact && styles.containerCompact, animatedStyle, style]}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
      accessibilityLabel={`${bot.name}, ${bot.strategy}, ${returnSign}${bot.returnPercent.toFixed(1)}% return, ${bot.risk} risk`}
      accessibilityRole="button">
      {/* Top row */}
      <View style={styles.topRow}>
        <View style={[styles.avatar, {backgroundColor: bot.avatarColor}]}>
          <Text style={styles.avatarLetter}>{bot.avatarLetter}</Text>
        </View>
        <View style={styles.topRight}>
          <Badge
            label={bot.status === 'live' ? 'LIVE' : 'SHADOW'}
            variant={bot.status === 'live' ? 'green' : 'blue'}
            size="sm"
          />
        </View>
      </View>

      {/* Name & Strategy */}
      <Text style={styles.name} numberOfLines={1}>{bot.name}</Text>
      <Text style={styles.strategy} numberOfLines={1}>{bot.strategy}</Text>

      {/* Return */}
      <Text style={[styles.returnValue, {color: returnColor}]}>
        {returnSign}{bot.returnPercent.toFixed(1)}%
      </Text>
      <Text style={styles.returnLabel}>30D Return</Text>

      {/* Risk badge */}
      <View style={styles.bottomRow}>
        <Badge
          label={bot.risk}
          variant={bot.risk === 'Low' || bot.risk === 'Very Low' ? 'green' : bot.risk === 'High' || bot.risk === 'Very High' ? 'red' : 'orange'}
          size="sm"
        />
        <Text style={styles.price}>
          {bot.price === 0 ? 'FREE' : `$${bot.price}/mo`}
        </Text>
      </View>
    </AnimatedTouch>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#161B22',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 14,
    flex: 1,
  },
  containerCompact: {
    padding: 12,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontFamily: 'Inter-Bold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  topRight: {alignItems: 'flex-end'},
  name: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  strategy: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 10,
  },
  returnValue: {
    fontFamily: 'Inter-Bold',
    fontSize: 22,
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  returnLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 10,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  price: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
  },
});
