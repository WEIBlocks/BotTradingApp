import React, {useState, useCallback} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, useWindowDimensions, Alert, ActivityIndicator, RefreshControl} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {CommonActions} from '@react-navigation/native';
import Svg, {Path, Rect, Circle, Polygon} from 'react-native-svg';
import {RootStackParamList, Trade} from '../../types';
import {useAuth} from '../../context/AuthContext';
import {dashboardApi, DashboardSummary, ActiveBot as DashActiveBot} from '../../services/dashboard';
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
  if (bot.subStatus !== 'shadow') {
    const isPaused = bot.subStatus === 'paused';
    const isLive = bot.subStatus === 'active' && bot.status === 'live';
    return {
      label: isPaused ? 'PAUSED' : isLive ? 'LIVE' : 'PAPER',
      color: isPaused ? '#F97316' : isLive ? '#10B981' : '#F59E0B',
      icon: isPaused ? 'paused' as const : 'running' as const,
    };
  }
  // Shadow bot — check shadow sessions for this bot
  const sessions = shadowSessions.filter(s => s.botId === bot.id);
  const running = sessions.find(s => s.status === 'running');
  const completed = sessions.find(s => s.status === 'completed');
  const paused = sessions.find(s => s.status === 'paused');

  if (running) return {label: 'SHADOW', color: '#0D7FF2', icon: 'running' as const};
  if (paused) return {label: 'SHADOW PAUSED', color: '#F97316', icon: 'paused' as const};
  if (completed) return {label: 'SHADOW DONE', color: '#10B981', icon: 'completed' as const};
  return {label: 'SHADOW', color: '#0D7FF2', icon: 'idle' as const};
}
import InteractiveChart from '../../components/charts/InteractiveChart';
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
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const {width} = useWindowDimensions();
  const navigation = useNavigation<NavProp>();
  const [selectedTF, setSelectedTF] = useState('1D');
  const {user: authUser, isNewUser} = useAuth();

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [activeBots, setActiveBots] = useState<DashActiveBot[]>([]);
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);
  const [equityData, setEquityData] = useState<number[]>([]);
  const [activeArena, setActiveArena] = useState<ArenaSession | null>(null);
  const [shadowSessions, setShadowSessions] = useState<ShadowSessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [s, bots, trades, equity, arenaSession, shadowRes] = await Promise.all([
        dashboardApi.getSummary(),
        dashboardApi.getActiveBots(),
        tradesApi.getRecent(5).catch(() => [] as Trade[]),
        dashboardApi.getEquityHistory(30).catch(() => [] as number[]),
        arenaApi.getActiveSession().catch(() => null),
        botsService.getShadowSessions().then((res: any) => {
          const items = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
          return items.map((s: any) => ({id: s.id, botId: s.botId, status: s.status})) as ShadowSessionInfo[];
        }).catch(() => [] as ShadowSessionInfo[]),
      ]);
      setSummary(s);
      setActiveBots(bots);
      setRecentTrades(trades);
      setEquityData(equity);
      setActiveArena(arenaSession);
      setShadowSessions(shadowRes);
    } catch (e) {
      Alert.alert('Error', 'Failed to load dashboard data. Pull down to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

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
    Alert.alert(
      'Pause Bot',
      `Pause "${botName}"? It will stop trading until resumed.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {text: 'Pause', style: 'default', onPress: () => {
          botsService.pause(botId).then(fetchData).catch(() => Alert.alert('Error', 'Failed to pause bot.'));
        }},
      ],
    );
  };

  const handleStopBot = (botId: string, botName: string) => {
    Alert.alert(
      'Stop Bot',
      `Stop "${botName}" permanently? This will close all open positions.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {text: 'Stop', style: 'destructive', onPress: () => {
          botsService.stop(botId).then(fetchData).catch(() => Alert.alert('Error', 'Failed to stop bot.'));
        }},
      ],
    );
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

        {/* Metrics cards */}
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>ACCOUNT BALANCE</Text>
            <Text style={styles.metricValue}>${accountBalance.toLocaleString()}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>BUYING POWER</Text>
            <Text style={styles.metricValue}>${buyingPower.toLocaleString()}</Text>
          </View>
        </View>

        {/* Chart card */}
        <View style={styles.chartCard}>
          <InteractiveChart
            data={equityData.length >= 2 ? equityData : [totalBalance, totalBalance]}
            width={CHART_WIDTH - 32}
            height={180}
            selectedTimeframe={selectedTF}
            onTimeframeChange={setSelectedTF}
            label="EQUITY CURVE"
            showGrid
            showCrosshair
            showYLabels
            showXLabels
          />
        </View>

        {/* Active Bots */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>ACTIVE BOTS</Text>
            <TouchableOpacity onPress={goToMarket}>
              <Text style={styles.sectionAction}>View Store</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.botList}>
            {activeBots.length === 0 && (
              <TouchableOpacity
                style={[styles.botCard, {borderLeftColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', paddingVertical: 24}]}
                onPress={goToMarket}
                activeOpacity={0.7}>
                <View style={{alignItems: 'center', flex: 1}}>
                  <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 14, color: 'rgba(255,255,255,0.4)', marginBottom: 4}}>No active bots yet</Text>
                  <Text style={{fontFamily: 'Inter-Regular', fontSize: 12, color: '#10B981'}}>Browse the marketplace</Text>
                </View>
              </TouchableOpacity>
            )}
            {activeBots.map((bot: DashActiveBot) => {
              const returnColor = bot.totalReturn >= 0 ? '#10B981' : '#EF4444';
              const returnSign = bot.totalReturn >= 0 ? '+' : '';
              const display = resolveBotDisplayStatus(bot, shadowSessions);
              const isShadow = bot.subStatus === 'shadow';
              const isPaused = bot.subStatus === 'paused';
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
                  {!isShadow && !isPaused && (
                    <View style={styles.botActions}>
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
                  {isPaused && (
                    <TouchableOpacity
                      style={styles.resumeSmallBtn}
                      onPress={() => {
                        botsService.resume(bot.subscriptionId).then(fetchData).catch(() => Alert.alert('Error', 'Failed to resume bot.'));
                      }}
                      activeOpacity={0.7}>
                      <Text style={styles.resumeSmallText}>Resume</Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              );
            })}
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
              const isBuy = trade.side === 'BUY';
              const coin = trade.symbol.split('/')[0];
              const isLast = idx === recentTrades.length - 1;
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
                      <Text style={styles.tradeSymbol}>{trade.symbol.split('/')[0]}</Text>
                    </View>
                    <Text style={styles.tradeMeta}>
                      Bot: {trade.botName} · {formatTimeAgo(trade.timestamp)}
                    </Text>
                  </View>
                  <View style={styles.tradeRight}>
                    <Text style={styles.tradeAmount}>
                      ${(trade.amount * trade.price).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </Text>
                    <Text style={styles.tradeQty}>
                      {trade.amount < 1 ? trade.amount.toFixed(4) : trade.amount.toFixed(2)} {coin}
                    </Text>
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
