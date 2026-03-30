import React, {useState, useCallback, useRef, useEffect} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, AppState} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';
import {RootStackParamList} from '../../types';
import {botsService} from '../../services/bots';
import Svg, {Path, Rect as SvgRect} from 'react-native-svg';
import MiniLineChart from '../../components/charts/MiniLineChart';
import Badge from '../../components/common/Badge';
import ChevronLeftIcon from '../../components/icons/ChevronLeftIcon';
import ChevronRightIcon from '../../components/icons/ChevronRightIcon';
import {useToast} from '../../context/ToastContext';

type Props = NativeStackScreenProps<RootStackParamList, 'ShadowMode'>;

interface ShadowSession {
  id: string;
  botId: string;
  botName: string;
  botStrategy: string;
  botAvatarLetter: string;
  botAvatarColor: string;
  virtualBalance: string;
  currentBalance: string;
  durationDays: number;
  startedAt: string;
  endsAt: string;
  status: string;
  totalTrades: number;
  winCount: number;
  totalReturn: string;
  dailyPerformance?: Record<string, {trades: number; pnl: number; balance: number}>;
}

const POLL_INTERVAL = 15000; // 15 seconds

export default function ShadowModeScreen({navigation}: Props) {
  const {alert: showAlert, showConfirm} = useToast();
  const [sessions, setSessions] = useState<ShadowSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Store historical balance snapshots per session for the mini chart
  const balanceHistory = useRef<Record<string, number[]>>({});

  const fetchSessions = useCallback(async (isInitial = false) => {
    try {
      const res: any = await botsService.getShadowSessions();
      const items: ShadowSession[] = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
      setSessions(items);

      // Build up balance history for mini charts
      items.forEach(s => {
        const current = parseFloat(s.currentBalance) || parseFloat(s.virtualBalance);
        if (!balanceHistory.current[s.id]) {
          // Seed with initial balance + current
          const initial = parseFloat(s.virtualBalance);
          balanceHistory.current[s.id] = initial !== current ? [initial, current] : [initial];
        } else {
          const hist = balanceHistory.current[s.id];
          const last = hist[hist.length - 1];
          // Only push if changed to avoid flat lines from no-trade polls
          if (current !== last) {
            hist.push(current);
          }
          // Keep max 30 points
          if (hist.length > 30) hist.shift();
        }
      });
    } catch {
      if (isInitial) {
        showAlert('Error', 'Failed to load shadow sessions.');
      }
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  // Fetch on focus + start polling, stop when unfocused
  useFocusEffect(
    useCallback(() => {
      fetchSessions(true);
      pollRef.current = setInterval(() => fetchSessions(false), POLL_INTERVAL);
      return () => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      };
    }, [fetchSessions]),
  );

  // Pause polling when app goes to background
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active' && !pollRef.current) {
        fetchSessions(false);
        pollRef.current = setInterval(() => fetchSessions(false), POLL_INTERVAL);
      } else if (state !== 'active' && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    });
    return () => sub.remove();
  }, [fetchSessions]);

  const handlePauseShadow = useCallback((sessionId: string) => {
    showConfirm({
      title: 'Pause Shadow Mode',
      message: 'Pause this shadow session? No virtual trades will be placed while paused.',
      confirmText: 'Pause',
      onConfirm: async () => {
        setActionLoadingId(sessionId);
        try {
          await botsService.pauseShadowSession(sessionId);
          fetchSessions(false);
        } catch { showAlert('Error', 'Failed to pause session.'); }
        setActionLoadingId(null);
      },
    });
  }, [fetchSessions, showConfirm, showAlert]);

  const handleResumeShadow = useCallback(async (sessionId: string) => {
    setActionLoadingId(sessionId);
    try {
      await botsService.resumeShadowSession(sessionId);
      fetchSessions(false);
    } catch { showAlert('Error', 'Failed to resume session.'); }
    setActionLoadingId(null);
  }, [fetchSessions, showAlert]);

  const handleStopShadow = useCallback((sessionId: string) => {
    showConfirm({
      title: 'Stop Shadow Mode',
      message: 'Stop and cancel this shadow session? This cannot be undone.',
      confirmText: 'Stop',
      destructive: true,
      onConfirm: async () => {
        setActionLoadingId(sessionId);
        try {
          await botsService.stopShadowSession(sessionId);
          fetchSessions(false);
        } catch { showAlert('Error', 'Failed to stop session.'); }
        setActionLoadingId(null);
      },
    });
  }, [fetchSessions, showConfirm, showAlert]);

  const hasRunningSessions = sessions.some(s => s.status === 'running');

  if (loading) {
    return (
      <View style={[styles.container, {alignItems: 'center', justifyContent: 'center'}]}>
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeftIcon size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Shadow Mode</Text>
        <View style={{width: 40}} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.subtitle}>
          Running virtual simulations with your portfolio size. No real trades executed.
        </Text>

        {hasRunningSessions && (
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>Live — auto-updating every 15s</Text>
          </View>
        )}

        {sessions.length === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={{fontSize: 48, marginBottom: 16}}>🧪</Text>
            <Text style={styles.emptyTitle}>No shadow sessions yet</Text>
            <Text style={styles.emptySubtitle}>
              Test any bot with virtual money before going live.{'\n'}No risk — just learning.
            </Text>
            <TouchableOpacity
              style={{backgroundColor: '#10B981', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10, marginTop: 16}}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('AllBots' as any)}>
              <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF'}}>Browse Bots</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Sort: running first, then paused, then completed/cancelled, newest first within each */}
        {[...sessions].sort((a, b) => {
          const statusOrder: Record<string, number> = {running: 0, paused: 1, completed: 2, cancelled: 3};
          const aOrder = statusOrder[a.status] ?? 4;
          const bOrder = statusOrder[b.status] ?? 4;
          if (aOrder !== bOrder) return aOrder - bOrder;
          return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
        }).map(session => {
          const initial = parseFloat(session.virtualBalance) || 10000;
          const current = parseFloat(session.currentBalance) || initial;
          const elapsedMs = Math.max(0, Date.now() - new Date(session.startedAt).getTime());
          const totalDays = session.durationDays;
          // For short durations (< 1 day), use minute-based tracking
          const totalMinutes = totalDays < 1 ? Math.round(totalDays * 1440) : 0;
          const isMinuteBased = totalMinutes > 0;
          const elapsedMinutes = isMinuteBased ? Math.floor(elapsedMs / 60000) : 0;
          const daysElapsed = isMinuteBased ? 0 : Math.floor(elapsedMs / 86400000);
          const days = isMinuteBased ? 0 : Math.min(daysElapsed, totalDays);
          const progress = isMinuteBased
            ? (totalMinutes > 0 ? Math.min(elapsedMinutes / totalMinutes, 1) : 0)
            : (totalDays > 0 ? Math.min(days / totalDays, 1) : 0);
          const isComplete = session.status === 'completed' || (session.status === 'running' && progress >= 1);
          const isRunning = session.status === 'running' && !isComplete;
          const isPaused = session.status === 'paused';
          const isCancelled = session.status === 'cancelled';
          const progressLabel = isMinuteBased
            ? `${Math.min(elapsedMinutes, totalMinutes)}/${totalMinutes}m`
            : `${days}/${totalDays}d`;

          const totalReturnPct = parseFloat(session.totalReturn) || ((current - initial) / initial) * 100;
          const profit = current - initial;
          const profitSign = profit >= 0 ? '+' : '';
          const profitColor = profit >= 0 ? '#10B981' : '#EF4444';

          const winRate = session.totalTrades > 0
            ? Math.round(((session.winCount ?? 0) / session.totalTrades) * 100)
            : 0;

          // Build chart data from balance history or daily performance
          let chartData = balanceHistory.current[session.id] || [];
          if (chartData.length < 2 && session.dailyPerformance) {
            // Build from dailyPerformance if available
            const dp = session.dailyPerformance;
            const sorted = Object.keys(dp).sort();
            chartData = [initial];
            sorted.forEach(day => {
              chartData.push(dp[day].balance);
            });
          }
          if (chartData.length < 2) {
            // At minimum show initial → current
            chartData = [initial, current];
          }

          const chartColor = profit >= 0 ? '#10B981' : '#EF4444';

          return (
            <TouchableOpacity
              key={session.id}
              style={styles.shadowCard}
              onPress={() => navigation.navigate('ShadowModeResults', {
                botId: session.botId,
                profit: Math.round(profit * 100) / 100,
                winRate,
                sessionId: session.id,
              })}
              activeOpacity={0.8}>
              <View style={styles.shadowCardTop}>
                <View style={[styles.avatar, {backgroundColor: session.botAvatarColor || '#6C63FF'}]}>
                  <Text style={styles.avatarText}>{session.botAvatarLetter || session.botName?.[0] || 'B'}</Text>
                </View>
                <View style={styles.shadowInfo}>
                  <Text style={styles.shadowBotName}>{session.botName || 'Unknown Bot'}</Text>
                  <View style={styles.badgeRow}>
                    {isComplete && (
                      <Svg width={14} height={14} viewBox="0 0 16 16" fill="none" style={{marginRight: 4}}>
                        <Path d="M3 8.5L6.5 12L13 4" stroke="#10B981" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
                      </Svg>
                    )}
                    {isRunning && <View style={styles.pulseDot} />}
                    {isPaused && (
                      <Svg width={12} height={12} viewBox="0 0 16 16" fill="none" style={{marginRight: 4}}>
                        <SvgRect x={3} y={3} width={3.5} height={10} rx={1} fill="#F97316" />
                        <SvgRect x={9.5} y={3} width={3.5} height={10} rx={1} fill="#F97316" />
                      </Svg>
                    )}
                    <Badge
                      label={isComplete ? 'COMPLETE' : isRunning ? (isMinuteBased ? `${Math.min(elapsedMinutes, totalMinutes)}/${totalMinutes}m` : `DAY ${days}/${totalDays}`) : isPaused ? 'PAUSED' : isCancelled ? 'STOPPED' : session.status.toUpperCase()}
                      variant={isComplete ? 'green' : isRunning ? 'blue' : isPaused ? 'orange' : 'outline'}
                      size="sm"
                    />
                  </View>
                </View>
                <MiniLineChart data={chartData} width={70} height={36} color={chartColor} />
              </View>

              {/* Stats row */}
              <View style={styles.shadowStats}>
                <View style={styles.shadowStat}>
                  <Text style={[styles.shadowStatValue, {color: profitColor}]}>
                    {profitSign}${Math.abs(profit).toFixed(2)}
                  </Text>
                  <Text style={styles.shadowStatLabel}>Virtual P&L</Text>
                </View>
                <View style={styles.shadowStat}>
                  <Text style={[styles.shadowStatValue, {color: profitColor}]}>
                    {profitSign}{totalReturnPct.toFixed(1)}%
                  </Text>
                  <Text style={styles.shadowStatLabel}>Return</Text>
                </View>
                <View style={styles.shadowStat}>
                  <Text style={styles.shadowStatValue}>{session.totalTrades || 0}</Text>
                  <Text style={styles.shadowStatLabel}>Trades</Text>
                </View>
              </View>

              {/* Win rate bar */}
              {session.totalTrades > 0 && (
                <View style={styles.winRateRow}>
                  <Text style={styles.winRateLabel}>Win Rate</Text>
                  <View style={styles.winRateBarBg}>
                    <View style={[styles.winRateBarFill, {width: `${winRate}%` as any}]} />
                  </View>
                  <Text style={styles.winRateValue}>{winRate}%</Text>
                </View>
              )}

              {/* Progress bar */}
              <View style={styles.progressRow}>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, {width: `${progress * 100}%` as any}]} />
                </View>
                <Text style={styles.progressText}>{progressLabel}</Text>
              </View>

              {isComplete && (
                <View style={styles.completeRow}>
                  <Text style={styles.completeText}>Trial Complete — View Results</Text>
                  <ChevronRightIcon size={16} color="#10B981" />
                </View>
              )}

              {/* Action buttons for running/paused sessions */}
              {(isRunning || isPaused) && (
                <View style={styles.actionRow}>
                  {actionLoadingId === session.id ? (
                    <ActivityIndicator size="small" color="#10B981" />
                  ) : isRunning ? (
                    <>
                      <TouchableOpacity
                        style={[styles.actionBtnPause, {backgroundColor: '#10B98115', borderColor: '#10B981'}]}
                        onPress={(e) => { e.stopPropagation?.(); navigation.navigate('BotLiveFeed', {botId: session.botId, botName: session.botName || 'Bot', mode: 'paper'}); }}
                        activeOpacity={0.7}>
                        <Text style={[styles.actionBtnPauseText, {color: '#10B981'}]}>Live Feed</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.actionBtnPause}
                        onPress={(e) => { e.stopPropagation?.(); handlePauseShadow(session.id); }}
                        activeOpacity={0.7}>
                        <Text style={styles.actionBtnPauseText}>Pause</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.actionBtnStop}
                        onPress={(e) => { e.stopPropagation?.(); handleStopShadow(session.id); }}
                        activeOpacity={0.7}>
                        <Text style={styles.actionBtnStopText}>Stop</Text>
                      </TouchableOpacity>
                    </>
                  ) : isPaused ? (
                    <>
                      <TouchableOpacity
                        style={styles.actionBtnResume}
                        onPress={(e) => { e.stopPropagation?.(); handleResumeShadow(session.id); }}
                        activeOpacity={0.7}>
                        <Text style={styles.actionBtnResumeText}>Resume</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.actionBtnStop}
                        onPress={(e) => { e.stopPropagation?.(); handleStopShadow(session.id); }}
                        activeOpacity={0.7}>
                        <Text style={styles.actionBtnStopText}>Stop</Text>
                      </TouchableOpacity>
                    </>
                  ) : null}
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          style={styles.addShadowBtn}
          onPress={() => navigation.navigate('Main')}>
          <Text style={styles.addShadowText}>+ Add Another Bot to Shadow Mode</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0F1117'},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12},
  backBtn: {width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center'},
  headerTitle: {fontFamily: 'Inter-Bold', fontSize: 20, color: '#FFFFFF'},
  scroll: {paddingHorizontal: 20, paddingTop: 4, paddingBottom: 40},
  subtitle: {fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 18, marginBottom: 12},
  liveIndicator: {flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 8},
  liveDot: {width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981'},
  liveText: {fontFamily: 'Inter-Medium', fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: 0.3},
  emptyContainer: {alignItems: 'center', paddingVertical: 48},
  emptyTitle: {color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter-SemiBold', fontSize: 16, marginBottom: 8},
  emptySubtitle: {color: 'rgba(255,255,255,0.3)', fontFamily: 'Inter-Regular', fontSize: 13, textAlign: 'center', lineHeight: 20, paddingHorizontal: 20},
  shadowCard: {backgroundColor: '#161B22', borderRadius: 18, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)'},
  shadowCardTop: {flexDirection: 'row', alignItems: 'center', marginBottom: 14},
  avatar: {width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12},
  avatarText: {fontFamily: 'Inter-Bold', fontSize: 16, color: '#FFFFFF'},
  shadowInfo: {flex: 1, gap: 4},
  shadowBotName: {fontFamily: 'Inter-SemiBold', fontSize: 15, color: '#FFFFFF'},
  badgeRow: {flexDirection: 'row', alignItems: 'center', gap: 6},
  pulseDot: {width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981', opacity: 0.8},
  shadowStats: {flexDirection: 'row', gap: 16, marginBottom: 12},
  shadowStat: {},
  shadowStatValue: {fontFamily: 'Inter-Bold', fontSize: 16, color: '#10B981'},
  shadowStatLabel: {fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 1},
  winRateRow: {flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10},
  winRateLabel: {fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.35)', width: 50},
  winRateBarBg: {flex: 1, height: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden'},
  winRateBarFill: {height: '100%', backgroundColor: '#10B981', borderRadius: 2},
  winRateValue: {fontFamily: 'Inter-SemiBold', fontSize: 10, color: '#10B981', width: 30, textAlign: 'right'},
  progressRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  progressBar: {flex: 1, height: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden'},
  progressFill: {height: '100%', backgroundColor: '#0D7FF2', borderRadius: 2},
  progressText: {fontFamily: 'Inter-Medium', fontSize: 10, color: 'rgba(255,255,255,0.35)', width: 36, textAlign: 'right'},
  completeRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12, gap: 6, padding: 10, backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: 10},
  completeText: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#10B981'},
  actionRow: {
    flexDirection: 'row', gap: 8, marginTop: 12, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
  },
  actionBtnPause: {
    flex: 1, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(249,115,22,0.12)', borderWidth: 1, borderColor: 'rgba(249,115,22,0.25)',
  },
  actionBtnPauseText: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#F97316'},
  actionBtnStop: {
    flex: 1, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)',
  },
  actionBtnStopText: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#EF4444'},
  actionBtnResume: {
    flex: 1, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(16,185,129,0.12)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)',
  },
  actionBtnResumeText: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#10B981'},
  addShadowBtn: {height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderStyle: 'dashed', marginTop: 4},
  addShadowText: {fontFamily: 'Inter-Medium', fontSize: 14, color: 'rgba(255,255,255,0.35)'},
});
