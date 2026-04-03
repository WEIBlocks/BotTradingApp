import React, {useState, useCallback, useMemo} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import Svg, {Path, Rect, Circle} from 'react-native-svg';
import {RootStackParamList} from '../../types';
import {dashboardApi, ActiveBot as DashActiveBot} from '../../services/dashboard';
import {botsService} from '../../services/bots';
import {useToast} from '../../context/ToastContext';

function PauseIcon({size = 13, color = 'rgba(255,255,255,0.7)'}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 13 13" fill="none">
      <Rect x={2} y={1.5} width={3} height={10} rx={1} fill={color} />
      <Rect x={8} y={1.5} width={3} height={10} rx={1} fill={color} />
    </Svg>
  );
}

function StopSquareIcon({size = 13}: {size?: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 13 13" fill="none">
      <Rect x={1.5} y={1.5} width={10} height={10} rx={2} fill="rgba(239,68,68,0.8)" />
    </Svg>
  );
}

interface ShadowSessionInfo {
  id: string;
  botId: string;
  status: string;
}

function resolveBotDisplayStatus(bot: DashActiveBot, shadowSessions: ShadowSessionInfo[]) {
  if (bot.subStatus !== 'shadow') {
    const isPaused = bot.subStatus === 'paused';
    const isLive = bot.subStatus === 'active' && bot.status === 'live';
    return {
      label: isPaused ? 'PAUSED' : isLive ? 'LIVE' : 'PAPER',
      color: isPaused ? '#F97316' : isLive ? '#10B981' : '#F59E0B',
      icon: isPaused ? 'paused' as const : 'running' as const,
    };
  }
  const sessions = shadowSessions.filter(s => s.botId === bot.id);
  const running = sessions.find(s => s.status === 'running');
  const completed = sessions.find(s => s.status === 'completed');
  const paused = sessions.find(s => s.status === 'paused');
  if (running) return {label: 'SHADOW', color: '#0D7FF2', icon: 'running' as const};
  if (paused) return {label: 'SHADOW PAUSED', color: '#F97316', icon: 'paused' as const};
  if (completed) return {label: 'SHADOW DONE', color: '#10B981', icon: 'completed' as const};
  return {label: 'SHADOW', color: '#0D7FF2', icon: 'idle' as const};
}

// Priority order for sorting: live running > paper running > shadow running > paused > shadow paused > completed/idle
function botSortPriority(bot: DashActiveBot, display: ReturnType<typeof resolveBotDisplayStatus>): number {
  if (display.label === 'LIVE') return 0;
  if (display.label === 'PAPER') return 1;
  if (display.label === 'SHADOW') return 2;
  if (display.label === 'PAUSED') return 3;
  if (display.label === 'SHADOW PAUSED') return 4;
  if (display.label === 'SHADOW DONE') return 5;
  return 6;
}

type NavProp = NativeStackNavigationProp<RootStackParamList>;

type FilterKey = 'all' | 'live' | 'paper' | 'shadow' | 'paused' | 'completed';

const FILTERS: {key: FilterKey; label: string; color: string}[] = [
  {key: 'all', label: 'All', color: '#FFFFFF'},
  {key: 'live', label: 'Live', color: '#10B981'},
  {key: 'paper', label: 'Paper', color: '#F59E0B'},
  {key: 'shadow', label: 'Shadow', color: '#0D7FF2'},
  {key: 'paused', label: 'Paused', color: '#F97316'},
  {key: 'completed', label: 'Done', color: '#A78BFA'},
];

