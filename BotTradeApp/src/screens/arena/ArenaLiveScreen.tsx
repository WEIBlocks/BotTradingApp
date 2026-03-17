import React, {useState, useEffect, useRef} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, ActivityIndicator, Alert} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import Svg, {Path, Circle, Rect, Ellipse, Polygon} from 'react-native-svg';
import {RootStackParamList} from '../../types';
import {arenaApi, ArenaSession} from '../../services/arena';
import ArenaMultilineChart from '../../components/charts/ArenaMultilineChart';

const {width} = Dimensions.get('window');
const LINE_COLORS = ['#39FF14', '#A855F7', '#EC4899', '#22D3EE', '#EAB308'];

type Props = NativeStackScreenProps<RootStackParamList, 'ArenaLive'>;

// ─── Icons ─────────────────────────────────────────────────────────────────────

function BackArrow() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M15 19l-7-7 7-7" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function InfoCircleIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9.5} stroke="#10B981" strokeWidth={1.5} />
      <Path d="M12 16v-4M12 8h.01" stroke="#10B981" strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

// Bar chart icon for leaderboard heading
function BarChartIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={12} width={4} height={9} rx={1} fill="#10B981" />
      <Rect x={10} y={7} width={4} height={14} rx={1} fill="#10B981" />
      <Rect x={17} y={3} width={4} height={18} rx={1} fill="#10B981" />
    </Svg>
  );
}

function TrophySmall() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Path d="M8 21h8M12 17v4M17 3H7v7a5 5 0 0010 0V3z" stroke="#EAB308" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M17 4h3a1 1 0 011 1v2a4 4 0 01-4 4M7 4H4a1 1 0 00-1 1v2a4 4 0 004 4" stroke="#EAB308" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Robot face avatar matching arena setup style
function BotFaceAvatar({color, size = 44}: {color: string; size?: number}) {
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: '#1A1F2E',
      borderWidth: 1.5, borderColor: color + '55',
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    }}>
      <Svg width={size * 0.68} height={size * 0.68} viewBox="0 0 64 64" fill="none">
        <Rect x={12} y={18} width={40} height={32} rx={10} fill={color} opacity={0.82} />
        <Ellipse cx={23} cy={32} rx={5} ry={5} fill="#0A0E14" />
        <Ellipse cx={41} cy={32} rx={5} ry={5} fill="#0A0E14" />
        <Ellipse cx={24.5} cy={30.5} rx={2} ry={2} fill="#FFFFFF" />
        <Ellipse cx={42.5} cy={30.5} rx={2} ry={2} fill="#FFFFFF" />
        <Rect x={22} y={40} width={20} height={3.5} rx={1.75} fill="#0A0E14" />
        <Rect x={29} y={8} width={6} height={11} rx={3} fill={color} opacity={0.7} />
        <Circle cx={32} cy={7} r={4} fill={color} />
        <Rect x={4} y={27} width={8} height={11} rx={4} fill={color} opacity={0.5} />
        <Rect x={52} y={27} width={8} height={11} rx={4} fill={color} opacity={0.5} />
      </Svg>
    </View>
  );
}

function rankLabel(rank: number): string {
  if (rank === 1) return '1st';
  if (rank === 2) return '2nd';
  if (rank === 3) return '3rd';
  return `${rank}th`;
}

// ─── Screen ────────────────────────────────────────────────────────────────────

