import React, {useState, useCallback, useRef} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, useWindowDimensions, ActivityIndicator, RefreshControl, Animated} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {CommonActions} from '@react-navigation/native';
import Svg, {Path, Rect, Circle, Polygon} from 'react-native-svg';
import {RootStackParamList, Trade} from '../../types';
import {useAuth} from '../../context/AuthContext';
import {useToast} from '../../context/ToastContext';
import {dashboardApi, DashboardSummary, ActiveBot as DashActiveBot, ExchangePower} from '../../services/dashboard';
import {botsService} from '../../services/bots';
import {tradesApi} from '../../services/trades';
import {arenaApi, ArenaSession} from '../../services/arena';

// ─── Shadow session type (for cross-referencing status) ─────────────────────
interface ShadowSessionInfo {
  id: string;
  botId: string;
  status: string; // 'running' | 'completed' | 'paused' | 'cancelled'
}

/** Resolve the actual display status of a bot, cross-referencing shadow sessions */
function resolveBotDisplayStatus(bot: DashActiveBot, shadowSessions: ShadowSessionInfo[]) {
  // If there's an active/paused live subscription, that takes full priority —
  // a completed shadow session is no longer relevant once the user has gone live
  if (bot.subStatus === 'active' && bot.status === 'live') return {label: 'LIVE', color: '#10B981', icon: 'running' as const};
  if (bot.subStatus === 'paused' && bot.status === 'live') return {label: 'PAUSED', color: '#F97316', icon: 'paused' as const};

  // Check shadow sessions — only when no live subscription is active
  const sessions = shadowSessions.filter(s => s.botId === bot.id);
  const running = sessions.find(s => s.status === 'running');
  const completed = sessions.find(s => s.status === 'completed');
  const paused = sessions.find(s => s.status === 'paused');

  if (running) return {label: 'SHADOW', color: '#0D7FF2', icon: 'running' as const};
  if (paused) return {label: 'SHADOW PAUSED', color: '#F97316', icon: 'paused' as const};
  if (completed) return {label: 'SHADOW DONE', color: '#10B981', icon: 'completed' as const};

  // No shadow session, no live subscription — use remaining subscription states
  if (bot.subStatus === 'paused') return {label: 'PAUSED', color: '#F97316', icon: 'paused' as const};
  if (bot.subStatus === 'active') return {label: 'SHADOW', color: '#3B82F6', icon: 'running' as const};
  // stopped / expired with no shadow session
  return {label: 'SHADOW DONE', color: '#10B981', icon: 'completed' as const};
}
import PortfolioLineChart from '../../components/charts/PortfolioLineChart';
import PlusIcon from '../../components/icons/PlusIcon';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

// ─── Header Icons ────────────────────────────────────────────────────────────
                     
function WalletIcon({size = 20}: {size?: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Rect x={1} y={5} width={18} height={13} rx={2.5} stroke="#FFFFFF" strokeWidth={1.6} />
      <Path d="M1 9 L19 9" stroke="#FFFFFF" strokeWidth={1.6} />
      <Path d="M4 5 L6 2 M14 2 L16 5" stroke="#FFFFFF" strokeWidth={1.5} strokeLinecap="round" />
      <Circle cx={14.5} cy={13} r={1.5} fill="#FFFFFF" />
    </Svg>
  );
}

