import React, {useState, useCallback} from 'react';
import {View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import Svg, {Path, Circle, Rect} from 'react-native-svg';
import {RootStackParamList} from '../../types';
import {arenaApi, ArenaHistoryItem} from '../../services/arena';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

function BackArrow() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M15 19l-7-7 7-7" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function TrophySmall({color}: {color: string}) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d="M8 21h8M12 17v4M17 3H7v7a5 5 0 0010 0V3z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M17 4h3a1 1 0 011 1v2a4 4 0 01-4 4M7 4H4a1 1 0 00-1 1v2a4 4 0 004 4" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function SwordsIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M14.5 17.5L3 6V3h3l11.5 11.5" stroke="#EAB308" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M13 19l6-6M20.5 3.5l-6 6" stroke="#EAB308" strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'});
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

export default function ArenaHistoryScreen() {
  const navigation = useNavigation<NavProp>();
  const [history, setHistory] = useState<ArenaHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    arenaApi.getHistory()
      .then(setHistory)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []));

  const renderItem = ({item}: {item: ArenaHistoryItem}) => {
    const isFinished = item.status === 'completed' || item.status === 'killed';
    const isRunning = item.status === 'running' || item.status === 'paused';
    const winReturn = parseFloat(item.winnerReturn ?? '0');
    const returnColor = winReturn >= 0 ? '#10B981' : '#EF4444';
    const returnSign = winReturn >= 0 ? '+' : '';

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.75}
        onPress={() => {
          if (isRunning) {
            navigation.navigate('ArenaLive', {gladiatorIds: [], sessionId: item.id});
          } else if (isFinished) {
            navigation.navigate('ArenaResults', {winnerId: '', sessionId: item.id});
          }
        }}>
        {/* Left icon */}
        <View style={[styles.cardIcon, isRunning && styles.cardIconRunning]}>
          {isRunning ? (
            <View style={[styles.runningDot, item.status === 'paused' && {backgroundColor: '#F59E0B'}]} />
          ) : (
            <TrophySmall color={item.winnerColor || '#EAB308'} />
          )}
        </View>

        {/* Info */}
        <View style={styles.cardInfo}>
          <View style={styles.cardTopRow}>
            <Text style={styles.cardTitle}>
              {item.status === 'paused' ? 'Battle Paused' : isRunning ? 'Battle Running' : item.status === 'killed' ? (item.winnerName ? `Winner: ${item.winnerName}` : 'Battle Ended') : item.winnerName ? `Winner: ${item.winnerName}` : 'Battle Complete'}
            </Text>
            <View style={[styles.statusPill, isRunning ? styles.statusRunning : item.status === 'killed' ? styles.statusKilled : styles.statusCompleted]}>
              <Text style={[styles.statusText, isRunning ? styles.statusRunningText : item.status === 'killed' ? styles.statusKilledText : styles.statusCompletedText]}>
                {item.status === 'paused' ? 'PAUSED' : isRunning ? 'LIVE' : item.status === 'killed' ? 'ENDED' : 'DONE'}
              </Text>
            </View>
          </View>

          <View style={styles.cardMetaRow}>
            <Text style={styles.cardMeta}>
              {item.botCount} bots · {formatDuration(item.durationSeconds ?? 0)}
            </Text>
            {item.startedAt && (
              <Text style={styles.cardDate}>{formatDate(item.startedAt)}</Text>
            )}
          </View>

          {isFinished && item.winnerReturn && (
            <View style={styles.returnRow}>
              <Text style={[styles.returnValue, {color: returnColor}]}>
                {returnSign}{winReturn.toFixed(2)}% return
              </Text>
            </View>
          )}
        </View>

        {/* Chevron */}
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
          <Path d="M9 5l7 7-7 7" stroke="rgba(255,255,255,0.3)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <BackArrow />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Battle History</Text>
        <View style={{width: 38}} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#10B981" />
        </View>
      ) : history.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <SwordsIcon />
          </View>
          <Text style={styles.emptyTitle}>No Battles Yet</Text>
          <Text style={styles.emptyDesc}>Start your first arena battle to see results here.</Text>
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={() => navigation.navigate('ArenaSetup')}
            activeOpacity={0.8}>
            <Text style={styles.emptyBtnText}>Enter Arena</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0A0E14'},
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 54, paddingBottom: 14,
    backgroundColor: '#0A0E14',
  },
  headerBtn: {width: 38, height: 38, alignItems: 'center', justifyContent: 'center'},
  headerTitle: {fontFamily: 'Inter-Bold', fontSize: 18, color: '#FFFFFF'},
  list: {paddingHorizontal: 16, paddingBottom: 32},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40},

  // Card
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#111820', borderRadius: 18,
    padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  cardIcon: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: 'rgba(234,179,8,0.1)',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 14,
  },
  cardIconRunning: {
    backgroundColor: 'rgba(16,185,129,0.1)',
  },
  runningDot: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#10B981',
  },
  cardInfo: {flex: 1, marginRight: 8},
  cardTopRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardTitle: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF', flex: 1, marginRight: 8},
  statusPill: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6,
  },
  statusRunning: {backgroundColor: 'rgba(16,185,129,0.15)'},
  statusCompleted: {backgroundColor: 'rgba(255,255,255,0.06)'},
  statusKilled: {backgroundColor: 'rgba(239,68,68,0.12)'},
  statusText: {fontFamily: 'Inter-Bold', fontSize: 9, letterSpacing: 0.5},
  statusRunningText: {color: '#10B981'},
  statusCompletedText: {color: 'rgba(255,255,255,0.4)'},
  statusKilledText: {color: '#EF4444'},
  cardMetaRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 2,
  },
  cardMeta: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.35)'},
  cardDate: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.25)'},
  returnRow: {marginTop: 4},
  returnValue: {fontFamily: 'Inter-SemiBold', fontSize: 13},

  // Empty
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(234,179,8,0.1)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {fontFamily: 'Inter-Bold', fontSize: 18, color: '#FFFFFF', marginBottom: 8},
  emptyDesc: {fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginBottom: 24},
  emptyBtn: {
    backgroundColor: '#10B981', borderRadius: 12,
    paddingHorizontal: 24, paddingVertical: 12,
  },
  emptyBtnText: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF'},
});