export default function ArenaLiveScreen({navigation, route}: Props) {
  const {gladiatorIds} = route.params;
  const [session, setSession] = useState<ArenaSession | null>(null);
  const [loading, setLoading] = useState(true);
  const sessionIdRef = useRef<string | null>(null);

  // Create session on mount
  useEffect(() => {
    arenaApi.createSession(gladiatorIds)
      .then(s => {
        sessionIdRef.current = s.id;
        setSession(s);
      })
      .catch(() => Alert.alert('Error', 'Failed to create arena session. Please try again.'))
      .finally(() => setLoading(false));
  }, [gladiatorIds]);

  // Poll for updates every 5 seconds
  useEffect(() => {
    if (!sessionIdRef.current) return;
    const interval = setInterval(() => {
      if (!sessionIdRef.current) return;
      arenaApi.getSession(sessionIdRef.current)
        .then(s => {
          setSession(s);
          if (s.status === 'completed') {
            clearInterval(interval);
            const winner = [...s.gladiators].sort((a, b) => (b.currentReturn || 0) - (a.currentReturn || 0))[0];
            navigation.replace('ArenaResults', {winnerId: winner?.id ?? ''});
          }
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [session?.id, navigation]);

  const activeGladiators = (session?.gladiators ?? [])
    .map((g, i) => ({...g, lineColor: LINE_COLORS[i]}));

  const datasets = activeGladiators.map(g => g.equityData || []);
  const progressPct = (session?.progress ?? 0) * 100;
  const totalDays = Math.ceil((session?.durationSeconds ?? 300) / 86400) || 30;
  const currentDay = Math.ceil((session?.elapsedSeconds ?? 0) / 86400) || 1;

  const ranked = [...activeGladiators].sort((a, b) => (b.currentReturn || 0) - (a.currentReturn || 0));
  const chartWidth = width - 40;

  if (loading) {
    return (
      <View style={[styles.container, {alignItems: 'center', justifyContent: 'center'}]}>
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  return (
    <View style={styles.container}>

      {/* ── Sticky Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <BackArrow />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>BOT BATTLE ARENA</Text>
        <TouchableOpacity style={styles.headerBtn}>
          <InfoCircleIcon />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* ── STATUS ── */}
        <View style={styles.statusSection}>
          <Text style={styles.statusLabel}>STATUS</Text>
          <View style={styles.statusRow}>
            <Text style={styles.statusTitle}>Simulating: Day {currentDay}/{totalDays}</Text>
            {/* LIVE BATTLE pill */}
            <View style={styles.livePill}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE BATTLE</Text>
            </View>
          </View>
          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, {width: `${progressPct}%` as any}]} />
          </View>
        </View>

        {/* ── CHART SECTION ── */}
        <View style={styles.chartSection}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>Live Performance</Text>
            {/* Dots-only legend */}
            <View style={styles.dotsRow}>
              {activeGladiators.map((g, i) => (
                <View key={g.id} style={[styles.legendDot, {backgroundColor: LINE_COLORS[i]}]} />
              ))}
            </View>
          </View>
          <ArenaMultilineChart datasets={datasets} width={chartWidth} height={220} />
          {/* X-axis labels */}
          <View style={styles.xAxis}>
            <Text style={styles.xLabel}>DAY 1</Text>
            <Text style={styles.xLabel}>DAY 15</Text>
            <Text style={[styles.xLabel, styles.xLabelNow]}>DAY {currentDay} (NOW)</Text>
            <Text style={styles.xLabel}>DAY {totalDays}</Text>
          </View>
        </View>

        {/* ── BATTLE LEADERBOARD ── */}
        <View style={styles.leaderboardHeader}>
          <BarChartIcon />
          <Text style={styles.leaderboardTitle}>BATTLE LEADERBOARD</Text>
        </View>

        {ranked.map((g, i) => {
          const rank = i + 1;
          const isFirst = rank === 1;
          const returnColor = (g.currentReturn || 0) >= 0 ? '#10B981' : '#EF4444';
          const returnSign = (g.currentReturn || 0) >= 0 ? '+' : '';
          const accentColor = LINE_COLORS[activeGladiators.findIndex(a => a.id === g.id)] || '#10B981';

          return (
            <View key={g.id} style={[styles.leaderRow, isFirst && styles.leaderRowFirst]}>
              {/* Rank + accent line below it */}
              <View style={styles.rankBlock}>
                <Text style={[styles.rankText, isFirst && styles.rankTextFirst]}>
                  {rankLabel(rank)}
                </Text>
                <View style={[styles.rankAccent, {backgroundColor: accentColor}]} />
              </View>

              {/* Avatar */}
              <BotFaceAvatar color={g.avatarColor || accentColor} size={44} />

              {/* Name + strategy */}
              <View style={styles.leaderInfo}>
                <Text style={styles.leaderName}>{g.name}</Text>
                <Text style={styles.leaderStrategy}>{g.strategy.toUpperCase()}</Text>
              </View>

              {/* Return + trophy */}
              <View style={styles.returnBlock}>
                <Text style={[styles.returnValue, {color: returnColor}]}>
                  {returnSign}{(g.currentReturn || 0).toFixed(2)}%
                </Text>
                {isFirst && (
                  <>
                    <View style={styles.returnSubRow}>
                      <Text style={styles.returnSubLabel}>SIMULATED P&amp;L</Text>
                      <TrophySmall />
                    </View>
                  </>
                )}
              </View>
            </View>
          );
        })}

        <View style={{height: 40}} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0A0E14'},

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 54, paddingBottom: 12,
    backgroundColor: '#0A0E14',
  },
  headerBtn: {
    width: 38, height: 38, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'Inter-Bold', fontSize: 14, color: '#FFFFFF',
    letterSpacing: 1.8, textTransform: 'uppercase',
  },

  scroll: {paddingHorizontal: 20, paddingBottom: 20},

  // Status
  statusSection: {marginBottom: 20},
  statusLabel: {
    fontFamily: 'Inter-Medium', fontSize: 10, letterSpacing: 1.2,
    color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 8,
  },
  statusRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 14,
  },
  statusTitle: {fontFamily: 'Inter-Bold', fontSize: 18, color: '#FFFFFF', flex: 1, marginRight: 12},
  livePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)',
  },
  liveDot: {width: 5, height: 5, borderRadius: 3, backgroundColor: '#10B981'},
  liveText: {fontFamily: 'Inter-Bold', fontSize: 9, color: '#10B981', letterSpacing: 0.6},
  progressTrack: {
    height: 8, backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 999, overflow: 'hidden',
  },
  progressFill: {height: 8, backgroundColor: '#10B981', borderRadius: 999},

  // Chart
  chartSection: {marginBottom: 28},
  chartHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 12,
  },
  chartTitle: {fontFamily: 'Inter-SemiBold', fontSize: 16, color: '#FFFFFF'},
  dotsRow: {flexDirection: 'row', gap: 8, alignItems: 'center'},
  legendDot: {width: 10, height: 10, borderRadius: 5},
  xAxis: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginTop: 10,
  },
  xLabel: {
    fontFamily: 'Inter-Medium', fontSize: 10,
    color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase',
  },
  xLabelNow: {color: '#10B981'},

  // Leaderboard heading
  leaderboardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12,
  },
  leaderboardTitle: {
    fontFamily: 'Inter-Bold', fontSize: 14, color: '#FFFFFF', letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // Leaderboard row card
  leaderRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#111820',
    borderRadius: 18,
    marginBottom: 10,
    paddingVertical: 14, paddingHorizontal: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  leaderRowFirst: {
    borderColor: 'rgba(16,185,129,0.3)',
    backgroundColor: 'rgba(16,185,129,0.05)',
  },

  // Rank block with accent underline
  rankBlock: {
    width: 40, alignItems: 'center', marginRight: 12,
  },
  rankText: {
    fontFamily: 'Inter-Bold', fontSize: 16, color: 'rgba(255,255,255,0.35)',
    textAlign: 'center', marginBottom: 5,
  },
  rankTextFirst: {color: '#FFFFFF'},
  rankAccent: {width: 22, height: 3, borderRadius: 2},

  // Avatar spacing
  leaderInfo: {flex: 1, marginLeft: 12},
  leaderName: {fontFamily: 'Inter-Bold', fontSize: 15, color: '#FFFFFF', marginBottom: 3},
  leaderStrategy: {
    fontFamily: 'Inter-Medium', fontSize: 10,
    color: 'rgba(255,255,255,0.35)', letterSpacing: 0.6,
  },

  // Return
  returnBlock: {alignItems: 'flex-end'},
  returnValue: {fontFamily: 'Inter-Bold', fontSize: 16, letterSpacing: -0.3},
  returnSubRow: {flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3},
  returnSubLabel: {
    fontFamily: 'Inter-Medium', fontSize: 9,
    color: 'rgba(255,255,255,0.35)', letterSpacing: 0.5,
  },
});
