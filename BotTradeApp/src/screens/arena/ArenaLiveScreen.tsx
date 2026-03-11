import React from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../types';
import {mockGladiators} from '../../data/mockGladiators';
import {arenaDatasets} from '../../data/mockEquityData';
import ArenaMultilineChart from '../../components/charts/ArenaMultilineChart';
import Badge from '../../components/common/Badge';
import ChevronLeftIcon from '../../components/icons/ChevronLeftIcon';
import TrophyIcon from '../../components/icons/TrophyIcon';

const {width} = Dimensions.get('window');
const CHART_W = width - 40;

const LINE_COLORS = ['#39FF14', '#A855F7', '#EC4899', '#22D3EE', '#EAB308'];

type Props = NativeStackScreenProps<RootStackParamList, 'ArenaLive'>;

export default function ArenaLiveScreen({navigation, route}: Props) {
  const {gladiatorIds} = route.params;
  const activeGladiators = mockGladiators
    .filter(g => gladiatorIds.includes(g.id))
    .map((g, i) => ({...g, lineColor: LINE_COLORS[i]}));

  const datasets = activeGladiators.map(g => g.equityData || []);
  const currentDay = 22;
  const totalDays = 30;

  // Sort by current return for leaderboard
  const ranked = [...activeGladiators].sort((a, b) => (b.currentReturn || 0) - (a.currentReturn || 0));

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <ChevronLeftIcon size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerCaption}>BOT BATTLE</Text>
          <Text style={styles.headerTitle}>ARENA</Text>
        </View>
        <View style={{width: 40}} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Status */}
        <View style={styles.statusSection}>
          <Text style={styles.statusLabel}>STATUS</Text>
          <View style={styles.statusRow}>
            <Text style={styles.statusTitle}>Simulating: Day {currentDay}/{totalDays}</Text>
            <Badge label="LIVE BATTLE" variant="green" dot />
          </View>
          <View style={styles.dayProgressBar}>
            <View style={[styles.dayProgressFill, {width: `${(currentDay / totalDays) * 100}%` as any}]} />
          </View>
          <View style={styles.dayLabels}>
            <Text style={styles.dayLabel}>DAY 1</Text>
            <Text style={[styles.dayLabel, {color: '#10B981'}]}>DAY {currentDay} NOW</Text>
            <Text style={styles.dayLabel}>DAY {totalDays}</Text>
          </View>
        </View>

        {/* Chart */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>Live Performance</Text>
            <View style={styles.legend}>
              {activeGladiators.map((g, i) => (
                <View key={g.id} style={styles.legendItem}>
                  <View style={[styles.legendDot, {backgroundColor: LINE_COLORS[i]}]} />
                  <Text style={styles.legendName} numberOfLines={1}>{g.name.split(' ')[0]}</Text>
                </View>
              ))}
            </View>
          </View>
          <ArenaMultilineChart datasets={datasets} width={CHART_W - 32} height={220} />
          <View style={styles.xAxis}>
            <Text style={styles.xLabel}>Day 1</Text>
            <Text style={styles.xLabel}>Day 15</Text>
            <Text style={[styles.xLabel, {color: '#10B981'}]}>Day {currentDay}</Text>
          </View>
        </View>

        {/* Leaderboard */}
        <View style={styles.leaderboardSection}>
          <View style={styles.leaderboardHeader}>
            <TrophyIcon size={18} color="#EAB308" />
            <Text style={styles.leaderboardTitle}>BATTLE LEADERBOARD</Text>
          </View>
          {ranked.map((g, i) => {
            const rank = i + 1;
            const isFirst = rank === 1;
            const returnColor = (g.currentReturn || 0) >= 0 ? '#10B981' : '#EF4444';
            const returnSign = (g.currentReturn || 0) >= 0 ? '+' : '';

            return (
              <View key={g.id} style={[styles.leaderboardRow, isFirst && styles.leaderboardRowFirst]}>
                <View style={[styles.rankBadge, isFirst ? styles.rankBadgeFirst : styles.rankBadgeOther]}>
                  <Text style={[styles.rankText, isFirst ? styles.rankTextFirst : styles.rankTextOther]}>
                    {rank}
                  </Text>
                </View>
                <View style={[styles.gladiatorAvatar, {backgroundColor: g.avatarColor || '#10B981'}]}>
                  <Text style={styles.gladiatorAvatarText}>{g.name.charAt(0)}</Text>
                </View>
                <View style={styles.gladiatorDetails}>
                  <Text style={styles.gladiatorDetailName}>{g.name}</Text>
                  <Text style={styles.gladiatorDetailStrategy}>{g.strategy}</Text>
                </View>
                <View style={styles.returnSection}>
                  <Text style={[styles.returnValue, {color: returnColor}]}>
                    {returnSign}{(g.currentReturn || 0).toFixed(1)}%
                  </Text>
                  {isFirst && <TrophyIcon size={14} color="#EAB308" />}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0F1117'},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12},
  iconBtn: {width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center'},
  headerCenter: {alignItems: 'center'},
  headerCaption: {fontFamily: 'Inter-Medium', fontSize: 9, letterSpacing: 2, color: '#10B981', textTransform: 'uppercase'},
  headerTitle: {fontFamily: 'Inter-Bold', fontSize: 18, color: '#FFFFFF', letterSpacing: 1},
  scroll: {paddingHorizontal: 20, paddingBottom: 40},
  statusSection: {marginBottom: 16},
  statusLabel: {fontFamily: 'Inter-Medium', fontSize: 9, letterSpacing: 1, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 6},
  statusRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10},
  statusTitle: {fontFamily: 'Inter-Bold', fontSize: 18, color: '#FFFFFF'},
  dayProgressBar: {height: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden', marginBottom: 6},
  dayProgressFill: {height: '100%', backgroundColor: '#10B981', borderRadius: 2},
  dayLabels: {flexDirection: 'row', justifyContent: 'space-between'},
  dayLabel: {fontFamily: 'Inter-Medium', fontSize: 10, color: 'rgba(255,255,255,0.3)'},
  chartCard: {backgroundColor: '#161B22', borderRadius: 18, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)'},
  chartHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12},
  chartTitle: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF'},
  legend: {flexDirection: 'row', flexWrap: 'wrap', gap: 6, maxWidth: '55%'},
  legendItem: {flexDirection: 'row', alignItems: 'center', gap: 4},
  legendDot: {width: 8, height: 8, borderRadius: 4},
  legendName: {fontFamily: 'Inter-Medium', fontSize: 10, color: 'rgba(255,255,255,0.6)', maxWidth: 50},
  xAxis: {flexDirection: 'row', justifyContent: 'space-between', marginTop: 8},
  xLabel: {fontFamily: 'Inter-Medium', fontSize: 10, color: 'rgba(255,255,255,0.3)'},
  leaderboardSection: {backgroundColor: '#161B22', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)'},
  leaderboardHeader: {flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14},
  leaderboardTitle: {fontFamily: 'Inter-Bold', fontSize: 13, color: '#FFFFFF', letterSpacing: 0.8},
  leaderboardRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)'},
  leaderboardRowFirst: {backgroundColor: 'rgba(16,185,129,0.05)', borderRadius: 10, paddingHorizontal: 8, marginHorizontal: -8},
  rankBadge: {width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 10},
  rankBadgeFirst: {backgroundColor: '#10B981'},
  rankBadgeOther: {backgroundColor: 'rgba(255,255,255,0.08)'},
  rankText: {fontFamily: 'Inter-Bold', fontSize: 12},
  rankTextFirst: {color: '#FFFFFF'},
  rankTextOther: {color: 'rgba(255,255,255,0.5)'},
  gladiatorAvatar: {width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 10},
  gladiatorAvatarText: {fontFamily: 'Inter-Bold', fontSize: 14, color: '#FFFFFF'},
  gladiatorDetails: {flex: 1},
  gladiatorDetailName: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#FFFFFF'},
  gladiatorDetailStrategy: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 1},
  returnSection: {flexDirection: 'row', alignItems: 'center', gap: 6},
  returnValue: {fontFamily: 'Inter-Bold', fontSize: 15},
});