export default function ActiveBotsScreen() {
  const navigation = useNavigation<NavProp>();
  const {alert: showAlert, showConfirm} = useToast();

  const [activeBots, setActiveBots] = useState<DashActiveBot[]>([]);
  const [shadowSessions, setShadowSessions] = useState<ShadowSessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');

  const fetchData = useCallback(async () => {
    try {
      const [bots, shadowRes] = await Promise.all([
        dashboardApi.getActiveBots(),
        botsService.getShadowSessions().then((res: any) => {
          const items = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
          return items.map((s: any) => ({id: s.id, botId: s.botId, status: s.status})) as ShadowSessionInfo[];
        }).catch(() => [] as ShadowSessionInfo[]),
      ]);
      setActiveBots(bots);
      setShadowSessions(shadowRes);
    } catch {
      showAlert('Error', 'Failed to load bots.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const handlePause = (subscriptionId: string, name: string) => {
    showConfirm({
      title: 'Pause Bot',
      message: `Pause "${name}"?`,
      confirmText: 'Pause',
      onConfirm: () => botsService.pause(subscriptionId).then(fetchData).catch(() => showAlert('Error', 'Failed to pause bot.')),
    });
  };

  const handleStop = (subscriptionId: string, name: string) => {
    showConfirm({
      title: 'Stop Bot',
      message: `Stop "${name}" permanently?`,
      confirmText: 'Stop',
      destructive: true,
      onConfirm: () => botsService.stop(subscriptionId).then(fetchData).catch(() => showAlert('Error', 'Failed to stop bot.')),
    });
  };

  // Enrich with display info, sort, then filter
  const enriched = useMemo(() => {
    return activeBots
      .map(bot => ({bot, display: resolveBotDisplayStatus(bot, shadowSessions)}))
      .sort((a, b) => botSortPriority(a.bot, a.display) - botSortPriority(b.bot, b.display));
  }, [activeBots, shadowSessions]);

  const filtered = useMemo(() => {
    if (filter === 'all') return enriched;
    return enriched.filter(({display}) => {
      if (filter === 'live') return display.label === 'LIVE';
      if (filter === 'paper') return display.label === 'PAPER';
      if (filter === 'shadow') return display.label === 'SHADOW' || display.label === 'SHADOW PAUSED';
      if (filter === 'paused') return display.label === 'PAUSED';
      if (filter === 'completed') return display.label === 'SHADOW DONE';
      return true;
    });
  }, [enriched, filter]);

  // Count per filter
  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = {all: enriched.length, live: 0, paper: 0, shadow: 0, paused: 0, completed: 0};
    for (const {display} of enriched) {
      if (display.label === 'LIVE') c.live++;
      else if (display.label === 'PAPER') c.paper++;
      else if (display.label === 'SHADOW' || display.label === 'SHADOW PAUSED') c.shadow++;
      else if (display.label === 'PAUSED') c.paused++;
      else if (display.label === 'SHADOW DONE') c.completed++;
    }
    return c;
  }, [enriched]);

  if (loading) {
    return (
      <View style={[styles.container, {alignItems: 'center', justifyContent: 'center'}]}>
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Active Bots</Text>
          <Text style={styles.headerSub}>{enriched.length} bot{enriched.length !== 1 ? 's' : ''} running</Text>
        </View>
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}>
        {FILTERS.map(f => {
          const count = counts[f.key];
          if (f.key !== 'all' && count === 0) return null;
          const isActive = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, isActive && {backgroundColor: `${f.color}18`, borderColor: f.color}]}
              onPress={() => setFilter(f.key)}
              activeOpacity={0.7}>
              {f.key !== 'all' && (
                <View style={[styles.filterDot, {backgroundColor: isActive ? f.color : 'rgba(255,255,255,0.2)'}]} />
              )}
              <Text style={[styles.filterChipText, isActive && {color: f.color}]}>{f.label}</Text>
              <View style={[styles.filterCount, isActive && {backgroundColor: `${f.color}30`}]}>
                <Text style={[styles.filterCountText, isActive && {color: f.color}]}>{count}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchData(); }}
            tintColor="#10B981"
            colors={['#10B981']}
            progressBackgroundColor="#161B22"
          />
        }>
        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🤖</Text>
            <Text style={styles.emptyTitle}>No bots here</Text>
            <Text style={styles.emptySub}>
              {filter === 'all' ? 'Subscribe to a bot to get started.' : `No ${filter} bots right now.`}
            </Text>
          </View>
        ) : (
          <View style={styles.botList}>
            {filtered.map(({bot, display}) => {
              const isShadow = bot.subStatus === 'shadow';
              const isPaused = bot.subStatus === 'paused';
              const returnColor = bot.totalReturn >= 0 ? '#10B981' : '#EF4444';
              const returnSign = bot.totalReturn >= 0 ? '+' : '';
              return (
                <TouchableOpacity
                  key={`${bot.id}-${bot.subscriptionId}`}
                  style={[styles.botCard, {borderLeftColor: display.color}]}
                  onPress={() => navigation.navigate('BotDetails', {botId: bot.id})}
                  activeOpacity={0.7}>
                  <View style={[styles.botAvatar, {backgroundColor: bot.avatarColor}]}>
                    <Text style={styles.botAvatarText}>{bot.avatarLetter}</Text>
                  </View>
                  <View style={styles.botInfo}>
                    <View style={styles.botNameRow}>
                      <Text style={styles.botName} numberOfLines={1}>{bot.name}</Text>
                      <View style={[styles.statusBadge, {backgroundColor: `${display.color}20`}]}>
                        {display.icon === 'completed' ? (
                          <Svg width={10} height={10} viewBox="0 0 16 16" fill="none" style={{marginRight: 4}}>
                            <Path d="M3 8.5L6.5 12L13 4" stroke={display.color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
                          </Svg>
                        ) : display.icon === 'paused' ? (
                          <Svg width={10} height={10} viewBox="0 0 16 16" fill="none" style={{marginRight: 4}}>
                            <Rect x={3} y={3} width={3.5} height={10} rx={1} fill={display.color} />
                            <Rect x={9.5} y={3} width={3.5} height={10} rx={1} fill={display.color} />
                          </Svg>
                        ) : (
                          <View style={[styles.statusBadgeDot, {backgroundColor: display.color}]} />
                        )}
                        <Text style={[styles.statusBadgeText, {color: display.color}]}>{display.label}</Text>
                      </View>
                    </View>
                    <Text style={styles.botPair} numberOfLines={1}>
                      {bot.pair}
                      {'  '}
                      <Text style={{color: returnColor, fontFamily: 'Inter-SemiBold'}}>
                        {returnSign}{bot.totalReturn.toFixed(1)}% ROI
                      </Text>
                    </Text>
                  </View>
                  {/* Actions */}
                  {!isShadow && !isPaused && (
                    <View style={styles.botActions}>
                      <TouchableOpacity
                        style={[styles.actionBtn, {backgroundColor: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.3)'}]}
                        onPress={(e) => { e.stopPropagation(); navigation.navigate('BotLiveFeed', {botId: bot.id, botName: bot.name, mode: 'live'}); }}
                        activeOpacity={0.7}>
                        <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
                          <Path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" fill="#10B981" />
                        </Svg>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => handlePause(bot.subscriptionId, bot.name)}
                        activeOpacity={0.7}>
                        <PauseIcon size={13} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.stopBtn]}
                        onPress={() => handleStop(bot.subscriptionId, bot.name)}
                        activeOpacity={0.7}>
                        <StopSquareIcon size={12} />
                      </TouchableOpacity>
                    </View>
                  )}
                  {isShadow && display.icon !== 'completed' && (
                    <View style={styles.botActions}>
                      <TouchableOpacity
                        style={[styles.actionBtn, {backgroundColor: 'rgba(59,130,246,0.1)', borderColor: 'rgba(59,130,246,0.3)', borderWidth: 1}]}
                        onPress={(e) => { e.stopPropagation(); navigation.navigate('BotLiveFeed', {botId: bot.id, botName: bot.name, mode: 'paper'}); }}
                        activeOpacity={0.7}>
                        <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
                          <Path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" fill="#3B82F6" />
                        </Svg>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={(e) => {
                          e.stopPropagation();
                          const session = shadowSessions.find(s => s.botId === bot.id && s.status === 'running');
                          if (session) botsService.pauseShadowSession(session.id).then(fetchData).catch(() => showAlert('Error', 'Failed to pause.'));
                        }}
                        activeOpacity={0.7}>
                        <PauseIcon size={13} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.stopBtn]}
                        onPress={(e) => {
                          e.stopPropagation();
                          const session = shadowSessions.find(s => s.botId === bot.id && s.status === 'running');
                          if (session) botsService.stopShadowSession(session.id).then(fetchData).catch(() => showAlert('Error', 'Failed to stop.'));
                        }}
                        activeOpacity={0.7}>
                        <StopSquareIcon size={12} />
                      </TouchableOpacity>
                    </View>
                  )}
                  {isShadow && display.icon === 'completed' && (
                    <TouchableOpacity
                      style={styles.goLiveBtn}
                      onPress={(e) => { e.stopPropagation(); navigation.navigate('BotDetails', {botId: bot.id}); }}
                      activeOpacity={0.7}>
                      <Text style={styles.goLiveText}>Go Live</Text>
                    </TouchableOpacity>
                  )}
                  {isPaused && (
                    <TouchableOpacity
                      style={styles.resumeBtn}
                      onPress={() => botsService.resume(bot.subscriptionId).then(fetchData).catch(() => showAlert('Error', 'Failed to resume.'))}
                      activeOpacity={0.7}>
                      <Text style={styles.resumeText}>Resume</Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        <View style={{height: 32}} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0A0D12'},
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {fontFamily: 'Inter-Bold', fontSize: 20, color: '#FFFFFF', letterSpacing: -0.3},
  headerSub: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 1},

  filterRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 20, paddingBottom: 14,
  },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 4, height: 32,
    borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  filterDot: {width: 6, height: 6, borderRadius: 3},
  filterChipText: {fontFamily: 'Inter-SemiBold', fontSize: 12, color: 'rgba(255,255,255,0.4)'},
  filterCount: {
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  filterCountText: {fontFamily: 'Inter-Bold', fontSize: 10, color: 'rgba(255,255,255,0.4)'},

  scrollContent: {paddingHorizontal: 20},

  emptyState: {alignItems: 'center', paddingTop: 60},
  emptyIcon: {fontSize: 48, marginBottom: 12},
  emptyTitle: {fontFamily: 'Inter-SemiBold', fontSize: 17, color: '#FFFFFF', marginBottom: 6},
  emptySub: {fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center'},

  botList: {gap: 8},
  botCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#161B22', borderRadius: 14,
    borderTopWidth: 1, borderBottomWidth: 1, borderRightWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
    borderBottomColor: 'rgba(255,255,255,0.07)',
    borderRightColor: 'rgba(255,255,255,0.07)',
    borderLeftWidth: 3,
    padding: 12, gap: 10,
  },
  botAvatar: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  botAvatarText: {fontFamily: 'Inter-Bold', fontSize: 16, color: '#FFFFFF'},
  botInfo: {flex: 1, gap: 4},
  botNameRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  botName: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF', flex: 1},
  statusBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
  },
  statusBadgeDot: {width: 6, height: 6, borderRadius: 3, marginRight: 5},
  statusBadgeText: {fontFamily: 'Inter-Bold', fontSize: 9, letterSpacing: 0.5},
  botPair: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.45)'},

  botActions: {flexDirection: 'row', gap: 6},
  actionBtn: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  stopBtn: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderColor: 'rgba(239,68,68,0.3)',
  },
  goLiveBtn: {
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.4)',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
  },
  goLiveText: {fontFamily: 'Inter-SemiBold', fontSize: 11, color: '#10B981'},
  resumeBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
  },
  resumeText: {fontFamily: 'Inter-SemiBold', fontSize: 11, color: '#FFFFFF'},
});
