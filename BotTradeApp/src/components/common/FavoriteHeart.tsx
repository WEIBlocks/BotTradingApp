import React, {useCallback} from 'react';
import {TouchableOpacity, ViewStyle, StyleProp} from 'react-native';
import HeartIcon from '../icons/HeartIcon';
import {useFavorites} from '../../context/FavoritesContext';
import type {Bot} from '../../types';

// Drop-in heart toggle used on bot cards. Subscribes to FavoritesContext so
// every instance stays in sync without prop drilling.

type Props = {
  botId: string;
  /** Optional bot object — passed to context.toggle so the favorites list can
   *  update optimistically without waiting for refresh(). */
  bot?: Bot;
  size?: number;
  style?: StyleProp<ViewStyle>;
  /** Color when the bot is NOT favorited (the "outline" state). */
  inactiveColor?: string;
  /** Color when favorited (filled). */
  activeColor?: string;
};

export default function FavoriteHeart({
  botId,
  bot,
  size = 22,
  style,
  inactiveColor = 'rgba(255,255,255,0.6)',
  activeColor = '#EF4444',
}: Props) {
  const {isFavorite, toggle} = useFavorites();
  const favorited = isFavorite(botId);

  const handlePress = useCallback(
    (e?: any) => {
      // Stop the press from bubbling to a parent TouchableOpacity (card press).
      e?.stopPropagation?.();
      toggle(botId, bot).catch(() => {});
    },
    [bot, botId, toggle],
  );

  return (
    <TouchableOpacity
      onPress={handlePress}
      hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
      accessibilityRole="button"
      accessibilityLabel={favorited ? 'Remove from favorites' : 'Add to favorites'}
      style={style}>
      <HeartIcon size={size} filled={favorited} color={favorited ? activeColor : inactiveColor} />
    </TouchableOpacity>
  );
}
