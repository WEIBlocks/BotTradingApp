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

  const statusColor = bot.status === 'live' ? '#10B981' : '#F59E0B';

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.avatarWrap}>
        <BotAvatar
          size={36}
          avatarUrl={bot.avatarUrl}
          avatarColor={bot.avatarColor}
          avatarLetter={bot.avatarLetter}
        />
      </View>
      <View style={styles.info}>
        {/* Full-width name row — wraps freely */}
        <Text style={styles.name}>{bot.name}</Text>
        {/* Stats row below */}
        <View style={styles.metaRow}>
          <View style={[styles.statusDot, {backgroundColor: statusColor}]} />
          <Text style={styles.pair}>{bot.pair}</Text>
          <Text style={styles.sep}>·</Text>
          <Text style={[styles.daily, {color: returnColor}]}>
            {returnSign}{bot.dailyReturn.toFixed(2)}%
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  avatarWrap: {marginRight: 12, flexShrink: 0},
  info: {flex: 1},
  name: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#FFFFFF', lineHeight: 18, marginBottom: 3},
  metaRow: {flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap'},
  statusDot: {width: 5, height: 5, borderRadius: 3, flexShrink: 0},
  pair: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.4)'},
  sep: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.2)'},
  daily: {fontFamily: 'Inter-SemiBold', fontSize: 12},
});
