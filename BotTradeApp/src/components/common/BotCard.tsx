import React, {useCallback} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, ViewStyle} from 'react-native';
import Animated, {useAnimatedStyle, useSharedValue, withSpring} from 'react-native-reanimated';
import Badge from './Badge';
import BotAvatar from './BotAvatar';
import HeartIcon from '../icons/HeartIcon';
import {Bot} from '../../types';
import {useFavorites} from '../../context/FavoritesContext';

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

  const {isFavorite, toggle} = useFavorites();
  const favorited = isFavorite(bot.id);
  const handleToggleFav = useCallback(
    (e?: any) => {
      // Stop the press from bubbling to the card's onPress (which navigates).
      e?.stopPropagation?.();
      toggle(bot.id, bot).catch(() => {});
    },
    [bot, toggle],
  );

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
      {/* Heart toggle — absolute corner so it floats above content and never
          collides with the status badge below. */}
      <TouchableOpacity
        style={styles.heartCorner}
        onPress={handleToggleFav}
        hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
        accessibilityRole="button"
        accessibilityLabel={favorited ? 'Remove from favorites' : 'Add to favorites'}>
        <HeartIcon size={18} filled={favorited} color={favorited ? '#EF4444' : 'rgba(255,255,255,0.55)'} />
      </TouchableOpacity>

      {/* Avatar + status badge row */}
      <View style={styles.topRow}>
        <BotAvatar
          size={34}
          avatarUrl={bot.avatarUrl}
          avatarColor={bot.avatarColor}
          avatarLetter={bot.avatarLetter}
        />
        <Badge
          label={bot.status === 'live' ? 'LIVE' : 'SHADOW'}
          variant={bot.status === 'live' ? 'green' : 'blue'}
          size="sm"
        />
      </View>

      {/* Full-width name — wraps freely */}
      <Text style={styles.name}>{bot.name}</Text>
      <Text style={styles.strategy} numberOfLines={2}>{bot.strategy}</Text>

      {/* Stats row: return + risk + price */}
      <View style={styles.statsRow}>
        <Text style={[styles.returnValue, {color: returnColor}]}>
          {returnSign}{bot.returnPercent.toFixed(1)}%
        </Text>
        <Text style={styles.statSep}>·</Text>
        <Badge
          label={bot.risk}
          variant={bot.risk === 'Low' || bot.risk === 'Very Low' ? 'green' : bot.risk === 'High' || bot.risk === 'Very High' ? 'red' : 'orange'}
          size="sm"
        />
      </View>
      <View style={styles.bottomRow}>
        <Text style={styles.returnLabel}>30D Return</Text>
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
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 16,
    flex: 1,
    position: 'relative',
  },
  heartCorner: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 2,
    padding: 4,
  },
  containerCompact: {
    padding: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  name: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    color: '#FFFFFF',
    marginBottom: 3,
    lineHeight: 19,
  },
  strategy: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 10,
    lineHeight: 16,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  returnValue: {
    fontFamily: 'Inter-Bold',
    fontSize: 15,
    letterSpacing: -0.2,
  },
  statSep: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.2)',
  },
  returnLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  price: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
  },
});
