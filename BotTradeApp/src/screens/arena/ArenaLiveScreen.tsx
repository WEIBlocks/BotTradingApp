import React, {useState, useEffect, useRef, useCallback} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, ActivityIndicator, Alert, BackHandler, Modal} from 'react-native';
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
  const {gladiatorIds, sessionId: existingSessionId, durationSeconds} = route.params;
  const [session, setSession] = useState<ArenaSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [exitModalVisible, setExitModalVisible] = useState(false);
  const sessionIdRef = useRef<string | null>(existingSessionId ?? null);
  const allowLeaveRef = useRef(false);

  // Create session on mount (or resume existing)
  useEffect(() => {
    if (existingSessionId) {
      // Resume viewing an existing session
      arenaApi.getSession(existingSessionId)
        .then(s => {
          sessionIdRef.current = s.id;
          setSession(s);
        })
        .catch(() => Alert.alert('Error', 'Failed to load arena session.'))
        .finally(() => setLoading(false));
    } else {
      arenaApi.createSession(gladiatorIds, durationSeconds)
        .then(s => {
          sessionIdRef.current = s.id;
          setSession(s);
        })
        .catch(() => Alert.alert('Error', 'Failed to create arena session. Please try again.'))
        .finally(() => setLoading(false));
    }
  }, [gladiatorIds, existingSessionId]);

  // Intercept hardware back button
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (session?.status === 'completed') return false; // allow normal back
      setExitModalVisible(true);
      return true; // prevent default
    });
    return () => handler.remove();
  }, [session?.status]);

  // Intercept navigation gesture / header back
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      if (session?.status === 'completed' || allowLeaveRef.current) return; // allow
      e.preventDefault();
      setExitModalVisible(true);
    });
    return unsubscribe;
  }, [navigation, session?.status]);

  const handleLeave = useCallback(() => {
    setExitModalVisible(false);
    allowLeaveRef.current = true;
    navigation.goBack();
  }, [navigation]);

  const handleKeepRunning = useCallback(() => {
    setExitModalVisible(false);
    allowLeaveRef.current = true;
    navigation.navigate('Main' as any, {screen: 'Dashboard'});
  }, [navigation]);

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
            navigation.replace('ArenaResults', {winnerId: winner?.id ?? '', sessionId: s.id});
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
  const totalSec = session?.durationSeconds ?? 300;
  const elapsedSec = session?.elapsedSeconds ?? 0;
  const remainingSec = session?.remainingSeconds ?? 0;

  // Smart time formatting based on duration
  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return s > 0 ? `${m}m ${s}s` : `${m}m`;
    }
    if (seconds < 86400) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    return h > 0 ? `${d}d ${h}h` : `${d}d`;
  };

  const statusText = `${formatTime(Math.floor(elapsedSec))} / ${formatTime(totalSec)}`;

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

      {/* ── Exit Modal ── */}
      <Modal visible={exitModalVisible} transparent animationType="fade" onRequestClose={() => setExitModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Battle In Progress</Text>
            <Text style={styles.modalDesc}>
              The arena battle is still running. What would you like to do?
            </Text>
            <TouchableOpacity style={styles.modalBtnPrimary} onPress={handleKeepRunning} activeOpacity={0.8}>
              <View style={styles.modalBtnIcon}>
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                  <Path d="M5 3l14 9-14 9V3z" fill="#FFFFFF" />
                </Svg>
              </View>
              <View style={{flex: 1}}>
                <Text style={styles.modalBtnPrimaryText}>Keep Running in Background</Text>
                <Text style={styles.modalBtnSub}>Battle continues, you can return later</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalBtnDanger} onPress={handleLeave} activeOpacity={0.8}>
              <View style={[styles.modalBtnIcon, {backgroundColor: 'rgba(239,68,68,0.15)'}]}>
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                  <Rect x={4} y={4} width={16} height={16} rx={3} fill="#EF4444" />
                </Svg>
              </View>
              <View style={{flex: 1}}>
                <Text style={styles.modalBtnDangerText}>Leave Battle</Text>
                <Text style={styles.modalBtnSub}>Exit without stopping the battle</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setExitModalVisible(false)} activeOpacity={0.8}>
              <Text style={styles.modalBtnCancelText}>Stay Here</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Sticky Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => {
          if (session?.status === 'completed') { navigation.goBack(); }
          else { setExitModalVisible(true); }
        }} style={styles.headerBtn}>
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
            <Text style={styles.statusTitle}>Simulating: {statusText}</Text>
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
            <Text style={styles.xLabel}>START</Text>
            <Text style={[styles.xLabel, styles.xLabelNow]}>{formatTime(Math.floor(elapsedSec))} (NOW)</Text>
            <Text style={styles.xLabel}>{formatTime(totalSec)}</Text>
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

  // Exit Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#161B22', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center', marginBottom: 20,
  },
  modalTitle: {
    fontFamily: 'Inter-Bold', fontSize: 20, color: '#FFFFFF',
    textAlign: 'center', marginBottom: 8,
  },
  modalDesc: {
    fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.5)',
    textAlign: 'center', marginBottom: 24, lineHeight: 20,
  },
  modalBtnPrimary: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: 16,
    padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)',
  },
  modalBtnIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(16,185,129,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  modalBtnPrimaryText: {
    fontFamily: 'Inter-SemiBold', fontSize: 15, color: '#10B981',
  },
  modalBtnSub: {
    fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.35)',
    marginTop: 2,
  },
  modalBtnDanger: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: 'rgba(239,68,68,0.06)', borderRadius: 16,
    padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.15)',
  },
  modalBtnDangerText: {
    fontFamily: 'Inter-SemiBold', fontSize: 15, color: '#EF4444',
  },
  modalBtnCancel: {
    alignItems: 'center', paddingVertical: 14, marginTop: 4,
  },
  modalBtnCancelText: {
    fontFamily: 'Inter-SemiBold', fontSize: 15, color: 'rgba(255,255,255,0.5)',
  },
});
