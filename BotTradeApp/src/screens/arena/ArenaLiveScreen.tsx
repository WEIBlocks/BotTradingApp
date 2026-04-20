import React, {useState, useEffect, useRef, useCallback} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, ActivityIndicator, BackHandler, Modal} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import Svg, {Path, Circle, Rect, Ellipse, Polygon} from 'react-native-svg';
import {RootStackParamList} from '../../types';
import {arenaApi, ArenaSession} from '../../services/arena';
import {useToast} from '../../context/ToastContext';
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
  const {
    gladiatorIds,
    sessionId: existingSessionId,
    durationSeconds,
    mode: arenaMode,
    virtualBalance: arenaBal,
    cryptoBalance: arenaCryptoBal,
    stockBalance: arenaStockBal,
  } = route.params as any;
  const {alert: showAlert} = useToast();
  const [session, setSession] = useState<ArenaSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [exitModalVisible, setExitModalVisible] = useState(false);
  const [killModalVisible, setKillModalVisible] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [decisionFilter, setDecisionFilter] = useState<string | null>(null);
  const [decisionPage, setDecisionPage] = useState(0);
  const [feedTab, setFeedTab] = useState<'decisions' | 'trades'>('decisions');
  const DECISIONS_PER_PAGE = 10;
  const sessionIdRef = useRef<string | null>(existingSessionId ?? null);
  const allowLeaveRef = useRef(false);

  // Create session on mount (or resume existing)
  useEffect(() => {
    if (existingSessionId) {
      arenaApi.getSession(existingSessionId)
        .then(s => {
          sessionIdRef.current = s.id;
          setSession(s);
        })
        .catch(() => showAlert('Error', 'Failed to load arena session.'))
        .finally(() => setLoading(false));
    } else {
      arenaApi.createSession(
        gladiatorIds,
        durationSeconds,
        arenaMode ?? 'shadow',
        arenaBal ?? 10000,
        arenaCryptoBal,
        arenaStockBal,
      )
        .then(s => {
          sessionIdRef.current = s.id;
          setSession(s);
        })
        .catch(() => showAlert('Error', 'Failed to create arena session. Please try again.'))
        .finally(() => setLoading(false));
    }
  }, [gladiatorIds, existingSessionId]);

  const isFinished = session?.status === 'completed' || session?.status === 'killed';

  // Intercept hardware back button
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isFinished) return false; // allow normal back
      setExitModalVisible(true);
      return true; // prevent default
    });
    return () => handler.remove();
  }, [isFinished]);

  // Intercept navigation gesture / header back
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      if (isFinished || allowLeaveRef.current) return; // allow
      e.preventDefault();
      setExitModalVisible(true);
    });
    return unsubscribe;
  }, [navigation, isFinished]);

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

  const handlePauseResume = useCallback(async () => {
    if (!sessionIdRef.current || actionLoading) return;
    setActionLoading(true);
    try {
      if (session?.status === 'paused') {
        await arenaApi.resumeSession(sessionIdRef.current);
        setSession(s => s ? {...s, status: 'running'} : s);
      } else {
        await arenaApi.pauseSession(sessionIdRef.current);
        setSession(s => s ? {...s, status: 'paused'} : s);
      }
    } catch (e: any) {
      showAlert('Error', e?.message || 'Could not update battle status.');
    } finally {
      setActionLoading(false);
    }
  }, [session?.status, actionLoading]);

  const handleKillConfirm = useCallback(async () => {
    if (!sessionIdRef.current) return;
    setKillModalVisible(false);
    setActionLoading(true);
    try {
      await arenaApi.killSession(sessionIdRef.current);
      allowLeaveRef.current = true;
      navigation.replace('ArenaResults', {
        winnerId: [...(session?.gladiators ?? [])].sort((a, b) => (b.currentReturn || 0) - (a.currentReturn || 0))[0]?.id ?? '',
        sessionId: sessionIdRef.current!,
      });
    } catch (e: any) {
      showAlert('Error', e?.message || 'Could not stop the battle.');
    } finally {
      setActionLoading(false);
    }
  }, [session?.gladiators, navigation]);

  // Poll for updates every 5 seconds
  useEffect(() => {
    if (!sessionIdRef.current) return;
    const interval = setInterval(() => {
      if (!sessionIdRef.current) return;
      arenaApi.getSession(sessionIdRef.current)
        .then(s => {
          setSession(s);
          if (s.status === 'completed' || s.status === 'killed') {
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
  const chartWidth = width - 32;

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
            <Text style={styles.modalTitle}>Leave Battle?</Text>
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
                <Text style={styles.modalBtnSub}>Battle continues, check back later</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalBtnDanger} onPress={handleLeave} activeOpacity={0.8}>
              <View style={[styles.modalBtnIcon, {backgroundColor: 'rgba(239,68,68,0.1)'}]}>
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                  <Path d="M17 8l-10 8M7 8l10 8" stroke="#EF4444" strokeWidth={2} strokeLinecap="round"/>
                </Svg>
              </View>
              <View style={{flex: 1}}>
                <Text style={styles.modalBtnDangerText}>Exit Screen</Text>
                <Text style={styles.modalBtnSub}>Leave the screen, battle keeps running</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setExitModalVisible(false)} activeOpacity={0.8}>
              <Text style={styles.modalBtnCancelText}>Stay Here</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Kill Confirm Modal ── */}
      <Modal visible={killModalVisible} transparent animationType="fade" onRequestClose={() => setKillModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>End Battle Early?</Text>
            <Text style={styles.modalDesc}>
              This will immediately stop the battle and calculate final rankings from current standings. This cannot be undone.
            </Text>
            <TouchableOpacity style={styles.modalBtnDanger} onPress={handleKillConfirm} activeOpacity={0.8}>
              <View style={[styles.modalBtnIcon, {backgroundColor: 'rgba(239,68,68,0.15)'}]}>
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                  <Rect x={4} y={4} width={16} height={16} rx={3} fill="#EF4444" />
                </Svg>
              </View>
              <View style={{flex: 1}}>
                <Text style={styles.modalBtnDangerText}>End Battle Now</Text>
                <Text style={styles.modalBtnSub}>Finalize results with current standings</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setKillModalVisible(false)} activeOpacity={0.8}>
              <Text style={styles.modalBtnCancelText}>Keep Going</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Sticky Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => {
          if (isFinished) { navigation.goBack(); }
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
          <View style={styles.statusRow}>
            <Text style={styles.statusTitle}>
              {session?.status === 'paused' ? 'Paused: ' : 'Running: '}{statusText}
            </Text>
            <View style={[styles.livePill, session?.status === 'paused' && {backgroundColor: 'rgba(245,158,11,0.12)', borderColor: 'rgba(245,158,11,0.3)'}]}>
              <View style={[styles.liveDot, session?.status === 'paused' && {backgroundColor: '#F59E0B'}]} />
              <Text style={[styles.liveText, session?.status === 'paused' && {color: '#F59E0B'}]}>
                {session?.status === 'paused' ? 'PAUSED' : 'LIVE BATTLE'}
              </Text>
            </View>
          </View>
          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, {width: `${progressPct}%` as any}, session?.status === 'paused' && {backgroundColor: '#F59E0B'}]} />
          </View>

          {/* ── Battle Controls ── */}
          {(session?.status === 'running' || session?.status === 'paused') && (
            <View style={styles.battleControls}>
              {/* Pause / Resume */}
              <TouchableOpacity
                style={[styles.controlBtn, session?.status === 'paused' && styles.controlBtnActive]}
                onPress={handlePauseResume}
                disabled={actionLoading}
                activeOpacity={0.75}>
                {actionLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" style={{width: 16, height: 16}} />
                ) : session?.status === 'paused' ? (
                  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                    <Path d="M5 3l14 9-14 9V3z" fill="#10B981" />
                  </Svg>
                ) : (
                  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                    <Rect x={6} y={4} width={4} height={16} rx={1.5} fill="rgba(255,255,255,0.8)" />
                    <Rect x={14} y={4} width={4} height={16} rx={1.5} fill="rgba(255,255,255,0.8)" />
                  </Svg>
                )}
                <Text style={[styles.controlBtnText, session?.status === 'paused' && {color: '#10B981'}]}>
                  {session?.status === 'paused' ? 'Resume' : 'Pause'}
                </Text>
              </TouchableOpacity>

              {/* End Battle */}
              <TouchableOpacity
                style={styles.controlBtnDanger}
                onPress={() => setKillModalVisible(true)}
                disabled={actionLoading}
                activeOpacity={0.75}>
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                  <Rect x={4} y={4} width={16} height={16} rx={3} stroke="#EF4444" strokeWidth={1.8} />
                  <Path d="M9 9l6 6M15 9l-6 6" stroke="#EF4444" strokeWidth={1.8} strokeLinecap="round" />
                </Svg>
                <Text style={styles.controlBtnDangerText}>End Battle</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── POOL & MARKET INFO ── */}
        {(() => {
          const isMixed = session?.isMixed ?? false;
          const hasStocks = session?.hasStocks ?? false;
          const marketOpen = session?.marketOpen ?? true;
          const cryptoBal = session?.cryptoBalance ? parseFloat(session.cryptoBalance) : null;
          const stockBal = session?.stockBalance ? parseFloat(session.stockBalance) : null;
          const totalPool = parseFloat(session?.virtualBalance ?? '10000');
          const perCryptoBot = session?.perCryptoBotAlloc ? parseFloat(session.perCryptoBotAlloc) : null;
          const perStockBot = session?.perStockBotAlloc ? parseFloat(session.perStockBotAlloc) : null;
          const perBot = session?.perBotAllocation ? parseFloat(session.perBotAllocation) : totalPool / Math.max(1, ranked.length);
          return (
            <View style={{marginBottom: 10, gap: 6}}>
              {/* Shared pool row */}
              <View style={{backgroundColor: '#111827', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#1F2937'}}>
                <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                  <View style={{flex: 1}}>
                    <Text style={{fontFamily: 'Inter-Regular', fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: 0.5}}>SHARED POOL</Text>
                    {isMixed ? (
                      <View style={{flexDirection: 'row', gap: 8, marginTop: 2}}>
                        {cryptoBal != null && <Text style={{fontFamily: 'Inter-Bold', fontSize: 14, color: '#F59E0B'}}>${cryptoBal.toLocaleString()} crypto</Text>}
                        {stockBal != null && <Text style={{fontFamily: 'Inter-Bold', fontSize: 14, color: '#3B82F6'}}>${stockBal.toLocaleString()} stocks</Text>}
                      </View>
                    ) : (
                      <Text style={{fontFamily: 'Inter-Bold', fontSize: 16, color: '#FFFFFF'}}>${totalPool.toLocaleString()}</Text>
                    )}
                  </View>
                  {/* PER BOT — show split values for mixed sessions */}
                  {isMixed ? (
                    <View style={{alignItems: 'flex-end', gap: 2}}>
                      <Text style={{fontFamily: 'Inter-Regular', fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: 0.5}}>PER BOT</Text>
                      {perCryptoBot != null && (
                        <Text style={{fontFamily: 'Inter-Bold', fontSize: 12, color: '#F59E0B'}}>
                          ${perCryptoBot.toLocaleString(undefined, {maximumFractionDigits: 0})} crypto
                        </Text>
                      )}
                      {perStockBot != null && (
                        <Text style={{fontFamily: 'Inter-Bold', fontSize: 12, color: '#3B82F6'}}>
                          ${perStockBot.toLocaleString(undefined, {maximumFractionDigits: 0})} stock
                        </Text>
                      )}
                    </View>
                  ) : (
                    <View style={{alignItems: 'flex-end'}}>
                      <Text style={{fontFamily: 'Inter-Regular', fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: 0.5}}>PER BOT</Text>
                      <Text style={{fontFamily: 'Inter-Bold', fontSize: 14, color: '#10B981'}}>${perBot.toLocaleString(undefined, {maximumFractionDigits: 0})}</Text>
                    </View>
                  )}
                </View>
              </View>
              {/* Market hours indicator (only if session has stock bots) */}
              {hasStocks && (
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: marketOpen ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: marketOpen ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}}>
                  <View style={{width: 7, height: 7, borderRadius: 4, backgroundColor: marketOpen ? '#10B981' : '#EF4444'}} />
                  <Text style={{fontFamily: 'Inter-Medium', fontSize: 11, color: marketOpen ? '#10B981' : '#EF4444'}}>
                    US Market {marketOpen ? 'Open — Stock bots trading' : 'Closed — Stock bots idle until 9:30 AM ET'}
                  </Text>
                </View>
              )}
            </View>
          );
        })()}

        {/* ── P&L SUMMARY ── */}
        {(() => {
          const avgReturnPct = ranked.length > 0
            ? ranked.reduce((s, g) => s + (g.currentReturn || 0), 0) / ranked.length : 0;
          const bestBot = ranked[0];
          const worstBot = ranked[ranked.length - 1];
          const totalPnl = ranked.reduce((s, g) => s + (g.currentPnl ?? 0), 0);
          const isPos = totalPnl >= 0;
          return (
            <View style={{marginBottom: 12, backgroundColor: '#111827', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#1F2937'}}>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8}}>
                <View>
                  <Text style={{fontFamily: 'Inter-Regular', fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: 0.5}}>TOTAL P&L (ALL BOTS)</Text>
                  <Text style={{fontFamily: 'Inter-Bold', fontSize: 16, color: isPos ? '#10B981' : '#EF4444'}}>
                    {isPos ? '+' : ''}${totalPnl.toFixed(2)}
                  </Text>
                </View>
                <View style={{alignItems: 'flex-end'}}>
                  <Text style={{fontFamily: 'Inter-Regular', fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: 0.5}}>AVG RETURN</Text>
                  <Text style={{fontFamily: 'Inter-Bold', fontSize: 16, color: avgReturnPct >= 0 ? '#10B981' : '#EF4444'}}>
                    {avgReturnPct >= 0 ? '+' : ''}{avgReturnPct.toFixed(2)}%
                  </Text>
                </View>
              </View>
              <View style={{flexDirection: 'row', gap: 6}}>
                <View style={{flex: 1, backgroundColor: 'rgba(16,185,129,0.08)', borderRadius: 8, padding: 6, alignItems: 'center'}}>
                  <Text style={{fontFamily: 'Inter-Bold', fontSize: 12, color: '#10B981'}}>
                    {bestBot ? `${(bestBot.currentReturn || 0) >= 0 ? '+' : ''}${(bestBot.currentReturn || 0).toFixed(1)}%` : '—'}
                  </Text>
                  <Text style={{fontFamily: 'Inter-Regular', fontSize: 8, color: '#10B981'}}>Best</Text>
                </View>
                <View style={{flex: 1, backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: 8, padding: 6, alignItems: 'center'}}>
                  <Text style={{fontFamily: 'Inter-Bold', fontSize: 12, color: '#EF4444'}}>
                    {worstBot ? `${(worstBot.currentReturn || 0).toFixed(1)}%` : '—'}
                  </Text>
                  <Text style={{fontFamily: 'Inter-Regular', fontSize: 8, color: '#EF4444'}}>Worst</Text>
                </View>
                <View style={{flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 6, alignItems: 'center'}}>
                  <Text style={{fontFamily: 'Inter-Bold', fontSize: 12, color: '#FFFFFF'}}>
                    {ranked.reduce((s, g) => s + (g.totalTrades ?? 0), 0)}
                  </Text>
                  <Text style={{fontFamily: 'Inter-Regular', fontSize: 8, color: 'rgba(255,255,255,0.4)'}}>Trades</Text>
                </View>
                <View style={{flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 6, alignItems: 'center'}}>
                  <Text style={{fontFamily: 'Inter-Bold', fontSize: 12, color: '#FFFFFF'}}>{ranked.length}</Text>
                  <Text style={{fontFamily: 'Inter-Regular', fontSize: 8, color: 'rgba(255,255,255,0.4)'}}>Bots</Text>
                </View>
              </View>
            </View>
          );
        })()}

        {/* ── CHART SECTION ── */}
        {(() => {
          // Only render chart when at least 2 equity points exist for at least one bot
          const hasChartData = datasets.some(d => d.length >= 2);
          return (
            <View style={styles.chartSection}>
              <View style={styles.chartHeader}>
                <Text style={styles.chartTitle}>Live Performance</Text>
                <View style={styles.dotsRow}>
                  {activeGladiators.map((g, i) => (
                    <View key={g.id} style={[styles.legendDot, {backgroundColor: LINE_COLORS[i]}]} />
                  ))}
                </View>
              </View>
              {hasChartData ? (
                <>
                  <ArenaMultilineChart datasets={datasets} width={chartWidth} height={220} />
                  <View style={styles.xAxis}>
                    <Text style={styles.xLabel}>START</Text>
                    <Text style={[styles.xLabel, styles.xLabelNow]}>{formatTime(Math.floor(elapsedSec))} (NOW)</Text>
                    <Text style={styles.xLabel}>{formatTime(totalSec)}</Text>
                  </View>
                </>
              ) : (
                <View style={{height: 110, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 12, borderWidth: 1, borderColor: '#1F2937', borderStyle: 'dashed'}}>
                  <Text style={{fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.25)', marginBottom: 4}}>Collecting equity data…</Text>
                  <Text style={{fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.15)'}}>Chart appears after first tick (~10s)</Text>
                </View>
              )}
            </View>
          );
        })()}

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

          // Count decisions per bot — holds are trimmed to 20 in backend, so estimate total
          const botLog = (g as any).decisionLog || [];
          const botBuys = botLog.filter((d: any) => d.action === 'BUY').length;
          const botSells = botLog.filter((d: any) => d.action === 'SELL').length;
          const loggedHolds = botLog.filter((d: any) => d.action === 'HOLD').length;
          // Total decisions = totalTrades (all BUY+SELL from engine) + estimated holds
          const totalFromEngine = (g.totalTrades ?? 0);
          const estimatedHolds = Math.max(loggedHolds, botLog.length - botBuys - botSells);
          const holdsAreTrimmed = loggedHolds >= 20 && totalFromEngine < botLog.length;

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

              {/* Name + strategy + stats */}
              <View style={[styles.leaderInfo, {flex: 1}]}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap'}}>
                  <Text style={styles.leaderName}>{g.name}</Text>
                  {/* Asset class badge */}
                  {(() => {
                    const ac = g.assetClass ?? (g.category === 'Stocks' ? 'stocks' : 'crypto');
                    const badgeColor = ac === 'stocks' ? '#3B82F6' : ac === 'mixed' ? '#F59E0B' : '#10B981';
                    const badgeLabel = ac === 'stocks' ? 'STOCK' : ac === 'mixed' ? 'MIXED' : 'CRYPTO';
                    return (
                      <View style={{backgroundColor: badgeColor + '22', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4}}>
                        <Text style={{fontFamily: 'Inter-Bold', fontSize: 8, color: badgeColor, letterSpacing: 0.3}}>{badgeLabel}</Text>
                      </View>
                    );
                  })()}
                  {/* Market closed indicator for stock bots */}
                  {(g.assetClass === 'stocks' || g.isStockBot) && g.marketOpen === false && (
                    <View style={{backgroundColor: 'rgba(239,68,68,0.15)', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4}}>
                      <Text style={{fontFamily: 'Inter-Bold', fontSize: 7, color: '#EF4444'}}>MARKET CLOSED</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.leaderStrategy}>{g.strategy.toUpperCase()}</Text>
                <View style={{flexDirection: 'row', gap: 4, marginTop: 3, flexWrap: 'nowrap', alignItems: 'center'}}>
                  {/* Starting allocation */}
                  {g.startingAlloc != null && g.startingAlloc > 0 && (
                    <Text style={{fontFamily: 'Inter-Medium', fontSize: 9, color: 'rgba(255,255,255,0.35)'}}>
                      ${g.startingAlloc.toLocaleString(undefined, {maximumFractionDigits: 0})} alloc ·
                    </Text>
                  )}
                  <Text style={{fontFamily: 'Inter-Medium', fontSize: 9, color: '#FFFFFF'}}>
                    {g.currentTrades ?? 0}T
                  </Text>
                  {(g.currentWins ?? 0) > 0 && (
                    <Text style={{fontFamily: 'Inter-Medium', fontSize: 9, color: '#10B981'}}>{g.currentWins}W</Text>
                  )}
                  {(g.currentLosses ?? 0) > 0 && (
                    <Text style={{fontFamily: 'Inter-Medium', fontSize: 9, color: '#EF4444'}}>{g.currentLosses}L</Text>
                  )}
                  {(g.openPositionCount ?? 0) > 0 && (
                    <Text style={{fontFamily: 'Inter-Medium', fontSize: 9, color: '#3B82F6'}}>{g.openPositionCount} open</Text>
                  )}
                </View>
              </View>

              {/* Return + trophy */}
              <View style={styles.returnBlock}>
                <Text style={[styles.returnValue, {color: returnColor}]}>
                  {returnSign}{(g.currentReturn || 0).toFixed(2)}%
                </Text>
                {g.currentPnl != null && g.currentPnl !== 0 && (
                  <Text style={{fontFamily: 'Inter-Medium', fontSize: 10, color: returnColor, textAlign: 'right'}}>
                    {(g.currentPnl ?? 0) >= 0 ? '+' : ''}${(g.currentPnl ?? 0).toFixed(2)}
                  </Text>
                )}
                {isFirst && (
                  <View style={styles.returnSubRow}>
                    <Text style={styles.returnSubLabel}>LEADING</Text>
                    <TrophySmall />
                  </View>
                )}
              </View>
            </View>
          );
        })}

        {/* ── LIVE DECISIONS FEED ── */}
        {activeGladiators.length > 0 && (
          <>
            {/* Tab toggle: Decisions vs Trades */}
            <View style={{flexDirection: 'row', marginBottom: 12, backgroundColor: '#111827', borderRadius: 10, padding: 3}}>
              <TouchableOpacity
                style={{flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', backgroundColor: feedTab === 'decisions' ? '#1F2937' : 'transparent'}}
                onPress={() => { setFeedTab('decisions'); setDecisionPage(0); }}>
                <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 13, color: feedTab === 'decisions' ? '#FFFFFF' : 'rgba(255,255,255,0.4)'}}>📋 Decisions</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', backgroundColor: feedTab === 'trades' ? '#1F2937' : 'transparent'}}
                onPress={() => { setFeedTab('trades'); setDecisionPage(0); }}>
                <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 13, color: feedTab === 'trades' ? '#FFFFFF' : 'rgba(255,255,255,0.4)'}}>💰 Trades</Text>
              </TouchableOpacity>
            </View>

            {/* Bot filter tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 12}}>
              <TouchableOpacity
                style={[styles.decisionFilterChip, !decisionFilter && styles.decisionFilterChipActive]}
                onPress={() => setDecisionFilter(null)}>
                <Text style={[styles.decisionFilterText, !decisionFilter && styles.decisionFilterTextActive]}>All Bots</Text>
              </TouchableOpacity>
              {activeGladiators.map(g => (
                <TouchableOpacity
                  key={g.id}
                  style={[styles.decisionFilterChip, decisionFilter === g.id && styles.decisionFilterChipActive]}
                  onPress={() => setDecisionFilter(g.id === decisionFilter ? null : g.id)}>
                  <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: g.avatarColor || '#6C63FF', marginRight: 6}} />
                  <Text style={[styles.decisionFilterText, decisionFilter === g.id && styles.decisionFilterTextActive]}>{g.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Overall stats bar — use DB trade counts (accurate), not trimmed log */}
            {(() => {
              // Real trade counts from DB positions (not trimmed log)
              const realTotalTrades = activeGladiators.reduce((s, g) => s + ((g as any).currentTrades ?? g.totalTrades ?? 0), 0);
              // Open/closed from real positions
              let openCount = 0;
              let closedCount = 0;
              for (const g of activeGladiators) {
                const trades = (g as any).trades || [];
                openCount += trades.filter((t: any) => t.status === 'open').length;
                closedCount += trades.filter((t: any) => t.status === 'closed').length;
              }
              // Total P&L across all bots (from currentPnl which uses real positions)
              const totalPnl = activeGladiators.reduce((s, g) => s + ((g as any).currentPnl ?? 0), 0);
              const pnlColor = totalPnl >= 0 ? '#10B981' : '#EF4444';
              return (
                <View style={{flexDirection: 'row', marginBottom: 12, backgroundColor: '#111827', borderRadius: 10, padding: 10, gap: 4}}>
                  <View style={{flex: 1, alignItems: 'center'}}>
                    <Text style={{fontFamily: 'Inter-Bold', fontSize: 16, color: '#FFFFFF'}}>{realTotalTrades}</Text>
                    <Text style={{fontFamily: 'Inter-Medium', fontSize: 9, color: 'rgba(255,255,255,0.5)'}}>Total</Text>
                  </View>
                  <View style={{width: 1, backgroundColor: '#1F2937'}} />
                  <View style={{flex: 1, alignItems: 'center'}}>
                    <Text style={{fontFamily: 'Inter-Bold', fontSize: 16, color: '#3B82F6'}}>{openCount}</Text>
                    <Text style={{fontFamily: 'Inter-Medium', fontSize: 9, color: '#3B82F6'}}>Open</Text>
                  </View>
                  <View style={{width: 1, backgroundColor: '#1F2937'}} />
                  <View style={{flex: 1, alignItems: 'center'}}>
                    <Text style={{fontFamily: 'Inter-Bold', fontSize: 16, color: '#6B7280'}}>{closedCount}</Text>
                    <Text style={{fontFamily: 'Inter-Medium', fontSize: 9, color: '#6B7280'}}>Closed</Text>
                  </View>
                  <View style={{width: 1, backgroundColor: '#1F2937'}} />
                  <View style={{flex: 1, alignItems: 'center'}}>
                    <Text style={{fontFamily: 'Inter-Bold', fontSize: 14, color: pnlColor}}>
                      {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
                    </Text>
                    <Text style={{fontFamily: 'Inter-Medium', fontSize: 9, color: 'rgba(255,255,255,0.4)'}}>P&L</Text>
                  </View>
                </View>
              );
            })()}

            {/* Trades tab — show REAL trades from DB positions */}
            {feedTab === 'trades' && (() => {
              const allTrades: any[] = [];
              for (const g of activeGladiators) {
                if (decisionFilter && decisionFilter !== g.id) continue;
                const trades = (g as any).trades || [];
                for (const t of trades) {
                  allTrades.push({ ...t, botName: g.name, botColor: g.avatarColor || '#6C63FF', category: (g as any).category });
                }
              }
              allTrades.sort((a: any, b: any) => new Date(b.openedAt || 0).getTime() - new Date(a.openedAt || 0).getTime());

              if (allTrades.length === 0) {
                return (
                  <View style={{alignItems: 'center', paddingVertical: 24}}>
                    <Text style={{fontSize: 32, marginBottom: 8}}>{'💰'}</Text>
                    <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 14, color: 'rgba(255,255,255,0.4)', marginBottom: 4}}>No trades executed yet</Text>
                    <Text style={{fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.2)', textAlign: 'center'}}>
                      Positions will appear here when bots open/close trades.
                    </Text>
                  </View>
                );
              }

              return (
                <>
                  <Text style={{fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.2)', textAlign: 'center', marginBottom: 8}}>
                    {allTrades.length} position{allTrades.length !== 1 ? 's' : ''} ({allTrades.filter((t: any) => t.status === 'open').length} open, {allTrades.filter((t: any) => t.status === 'closed').length} closed)
                  </Text>
                  {allTrades.map((t: any, i: number) => {
                    const isOpen = t.status === 'open';
                    const isWin = !isOpen && (t.pnl ?? 0) > 0;
                    const borderColor = isOpen ? '#3B82F6' : isWin ? '#10B981' : '#EF4444';
                    const pnlVal = t.pnl ?? 0;
                    const pnlPct = t.pnlPercent ?? 0;
                    return (
                      <View key={`trade-${i}`} style={{marginBottom: 8, backgroundColor: '#111827', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#1F2937', borderLeftWidth: 3, borderLeftColor: borderColor}}>
                        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4}}>
                          <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                            <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: t.botColor}} />
                            <Text style={{fontFamily: 'Inter-Medium', fontSize: 12, color: '#9CA3AF'}}>{t.botName}</Text>
                            <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 12, color: '#FFFFFF'}}>{t.symbol}</Text>
                            {t.category && (
                              <View style={{backgroundColor: t.category === 'Stocks' ? 'rgba(59,130,246,0.15)' : 'rgba(245,158,11,0.15)', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3}}>
                                <Text style={{fontFamily: 'Inter-Bold', fontSize: 7, color: t.category === 'Stocks' ? '#3B82F6' : '#F59E0B'}}>{t.category === 'Stocks' ? 'STOCK' : 'CRYPTO'}</Text>
                              </View>
                            )}
                          </View>
                          {isOpen ? (
                            <Text style={{fontFamily: 'Inter-Bold', fontSize: 11, color: '#3B82F6'}}>OPEN</Text>
                          ) : (
                            <Text style={{fontFamily: 'Inter-Bold', fontSize: 12, color: borderColor}}>
                              {isWin ? '+' : ''}{pnlPct.toFixed(2)}%
                            </Text>
                          )}
                        </View>
                        <View style={{flexDirection: 'row', gap: 12, marginBottom: 2}}>
                          <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: '#9CA3AF'}}>Entry: ${t.entryPrice?.toFixed(2)}</Text>
                          {!isOpen && <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: '#9CA3AF'}}>Exit: ${t.exitPrice?.toFixed(2)}</Text>}
                          <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: '#9CA3AF'}}>Size: ${t.entryValue?.toFixed(0)}</Text>
                          {!isOpen && <Text style={{fontFamily: 'Inter-Bold', fontSize: 11, color: borderColor}}>P&L: {pnlVal >= 0 ? '+' : ''}${pnlVal.toFixed(2)}</Text>}
                        </View>
                        {t.entryReasoning && (
                          <Text style={{fontFamily: 'Inter-Regular', fontSize: 10, color: '#6B7280', fontStyle: 'italic'}} numberOfLines={1}>
                            {t.entryReasoning.slice(0, 80)}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </>
              );
            })()}

            {/* Decisions tab — show decision log (BUY/SELL/HOLD from engine) */}
            {feedTab === 'decisions' && (() => {
              const allDecisions: {botName: string; botColor: string; action: string; symbol: string; price: number; reasoning: string; time: string}[] = [];
              for (const g of activeGladiators) {
                if (decisionFilter && decisionFilter !== g.id) continue;
                const log = (g as any).decisionLog;
                if (Array.isArray(log)) {
                  for (const d of log) {
                    allDecisions.push({
                      botName: g.name,
                      botColor: g.avatarColor || '#6C63FF',
                      action: d.action,
                      symbol: d.symbol,
                      price: d.price,
                      reasoning: d.reasoning,
                      time: d.time,
                    });
                  }
                }
              }
              allDecisions.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

              if (allDecisions.length === 0) {
                return (
                  <View style={{alignItems: 'center', paddingVertical: 24}}>
                    <Text style={{fontSize: 32, marginBottom: 8}}>{'📋'}</Text>
                    <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 14, color: 'rgba(255,255,255,0.4)', marginBottom: 4}}>Waiting for bot decisions...</Text>
                    <Text style={{fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.2)', textAlign: 'center'}}>
                      Decisions will appear as bots analyze the market.
                    </Text>
                  </View>
                );
              }

              const totalPages = Math.ceil(allDecisions.length / DECISIONS_PER_PAGE);
              const paged = allDecisions.slice(decisionPage * DECISIONS_PER_PAGE, (decisionPage + 1) * DECISIONS_PER_PAGE);

              return (
                <>
                  <Text style={{fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.2)', textAlign: 'center', marginBottom: 8}}>
                    Showing {decisionPage * DECISIONS_PER_PAGE + 1}-{Math.min((decisionPage + 1) * DECISIONS_PER_PAGE, allDecisions.length)} of {allDecisions.length} decisions
                  </Text>
                  {paged.map((d, i) => (
                    <View key={`dec-${decisionPage}-${i}`} style={{marginBottom: 8, backgroundColor: '#111827', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#1F2937', borderLeftWidth: d.action !== 'HOLD' ? 3 : 1, borderLeftColor: d.action === 'BUY' ? '#10B981' : d.action === 'SELL' ? '#EF4444' : '#1F2937'}}>
                      <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4}}>
                        <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                          <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: d.botColor}} />
                          <Text style={{fontFamily: 'Inter-Medium', fontSize: 12, color: '#9CA3AF'}}>{d.botName}</Text>
                          <Text style={{fontFamily: 'Inter-Bold', fontSize: 12, color: d.action === 'BUY' ? '#10B981' : d.action === 'SELL' ? '#EF4444' : '#6B7280'}}>
                            {d.action === 'BUY' ? '🟢' : d.action === 'SELL' ? '🔴' : '⏸'} {d.action}
                          </Text>
                        </View>
                        <Text style={{fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.2)'}}>
                          {new Date(d.time).toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false})}
                        </Text>
                      </View>
                      <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: '#6B7280'}}>{d.symbol} @ ${d.price?.toFixed?.(2) ?? '0'}</Text>
                      <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2}} numberOfLines={2}>{d.reasoning}</Text>
                    </View>
                  ))}

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <View style={{flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 8, marginBottom: 8}}>
                      <TouchableOpacity
                        disabled={decisionPage === 0}
                        onPress={() => setDecisionPage(p => Math.max(0, p - 1))}
                        style={{paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: decisionPage === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.08)'}}>
                        <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 12, color: decisionPage === 0 ? 'rgba(255,255,255,0.15)' : '#FFFFFF'}}>Prev</Text>
                      </TouchableOpacity>
                      <Text style={{fontFamily: 'Inter-Medium', fontSize: 12, color: 'rgba(255,255,255,0.4)'}}>
                        {decisionPage + 1} / {totalPages}
                      </Text>
                      <TouchableOpacity
                        disabled={decisionPage >= totalPages - 1}
                        onPress={() => setDecisionPage(p => Math.min(totalPages - 1, p + 1))}
                        style={{paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: decisionPage >= totalPages - 1 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.08)'}}>
                        <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 12, color: decisionPage >= totalPages - 1 ? 'rgba(255,255,255,0.15)' : '#FFFFFF'}}>Next</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              );
            })()}
          </>
        )}

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

  scroll: {paddingHorizontal: 16, paddingBottom: 20},

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

  // Battle controls
  battleControls: {
    flexDirection: 'row', gap: 10, marginTop: 14,
  },
  controlBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingVertical: 10, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  controlBtnActive: {
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderColor: 'rgba(16,185,129,0.3)',
  },
  controlBtnText: {
    fontFamily: 'Inter-SemiBold', fontSize: 13, color: 'rgba(255,255,255,0.75)',
  },
  controlBtnDanger: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingVertical: 10, borderRadius: 10,
    backgroundColor: 'rgba(239,68,68,0.07)',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
  },
  controlBtnDangerText: {
    fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#EF4444',
  },

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

  // Decision filter chips
  decisionFilterChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, marginRight: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  decisionFilterChipActive: {
    backgroundColor: '#10B98115', borderColor: '#10B981',
  },
  decisionFilterText: {
    fontFamily: 'Inter-Medium', fontSize: 12, color: 'rgba(255,255,255,0.4)',
  },
  decisionFilterTextActive: {
    color: '#10B981',
  },
});
