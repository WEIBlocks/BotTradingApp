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

      {/* Top row */}
      <View style={styles.topRow}>
        <BotAvatar
          size={36}
          avatarUrl={bot.avatarUrl}
          avatarColor={bot.avatarColor}
          avatarLetter={bot.avatarLetter}
        />
        <View style={styles.topRight}>
          <View style={styles.statusBadgeWrap}>
            <Badge
              label={bot.status === 'live' ? 'LIVE' : 'SHADOW'}
              variant={bot.status === 'live' ? 'green' : 'blue'}
              size="sm"
            />
          </View>
        </View>
      </View>

      {/* Name & Strategy */}
      <Text style={styles.name} numberOfLines={1}>{bot.name}</Text>
      <Text style={styles.strategy} numberOfLines={1}>{bot.strategy}</Text>
      {!!bot.subtitle && (
        <Text style={styles.subtitle} numberOfLines={2}>{bot.subtitle}</Text>
      )}
      {Array.isArray(bot.tags) && bot.tags.length > 0 && (
        <View style={styles.tagsRow}>
          {bot.tags.slice(0, 3).map((t, i) => (
            <View key={`${t}-${i}`} style={styles.tagChip}>
              <Text style={styles.tagText} numberOfLines={1}>{t}</Text>
            </View>
          ))}
        </View>
      )}

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
  // Push the LIVE/SHADOW badge down so it sits below the floating heart.
  statusBadgeWrap: {marginTop: 22},
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
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 10.5,
    lineHeight: 14,
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 6,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 8,
  },
  tagChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
  },
  tagText: {
    fontFamily: 'Inter-Medium',
    fontSize: 9,
    color: '#A78BFA',
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