function SearchIconSvg({size = 18, color = 'rgba(255,255,255,0.6)'}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Circle cx={7.5} cy={7.5} r={5} stroke={color} strokeWidth={1.6} />
      <Path d="M11.5 11.5 L16 16" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

function ChatRoomIcon({size = 18, color = 'rgba(255,255,255,0.6)'}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Bell icon with dot — contained strictly within viewBox so no stretching
function BellIconSvg({size = 20, color = 'rgba(255,255,255,0.6)', hasDot = false}: {size?: number; color?: string; hasDot?: boolean}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5.5 15C5.5 15 5 14.3 5 12.5C5 9.46 7.46 7 10.5 7H13.5C16.54 7 19 9.46 19 12.5C19 14.3 18.5 15 18.5 15C18.5 15 20 15.5 20 17H4C4 15.5 5.5 15 5.5 15Z"
        stroke={color} strokeWidth={1.5} strokeLinejoin="round"
      />
      <Path d="M10 17C10 18.1 10.9 19 12 19C13.1 19 14 18.1 14 17" stroke={color} strokeWidth={1.5} />
      {hasDot && <Circle cx="18.5" cy="5.5" r="2.5" fill="#EF4444" />}
    </Svg>
  );
}

// ─── Bot Avatar Icons ─────────────────────────────────────────────────────────

function LightningIcon({size = 18}: {size?: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path d="M10.5 2 L5 10 L9 10 L7.5 16 L13 8 L9 8 Z" fill="#FFFFFF" />
    </Svg>
  );
}

function GridIcon({size = 18}: {size?: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Rect x={2} y={2} width={5.5} height={5.5} rx={1.2} fill="#FFFFFF" />
      <Rect x={10.5} y={2} width={5.5} height={5.5} rx={1.2} fill="#FFFFFF" />
      <Rect x={2} y={10.5} width={5.5} height={5.5} rx={1.2} fill="#FFFFFF" />
      <Rect x={10.5} y={10.5} width={5.5} height={5.5} rx={1.2} fill="#FFFFFF" />
    </Svg>
  );
}

function TrendIcon({size = 18}: {size?: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path d="M2 13 L6 9 L9 11 L13 6 L16 8" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M13 6 L16 6 L16 9" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

// ─── Bot Action Icons ─────────────────────────────────────────────────────────

// Proper pause icon (two vertical bars)
function PauseIcon({size = 13, color = 'rgba(255,255,255,0.7)'}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 13 13" fill="none">
      <Rect x={2} y={2} width={3.5} height={9} rx={1} fill={color} />
      <Rect x={7.5} y={2} width={3.5} height={9} rx={1} fill={color} />
    </Svg>
  );
}

// Stop / square icon (red)
function StopSquareIcon({size = 13}: {size?: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 13 13" fill="none">
      <Rect x={1.5} y={1.5} width={10} height={10} rx={2} fill="#EF4444" opacity={0.85} />
    </Svg>
  );
}

const BOT_ICONS: Record<string, React.FC> = {
  bot1: () => <LightningIcon size={18} />,
  bot2: () => <GridIcon size={18} />,
  bot3: () => <TrendIcon size={18} />,
};

// ─── Coin SVG Icons ───────────────────────────────────────────────────────────

function BTCIcon({size = 38}: {size?: number}) {
  const r = size / 2;
  return (
    <Svg width={size} height={size} viewBox="0 0 38 38" fill="none">
      <Circle cx={19} cy={19} r={19} fill="#F7931A" />
      {/* B shape */}
      <Path
        d="M13 11 L13 27 M13 11 L20 11 Q24 11 24 14.5 Q24 18 20 18 L13 18 M13 18 L21 18 Q25.5 18 25.5 22 Q25.5 27 21 27 L13 27"
        stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" fill="none"
      />
      <Path d="M16 10 L16 12 M20 10 L20 12 M16 27 L16 29 M20 27 L20 29"
        stroke="#FFFFFF" strokeWidth={1.5} strokeLinecap="round"
      />
    </Svg>
  );
}

function ETHIcon({size = 38}: {size?: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 38 38" fill="none">
      <Circle cx={19} cy={19} r={19} fill="#627EEA" />
      <Path d="M19 8 L19 22 L27 18.5 Z" fill="rgba(255,255,255,0.9)" />
      <Path d="M19 8 L11 18.5 L19 22 Z" fill="rgba(255,255,255,0.6)" />
      <Path d="M19 24 L19 30 L27 20 Z" fill="rgba(255,255,255,0.9)" />
      <Path d="M19 24 L11 20 L19 30 Z" fill="rgba(255,255,255,0.6)" />
    </Svg>
  );
}

function SOLIcon({size = 38}: {size?: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 38 38" fill="none">
      <Circle cx={19} cy={19} r={19} fill="#9945FF" />
      <Path d="M11 24 L27 24 L25 28 L9 28 Z" fill="#FFFFFF" />
      <Path d="M11 16.5 L27 16.5 L25 20.5 L9 20.5 Z" fill="#FFFFFF" opacity={0.8} />
      <Path d="M9 10 L25 10 L27 14 L11 14 Z" fill="#FFFFFF" opacity={0.6} />
    </Svg>
  );
}

function MATICIcon({size = 38}: {size?: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 38 38" fill="none">
      <Circle cx={19} cy={19} r={19} fill="#8247E5" />
      <Polygon
        points="19,9 26,13.5 26,22.5 19,27 12,22.5 12,13.5"
        stroke="#FFFFFF" strokeWidth={1.5} fill="none"
      />
      <Path d="M15 16.5 L19 14 L23 16.5 L23 21.5 L19 24 L15 21.5 Z" fill="#FFFFFF" opacity={0.85} />
    </Svg>
  );
}

function BNBIcon({size = 38}: {size?: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 38 38" fill="none">
      <Circle cx={19} cy={19} r={19} fill="#F3BA2F" />
      <Path d="M19 10 L22 13 L19 16 L16 13 Z M19 22 L22 25 L19 28 L16 25 Z M10 19 L13 16 L16 19 L13 22 Z M22 19 L25 16 L28 19 L25 22 Z M19 16.5 L21.5 19 L19 21.5 L16.5 19 Z"
        fill="#FFFFFF"
      />
    </Svg>
  );
}

const COIN_ICON_MAP: Record<string, React.FC<{size?: number}>> = {
  BTC: BTCIcon,
  ETH: ETHIcon,
  SOL: SOLIcon,
  MATIC: MATICIcon,
  BNB: BNBIcon,
};

function CoinIcon({symbol, size = 38}: {symbol: string; size?: number}) {
  const coin = symbol.split('/')[0];
  const Icon = COIN_ICON_MAP[coin];
  if (Icon) return <Icon size={size} />;
  // Fallback for unknown coins
  const COIN_COLORS: Record<string, string> = {default: '#6B7280'};
  const color = COIN_COLORS[coin] || '#6B7280';
  return (
    <View style={{width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center'}}>
      <Text style={{fontFamily: 'Inter-Bold', fontSize: size * 0.38, color: '#FFFFFF'}}>{coin.charAt(0)}</Text>
    </View>
  );
}

function formatTimeAgo(date: Date): string {
  if (!date || isNaN(date.getTime())) return '';
  const ts = date.getTime();
  if (ts < 1000000000000) return ''; // before ~2001 = invalid/epoch
  const diff = (Date.now() - ts) / 1000;
  if (diff < 0) return '';
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.round(diff / 86400)}d ago`;
  return date.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const {width} = useWindowDimensions();
  const navigation = useNavigation<NavProp>();
  const {user: authUser, isNewUser} = useAuth();
  const {alert: showAlert, showConfirm} = useToast();

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [activeBots, setActiveBots] = useState<DashActiveBot[]>([]);
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);
  const [equityData, setEquityData] = useState<number[]>([]);
  const [equityDates, setEquityDates] = useState<(string | Date)[]>([]);
  const [equityIsReal, setEquityIsReal] = useState(false);
  const [equityLoading, setEquityLoading] = useState(false);
  const [activeArena, setActiveArena] = useState<ArenaSession | null>(null);
  const [shadowSessions, setShadowSessions] = useState<ShadowSessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bpOpen, setBpOpen] = useState(false);
  const bpAnim = useRef(new Animated.Value(0)).current;

  const fetchEquity = useCallback(async (days: number) => {
    setEquityLoading(true);
    try {
      const result = await dashboardApi.getEquityHistoryFull(days);
      setEquityData(result.equityData);
      setEquityDates(result.dates);
      setEquityIsReal(result.isRealData);
    } catch {
      // keep existing data
    } finally {
      setEquityLoading(false);
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [s, bots, trades, arenaSession, shadowRes] = await Promise.all([
        dashboardApi.getSummary(),
        dashboardApi.getActiveBots(),
        tradesApi.getRecent(5).catch(() => [] as Trade[]),
        arenaApi.getActiveSession().catch(() => null),
        botsService.getShadowSessions().then((res: any) => {
          const items = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
          return items.map((s: any) => ({id: s.id, botId: s.botId, status: s.status})) as ShadowSessionInfo[];
        }).catch(() => [] as ShadowSessionInfo[]),
      ]);
      setSummary(s);
      setActiveBots(bots);
      setRecentTrades(trades);
      setActiveArena(arenaSession);
      setShadowSessions(shadowRes);
      // Fetch equity separately (default 30 days)
      await fetchEquity(30);
    } catch (e) {
      showAlert('Error', 'Failed to load dashboard data. Pull down to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchEquity]);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const displayName = authUser?.name || 'Trader';
  const firstName = displayName.split(' ')[0];
  const avatarInitials = displayName.split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase();
  const greetingLabel = isNewUser ? 'WELCOME' : 'WELCOME BACK';

  const totalBalance = summary?.totalBalance ?? 0;
  const totalProfitPercent = summary?.totalProfitPercent ?? 0;
  const totalProfit = summary?.totalProfit ?? 0;
  const accountBalance = summary?.accountBalance ?? 0;
  const buyingPower = summary?.buyingPower ?? 0;
  const exchanges: ExchangePower[] = summary?.exchanges ?? [];

  const toggleBpDropdown = () => {
    const toValue = bpOpen ? 0 : 1;
    setBpOpen(!bpOpen);
    Animated.timing(bpAnim, {toValue, duration: 220, useNativeDriver: true}).start();
  };
  const chevronRotate = bpAnim.interpolate({inputRange: [0, 1], outputRange: ['0deg', '180deg']});

  // Sort bots: live running → paper running → shadow running → paused → shadow paused → completed/idle
  const sortedBots = [...activeBots].sort((a, b) => {
    const priority = (bot: DashActiveBot) => {
      const d = resolveBotDisplayStatus(bot, shadowSessions);
      if (d.label === 'LIVE') return 0;
      if (d.label === 'SHADOW' && d.icon === 'running') return 1;
      if (d.label === 'SHADOW') return 2;
      if (d.label === 'PAUSED') return 3;
      if (d.label === 'SHADOW PAUSED') return 4;
      if (d.label === 'SHADOW DONE') return 5;
      return 6;
    };
    return priority(a) - priority(b);
  });
  const BOTS_LIMIT = 7;
  const visibleBots = sortedBots.slice(0, BOTS_LIMIT);
  const hasMoreBots = sortedBots.length > BOTS_LIMIT;

  const isPositive = totalProfitPercent >= 0;
  const profitColor = isPositive ? '#10B981' : '#EF4444';
  const profitSign = isPositive ? '+' : '';
  const CHART_WIDTH = width - 40;

  const goToMarket = () => {
    navigation.dispatch(
      CommonActions.navigate({name: 'Main', params: {screen: 'Market'}}),
    );
  };

  const handleSearch = () => {
    navigation.dispatch(
      CommonActions.navigate({name: 'Main', params: {screen: 'Market'}}),
    );
  };

  const handlePauseBot = (botId: string, botName: string) => {
    showConfirm({
      title: 'Pause Bot',
      message: `Pause "${botName}"? It will stop trading until resumed.`,
      confirmText: 'Pause',
      onConfirm: () => {
        botsService.pause(botId).then(fetchData).catch(() => showAlert('Error', 'Failed to pause bot.'));
      },
    });
  };

  const handleStopBot = (botId: string, botName: string) => {
    showConfirm({
      title: 'Stop Bot',
      message: `Stop "${botName}" permanently? This will close all open positions.`,
      confirmText: 'Stop',
      destructive: true,
      onConfirm: () => {
        botsService.stop(botId).then(fetchData).catch(() => showAlert('Error', 'Failed to stop bot.'));
      },
    });
  };

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
        <TouchableOpacity
          style={styles.avatarRow}
          onPress={() => navigation.dispatch(CommonActions.navigate({name: 'Main', params: {screen: 'Profile'}}))}
          activeOpacity={0.7}>
          <View style={[styles.avatarWrap, {backgroundColor: '#10B981'}]}>
            <Text style={styles.avatarInitials}>{avatarInitials}</Text>
          </View>
          <View>
            <Text style={styles.appLabel}>{greetingLabel}</Text>
            <Text style={styles.screenTitle}>{firstName}</Text>
          </View>
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconBtn} onPress={handleSearch}>
            <SearchIconSvg size={18} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => navigation.navigate('TradingRoom' as any)}>
            <ChatRoomIcon size={18} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => navigation.navigate('Notifications')}>
            <BellIconSvg size={28} hasDot />
          </TouchableOpacity>
        </View>
      </View>

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
        {/* Balance section */}
        <View style={styles.balanceSection}>
          <Text style={styles.balanceLabel}>Total Balance</Text>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceValue}>
              ${totalBalance.toLocaleString('en-US', {minimumFractionDigits: 2})}
            </Text>
            <View style={styles.pctBadge}>
              <Text style={styles.pctBadgeText}>
                {profitSign}{totalProfitPercent.toFixed(1)}%
              </Text>
            </View>
          </View>
          <Text style={[styles.todayProfit, {color: profitColor}]}>
            {profitSign}${totalProfit.toFixed(2)} today
          </Text>
        </View>

        {/* Metrics cards — combined */}
        <View style={[styles.metricsRow, bpOpen && {marginBottom: 0}]}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>ACCOUNT BALANCE</Text>
            <Text style={styles.metricValue}>${accountBalance.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</Text>
          </View>
          <TouchableOpacity
            style={styles.metricCard}
            activeOpacity={exchanges.length > 0 ? 0.75 : 1}
            onPress={exchanges.length > 0 ? toggleBpDropdown : undefined}>
            <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
              <Text style={styles.metricLabel}>BUYING POWER</Text>
              {exchanges.length > 0 && (
                <Animated.View style={{transform: [{rotate: chevronRotate}]}}>
                  <Svg width={14} height={14} viewBox="0 0 14 14" fill="none">
                    <Path d="M3 5 L7 9 L11 5" stroke="rgba(255,255,255,0.35)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                </Animated.View>
              )}
            </View>
            <Text style={[styles.metricValue, {color: '#10B981'}]}>${buyingPower.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</Text>
            <Text style={{fontFamily: 'Inter-Regular', fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 2}}>ALL EXCHANGES</Text>
          </TouchableOpacity>
        </View>

        {/* Per-exchange breakdown — expands below the metrics row */}
        {bpOpen && exchanges.length > 0 && (
          <View style={styles.bpDropdown}>
            {exchanges.map((ex, i) => {
              const isCrypto = ex.assetClass === 'crypto';
              const accentColor = isCrypto ? '#F59E0B' : '#3B82F6';
              const providerLabel = ex.provider.charAt(0).toUpperCase() + ex.provider.slice(1);
              return (
                <View key={i} style={[styles.bpExBox, i < exchanges.length - 1 && {marginBottom: 8}]}>
                  <View style={styles.bpExHeader}>
                    <View style={[styles.bpExBadge, {backgroundColor: `${accentColor}20`}]}>
                      <Text style={[styles.bpExBadgeText, {color: accentColor}]}>{isCrypto ? 'CRYPTO' : 'STOCKS'}</Text>
                    </View>
                    <Text style={styles.bpExName}>{providerLabel}</Text>
                    {ex.sandbox && <Text style={styles.bpExSandbox}>TEST</Text>}
                  </View>
                  <View style={styles.bpExStats}>
                    <View style={styles.bpExStat}>
                      <Text style={styles.bpExStatVal}>${parseFloat(ex.totalBalance.toString()).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</Text>
                      <Text style={styles.bpExStatLbl}>Balance</Text>
                    </View>
                    <View style={styles.bpExStat}>
                      <Text style={[styles.bpExStatVal, {color: '#F97316'}]}>${parseFloat(ex.allocatedCapital.toString()).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</Text>
                      <Text style={styles.bpExStatLbl}>In Bots</Text>
                    </View>
                    <View style={[styles.bpExStat, {backgroundColor: `${accentColor}10`, borderColor: `${accentColor}20`}]}>
                      <Text style={[styles.bpExStatVal, {color: '#10B981'}]}>${parseFloat(ex.buyingPower.toString()).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</Text>
                      <Text style={styles.bpExStatLbl}>Free</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Equity Curve */}
        <View style={styles.chartCard}>
          <PortfolioLineChart
            data={equityData}
            dates={equityDates}
            currentValue={totalBalance}
            width={CHART_WIDTH - 32}
            height={220}
            isRealData={equityIsReal}
            loading={equityLoading}
            onTimeframeChange={fetchEquity}
          />
        </View>

        {/* Active Bots */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
              <Text style={styles.sectionTitle}>ACTIVE BOTS</Text>
              {activeBots.length > 0 && (
                <View style={{backgroundColor: 'rgba(16,185,129,0.15)', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2}}>
                  <Text style={{fontFamily: 'Inter-Bold', fontSize: 11, color: '#10B981'}}>{activeBots.length}</Text>
                </View>
              )}
            </View>
            <View style={{flexDirection: 'row', gap: 12, alignItems: 'center'}}>
              {hasMoreBots && (
                <TouchableOpacity onPress={() => navigation.navigate('ActiveBots')}>
                  <Text style={styles.sectionAction}>View All</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={goToMarket}>
                <Text style={[styles.sectionAction, {color: 'rgba(255,255,255,0.35)'}]}>Store</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.botList}>
            {activeBots.length === 0 && (
              <View style={{flexDirection: 'row', gap: 10}}>
                <TouchableOpacity
                  style={[styles.botCard, {borderLeftColor: '#10B981', justifyContent: 'center', paddingVertical: 20, flex: 1}]}
                  onPress={() => navigation.navigate('BotBuilder', {})}
                  activeOpacity={0.7}>
                  <View style={{alignItems: 'center', flex: 1}}>
                    <Text style={{fontSize: 28, marginBottom: 6}}>🤖</Text>
                    <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#FFFFFF', marginBottom: 2}}>Create Bot</Text>
                    <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: '#10B981'}}>Build your own</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.botCard, {borderLeftColor: '#3B82F6', justifyContent: 'center', paddingVertical: 20, flex: 1}]}
                  onPress={goToMarket}
                  activeOpacity={0.7}>
                  <View style={{alignItems: 'center', flex: 1}}>
                    <Text style={{fontSize: 28, marginBottom: 6}}>🏪</Text>
                    <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#FFFFFF', marginBottom: 2}}>Marketplace</Text>
                    <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: '#3B82F6'}}>Browse bots</Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}
            {visibleBots.map((bot: DashActiveBot) => {
              const returnColor = bot.totalReturn >= 0 ? '#10B981' : '#EF4444';
              const returnSign = bot.totalReturn >= 0 ? '+' : '';
              const display = resolveBotDisplayStatus(bot, shadowSessions);
              // Use display as single source of truth — avoids raw subStatus mismatches
              const isLiveRunning = display.label === 'LIVE';
              const isShadowRunning = display.label === 'SHADOW' && display.icon === 'running';
              const isShadowPaused = display.label === 'SHADOW PAUSED';
              const isShadowCompleted = display.icon === 'completed';
              const isPaused = display.label === 'PAUSED';
              return (
                <TouchableOpacity
                  key={bot.id}
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
                  {isLiveRunning && (
                    <View style={styles.botActions}>
                      <TouchableOpacity
                        style={[styles.botActionBtn, {backgroundColor: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.3)'}]}
                        onPress={(e) => { e.stopPropagation(); navigation.navigate('BotLiveFeed', {botId: bot.id, botName: bot.name, mode: 'live'}); }}
                        activeOpacity={0.7}>
                        <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
                          <Path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" fill="#10B981" />
                        </Svg>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.botActionBtn}
                        onPress={() => handlePauseBot(bot.subscriptionId, bot.name)}
                        activeOpacity={0.7}>
                        <PauseIcon size={13} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.botActionBtn, styles.botStopBtn]}
                        onPress={() => handleStopBot(bot.subscriptionId, bot.name)}
                        activeOpacity={0.7}>
                        <StopSquareIcon size={12} />
                      </TouchableOpacity>
                    </View>
                  )}
                  {(isShadowRunning || isShadowPaused) && (
                    <View style={styles.botActions}>
                      <TouchableOpacity
                        style={[styles.botActionBtn, {backgroundColor: 'rgba(59,130,246,0.1)', borderColor: 'rgba(59,130,246,0.3)', borderWidth: 1}]}
                        onPress={(e) => { e.stopPropagation(); navigation.navigate('BotLiveFeed', {botId: bot.id, botName: bot.name, mode: 'paper'}); }}
                        activeOpacity={0.7}>
                        <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
                          <Path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" fill="#3B82F6" />
                        </Svg>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.botActionBtn}
                        onPress={(e) => {
                          e.stopPropagation();
                          const session = shadowSessions.find(s => s.botId === bot.id && s.status === 'running');
                          if (session) {
                            botsService.pauseShadowSession(session.id).then(fetchData).catch(() => showAlert('Error', 'Failed to pause shadow.'));
                          }
                        }}
                        activeOpacity={0.7}>
                        <PauseIcon size={13} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.botActionBtn, styles.botStopBtn]}
                        onPress={(e) => {
                          e.stopPropagation();
                          const session = shadowSessions.find(s => s.botId === bot.id && s.status === 'running');
                          if (session) {
                            botsService.stopShadowSession(session.id).then(fetchData).catch(() => showAlert('Error', 'Failed to stop shadow.'));
                          }
                        }}
                        activeOpacity={0.7}>
                        <StopSquareIcon size={12} />
                      </TouchableOpacity>
                    </View>
                  )}
                  {isShadowCompleted && (
                    <TouchableOpacity
                      style={[styles.resumeSmallBtn, {backgroundColor: 'rgba(16,185,129,0.15)', borderColor: 'rgba(16,185,129,0.4)'}]}
                      onPress={(e) => { e.stopPropagation(); navigation.navigate('BotPurchase', {botId: bot.id}); }}
                      activeOpacity={0.7}>
                      <Text style={[styles.resumeSmallText, {color: '#10B981'}]}>Go Live</Text>
                    </TouchableOpacity>
                  )}
                  {isPaused && (
                    <TouchableOpacity
                      style={styles.resumeSmallBtn}
                      onPress={() => {
                        botsService.resume(bot.subscriptionId).then(fetchData).catch(() => showAlert('Error', 'Failed to resume bot.'));
                      }}
                      activeOpacity={0.7}>
                      <Text style={styles.resumeSmallText}>Resume</Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              );
            })}
            {hasMoreBots && (
              <TouchableOpacity
                style={styles.viewAllBotsBtn}
                onPress={() => navigation.navigate('ActiveBots')}
                activeOpacity={0.7}>
                <Text style={styles.viewAllBotsBtnText}>View all {sortedBots.length} bots</Text>
                <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                  <Path d="M9 18l6-6-6-6" stroke="#10B981" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Recent Trades */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>RECENT TRADES</Text>
            <TouchableOpacity onPress={() => navigation.navigate('TradeHistory')}>
              <Text style={styles.sectionAction}>History</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.sectionCard}>
            {recentTrades.length === 0 && (
              <View style={{paddingVertical: 24, alignItems: 'center'}}>
                <Text style={{fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.35)'}}>No recent trades</Text>
              </View>
            )}
            {recentTrades.map((trade: Trade, idx: number) => {
              // console.log("check the trades ++++++ ", trade);
              const isBuy = trade.side === 'BUY';
              const coin = trade.symbol.split('/')[0] || trade.symbol;
              const isLast = idx === recentTrades.length - 1;
              const tradeValue = trade.amount > 0 ? trade.amount * trade.price : trade.price;
              const modeLabel = trade.mode === 'arena' ? 'ARENA' : trade.mode === 'shadow' ? 'SHADOW' : trade.mode === 'live' ? 'LIVE' : '';
              const modeColor = trade.mode === 'arena' ? '#8B5CF6' : trade.mode === 'shadow' ? '#3B82F6' : '#10B981';
              return (
                <View
                  key={trade.id}
                  style={[styles.tradeRow, !isLast && styles.tradeRowBorder]}>
                  <CoinIcon symbol={trade.symbol} size={40} />
                  <View style={styles.tradeInfo}>
                    <View style={styles.tradeTopRow}>
                      <View style={[styles.sideBadge, isBuy ? styles.buyBadge : styles.sellBadge]}>
                        <Text style={[styles.sideText, isBuy ? styles.buyText : styles.sellText]}>
                          {trade.side}
                        </Text>
                      </View>
                      <Text style={styles.tradeSymbol}>{coin}</Text>
                      {modeLabel ? (
                        <View style={{backgroundColor: `${modeColor}15`, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3, marginLeft: 4}}>
                          <Text style={{fontFamily: 'Inter-Bold', fontSize: 8, color: modeColor}}>{modeLabel}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.tradeMeta}>
                      {trade.botName} · {formatTimeAgo(trade.timestamp)}
                    </Text>
                  </View>
                  <View style={styles.tradeRight}>
                    <Text style={styles.tradeAmount}>
                      ${tradeValue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </Text>
                    {trade.amount > 0 && (
                      <Text style={styles.tradeQty}>
                        {trade.amount < 1 ? trade.amount.toFixed(4) : trade.amount.toFixed(2)} {coin}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Live Arena Battle Banner */}
        {activeArena && activeArena.status === 'running' && (
          <TouchableOpacity
            style={styles.liveBattleBanner}
            onPress={() => navigation.navigate('ArenaLive', {gladiatorIds: [], sessionId: activeArena.id})}
            activeOpacity={0.8}>
            <View style={styles.liveBattlePulse}>
              <View style={styles.liveBattleDot} />
            </View>
            <View style={{flex: 1, marginLeft: 12}}>
              <Text style={styles.liveBattleTitle}>Live Battle Running</Text>
              <Text style={styles.liveBattleSub}>
                {activeArena.gladiators.length} bots competing · {Math.round((activeArena.progress ?? 0) * 100)}% complete
              </Text>
            </View>
            <View style={styles.liveBattleViewBtn}>
              <Text style={styles.liveBattleViewText}>VIEW</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Arena Banner */}
        <TouchableOpacity
          style={styles.arenaBanner}
          onPress={() => navigation.navigate('ArenaSetup')}
          activeOpacity={0.8}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
            <Path d="M14.5 17.5L3 6V3h3l11.5 11.5" stroke="#10B981" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            <Path d="M13 19l6-6M20.5 3.5l-6 6" stroke="#10B981" strokeWidth={1.8} strokeLinecap="round" />
          </Svg>
          <View style={{flex: 1, marginLeft: 12}}>
            <Text style={styles.arenaBannerTitle}>Bot Battle Arena</Text>
            <Text style={styles.arenaBannerSub}>Compete your bots in a 30-day trading challenge</Text>
          </View>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Path d="M9 5l7 7-7 7" stroke="rgba(255,255,255,0.4)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>

        {/* Connect Exchange */}
        <TouchableOpacity
          style={styles.exchangeBanner}
          onPress={() => navigation.navigate('ExchangeConnect')}
          activeOpacity={0.8}>
          <View style={styles.exchangeBannerIcon}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" stroke="#10B981" strokeWidth={1.8} strokeLinecap="round" />
              <Path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke="#10B981" strokeWidth={1.8} strokeLinecap="round" />
            </Svg>
          </View>
          <View style={{flex: 1, marginLeft: 12}}>
            <Text style={styles.exchangeBannerTitle}>Connect Exchange</Text>
            <Text style={styles.exchangeBannerSub}>Sync your assets for live trading</Text>
          </View>
          <Text style={styles.exchangeConnectText}>Connect</Text>
        </TouchableOpacity>

        <View style={{height: 24}} />
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('QuickActions')}
        activeOpacity={0.85}>
        <PlusIcon size={22} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0A0D12'},
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16,
  },
  avatarRow: {flexDirection: 'row', alignItems: 'center', gap: 12},
  avatarWrap: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: {
    fontFamily: 'Inter-Bold', fontSize: 15, color: '#FFFFFF',
  },
  appLabel: {
    fontFamily: 'Inter-Medium', fontSize: 10, letterSpacing: 1.2,
    color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase',
  },
  screenTitle: {fontFamily: 'Inter-Bold', fontSize: 18, color: '#FFFFFF', letterSpacing: -0.3},
  headerActions: {flexDirection: 'row', gap: 8},
  iconBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  scrollContent: {paddingHorizontal: 20},

  // Balance
  balanceSection: {marginBottom: 16},
  balanceLabel: {fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 6},
  balanceRow: {flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4},
  balanceValue: {fontFamily: 'Inter-Bold', fontSize: 36, color: '#FFFFFF', letterSpacing: -1.2},
  pctBadge: {backgroundColor: 'rgba(16,185,129,0.18)', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4},
  pctBadgeText: {fontFamily: 'Inter-SemiBold', fontSize: 12, color: '#10B981'},
  todayProfit: {fontFamily: 'Inter-Medium', fontSize: 13},

  // Metrics
  metricsRow: {flexDirection: 'row', gap: 10, marginBottom: 16},
  metricCard: {
    flex: 1, backgroundColor: '#161B22', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  metricLabel: {
    fontFamily: 'Inter-Medium', fontSize: 9, letterSpacing: 0.8,
    color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 6,
  },
  metricValue: {fontFamily: 'Inter-Bold', fontSize: 18, color: '#FFFFFF'},

  // Buying Power dropdown
  bpDropdown: {
    marginTop: -6, marginBottom: 16, paddingTop: 14, paddingBottom: 4,
    paddingHorizontal: 12, backgroundColor: '#161B22',
    borderBottomLeftRadius: 14, borderBottomRightRadius: 14,
    borderWidth: 1, borderTopWidth: 0, borderColor: 'rgba(255,255,255,0.07)',
  },
  bpExBox: {
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', padding: 10,
  },
  bpExHeader: {flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10},
  bpExBadge: {paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5},
  bpExBadgeText: {fontFamily: 'Inter-Bold', fontSize: 9, letterSpacing: 0.5},
  bpExName: {fontFamily: 'Inter-SemiBold', fontSize: 12, color: '#FFFFFF', flex: 1},
  bpExSandbox: {fontFamily: 'Inter-Regular', fontSize: 9, color: '#F97316'},
  bpExStats: {flexDirection: 'row', gap: 6},
  bpExStat: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 7, paddingHorizontal: 8, alignItems: 'center',
  },
  bpExStatVal: {fontFamily: 'Inter-SemiBold', fontSize: 11, color: '#FFFFFF'},
  bpExStatLbl: {fontFamily: 'Inter-Regular', fontSize: 9, color: 'rgba(255,255,255,0.35)', marginTop: 2},

  // Chart card
  chartCard: {
    backgroundColor: '#0F1520', borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    padding: 16, marginBottom: 20,
  },
  chartHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12},
  chartTitle: {fontFamily: 'Inter-SemiBold', fontSize: 11, letterSpacing: 1.2, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase'},
  tfRow: {flexDirection: 'row', gap: 2},
  tfBtn: {paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8},
  tfBtnActive: {backgroundColor: '#10B981'},
  tfText: {fontFamily: 'Inter-Medium', fontSize: 11, color: 'rgba(255,255,255,0.35)'},
  tfTextActive: {color: '#FFFFFF'},

  // Sections
  section: {marginBottom: 16},
  sectionHeaderRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10},
  sectionTitle: {fontFamily: 'Inter-Bold', fontSize: 15, color: '#FFFFFF'},
  sectionAction: {fontFamily: 'Inter-Medium', fontSize: 13, color: '#10B981'},
  sectionCard: {
    backgroundColor: '#161B22', borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 16,
  },

  // Bot list
  botList: {gap: 8},
  viewAllBotsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 4, paddingVertical: 12,
    backgroundColor: 'rgba(16,185,129,0.07)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.15)',
  },
  viewAllBotsBtnText: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#10B981'},
  botCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#161B22', borderRadius: 14,
    borderTopWidth: 1, borderBottomWidth: 1, borderRightWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
    borderBottomColor: 'rgba(255,255,255,0.07)',
    borderRightColor: 'rgba(255,255,255,0.07)',
    borderLeftWidth: 3,
    paddingVertical: 12, paddingHorizontal: 14,
  },
  botAvatar: {width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12},
  botInfo: {flex: 1, marginRight: 8},
  botNameRow: {flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3},
  botName: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF', flexShrink: 1},
  liveDot: {width: 7, height: 7, borderRadius: 4},
  botPair: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.4)'},
  botActions: {flexDirection: 'row', gap: 6},
  botActionBtn: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center', justifyContent: 'center',
  },
  botStopBtn: {backgroundColor: 'rgba(239,68,68,0.1)'},
  botAvatarText: {fontFamily: 'Inter-Bold', fontSize: 16, color: '#FFFFFF'},
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
    flexShrink: 0,
  },
  statusBadgeDot: {width: 5, height: 5, borderRadius: 3},
  statusBadgeText: {fontFamily: 'Inter-Bold', fontSize: 9, letterSpacing: 0.5},
  resumeSmallBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    backgroundColor: '#10B981',
  },
  resumeSmallText: {fontFamily: 'Inter-SemiBold', fontSize: 11, color: '#FFFFFF'},

  // Trade rows
  tradeRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 12},
  tradeRowBorder: {borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)'},
  tradeInfo: {flex: 1, marginLeft: 12},
  tradeTopRow: {flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3},
  sideBadge: {paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5},
  buyBadge: {backgroundColor: 'rgba(16,185,129,0.18)'},
  sellBadge: {backgroundColor: 'rgba(239,68,68,0.18)'},
  sideText: {fontFamily: 'Inter-Bold', fontSize: 10, letterSpacing: 0.3},
  buyText: {color: '#10B981'},
  sellText: {color: '#EF4444'},
  tradeSymbol: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF'},
  tradeMeta: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.35)'},
  tradeRight: {alignItems: 'flex-end'},
  tradeAmount: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF'},
  tradeQty: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2},

  // Live battle banner
  liveBattleBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(234,179,8,0.08)', borderRadius: 14,
    padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(234,179,8,0.25)',
  },
  liveBattlePulse: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(234,179,8,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  liveBattleDot: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#EAB308',
  },
  liveBattleTitle: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#EAB308'},
  liveBattleSub: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2},
  liveBattleViewBtn: {
    backgroundColor: '#EAB308', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  liveBattleViewText: {fontFamily: 'Inter-Bold', fontSize: 11, color: '#0A0E14', letterSpacing: 0.5},

  // Arena banner
  arenaBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(16,185,129,0.08)', borderRadius: 14,
    padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)',
  },
  arenaBannerTitle: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF'},
  arenaBannerSub: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2},

  // Exchange banner
  exchangeBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#161B22', borderRadius: 14,
    padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  exchangeBannerIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(16,185,129,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  exchangeBannerTitle: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF'},
  exchangeBannerSub: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2},
  exchangeConnectText: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#10B981'},

  // FAB
  fab: {
    position: 'absolute', bottom: 22, right: 20,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#10B981',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#10B981', shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.5, shadowRadius: 12, elevation: 10,
  },
});
