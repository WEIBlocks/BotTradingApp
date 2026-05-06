import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import {ActiveBot} from '../../types';
import BotAvatar from './BotAvatar';

interface ActiveBotRowProps {
  bot: ActiveBot;
  onPress?: () => void;
}

export default function ActiveBotRow({bot, onPress}: ActiveBotRowProps) {
  const returnColor = bot.dailyReturn >= 0 ? '#10B981' : '#EF4444';
  const returnSign = bot.dailyReturn >= 0 ? '+' : '';

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.avatarWrap}>
        <BotAvatar
          size={38}
          avatarUrl={bot.avatarUrl}
          avatarColor={bot.avatarColor}
          avatarLetter={bot.avatarLetter}
        />
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{bot.name}</Text>
        <Text style={styles.pair}>{bot.pair}</Text>
      </View>
      <View style={styles.right}>
        <Text style={[styles.daily, {color: returnColor}]}>
          {returnSign}{bot.dailyReturn.toFixed(2)}%
        </Text>
        <View style={[styles.statusDot, {backgroundColor: bot.status === 'live' ? '#10B981' : '#F59E0B'}]} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  avatarWrap: {marginRight: 12},
  info: {flex: 1},
  name: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF'},
  pair: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2},
  right: {alignItems: 'flex-end'},
  daily: {fontFamily: 'Inter-SemiBold', fontSize: 15},
  statusDot: {width: 6, height: 6, borderRadius: 3, marginTop: 4, alignSelf: 'flex-end'},
});
