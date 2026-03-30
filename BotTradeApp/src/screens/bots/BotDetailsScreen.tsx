import React, {useCallback, useState} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, ActivityIndicator, RefreshControl, Modal, TextInput} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';
import Svg, {Circle as SvgCircle, Path} from 'react-native-svg';
import {RootStackParamList, Bot} from '../../types';
import {marketplaceApi} from '../../services/marketplace';
import {botsService} from '../../services/bots';
import {api} from '../../services/api';
import {useAuth} from '../../context/AuthContext';
import PortfolioLineChart from '../../components/charts/PortfolioLineChart';
import CandlestickChart from '../../components/charts/CandlestickChart';
import MonthlyReturnBars from '../../components/charts/MonthlyReturnBars';
import Badge from '../../components/common/Badge';
import TradeRow from '../../components/common/TradeRow';
import SectionHeader from '../../components/common/SectionHeader';
import ChevronLeftIcon from '../../components/icons/ChevronLeftIcon';
import ShareIcon from '../../components/icons/ShareIcon';
import StarIcon from '../../components/icons/StarIcon';
import XIcon from '../../components/icons/XIcon';
import {useToast} from '../../context/ToastContext';

const {width} = Dimensions.get('window');
const CHART_W = width - 40;

type Props = NativeStackScreenProps<RootStackParamList, 'BotDetails'>;

type BotUserStatus = 'none' | 'shadow_running' | 'shadow_completed' | 'shadow_paused' | 'active' | 'paused' | 'stopped';

interface UserBotState {
  status: BotUserStatus;
  subscriptionId?: string;
  shadowSessionId?: string;
  mode?: string;
}

export default function BotDetailsScreen({navigation, route}: Props) {
  const {user} = useAuth();
  const {alert: showAlert, showConfirm} = useToast();
  const [bot, setBot] = useState<Bot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userBotState, setUserBotState] = useState<UserBotState>({status: 'none'});
  const [actionLoading, setActionLoading] = useState(false);
  const [shadowModalVisible, setShadowModalVisible] = useState(false);
  const [selectedDurationIdx, setSelectedDurationIdx] = useState<number | null>(null);
  const [customDays, setCustomDays] = useState('');
  const [virtualBalance, setVirtualBalance] = useState('10000');

  // Equity curve (line chart from real P&L)
  const [equityCurve, setEquityCurve] = useState<number[]>([]);
  const [equityDates, setEquityDates] = useState<(string | Date)[]>([]);
  const [equityLoading, setEquityLoading] = useState(false);
  const [equityPnl, setEquityPnl] = useState(0);

  // Candlestick per trading pair
  const [selectedPair, setSelectedPair] = useState<string | null>(null);
  const [candleData, setCandleData] = useState<any[]>([]);
  const [candleTF, setCandleTF] = useState('4h');
  const [candleLoading, setCandleLoading] = useState(false);
  const [tradeMarkers, setTradeMarkers] = useState<{action: string; price: number; timestamp: number}[]>([]);
  const [livePrice, setLivePrice] = useState<number | undefined>(undefined);

  const DURATION_OPTIONS: {label: string; minutes?: number; days?: number}[] = [
    {label: '1 Min', minutes: 1},
    {label: '2 Min', minutes: 2},
    {label: '5 Min', minutes: 5},
    {label: '1 Day', days: 1},
    {label: '7 Days', days: 7},
    {label: '15 Days', days: 15},
    {label: '1 Month', days: 30},
  ];

  const fetchData = useCallback(async () => {
    try {
      const [botData, activeBots, shadowSessions, decisionsData] = await Promise.all([
        marketplaceApi.getBotDetails(route.params.botId).catch(() => null),
        botsService.getActive().then((res: any) => {
          const items = Array.isArray(res?.data) ? res.data : Array.isArray(res?.subscriptions) ? res.subscriptions : [];
          return items;
        }).catch(() => []),
        botsService.getShadowSessions().then((res: any) => {
          return Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        }).catch(() => []),
        botsService.getDecisions(route.params.botId, 100).then((res: any) => {
          return Array.isArray(res?.data) ? res.data : [];
        }).catch(() => []),
      ]);

      // Build real equity data from decisions if available
      if (botData && decisionsData.length > 0) {
        const equityPoints = decisionsData
          .filter((d: any) => d.price)
          .reverse()
          .map((d: any, i: number) => ({
            time: new Date(d.createdAt).getTime(),
            open: parseFloat(d.price),
            high: parseFloat(d.price) * 1.002,
            low: parseFloat(d.price) * 0.998,
            close: parseFloat(d.price),
            volume: d.action !== 'HOLD' ? 1000 : 100,
          }));
        if (equityPoints.length > 2) {
          botData.equityData = equityPoints;
        }
      }

      if (botData) {
        setBot(botData);
        // Auto-select first trading pair for candlestick chart
        const pairs = botData.config?.pairs ?? ['BTC/USDT'];
        if (pairs.length > 0 && !selectedPair) {
          const isStockBot = botData.category === 'Stocks';
          const defaultTF = isStockBot ? '1d' : '4h';
          setSelectedPair(pairs[0]);
          setCandleTF(defaultTF);
          fetchCandles(pairs[0], defaultTF);
        }
      }

      // Determine user's relationship with this bot
      const botId = route.params.botId;

      // Check active subscription
      const sub = activeBots.find((s: any) => s.botId === botId);
      // Check shadow sessions — find the most relevant one
      const shadowRunning = shadowSessions.find(
        (s: any) => s.botId === botId && s.status === 'running',
      );
      const shadowCompleted = shadowSessions.find(
        (s: any) => s.botId === botId && s.status === 'completed',
      );
      const shadowPaused = shadowSessions.find(
        (s: any) => s.botId === botId && s.status === 'paused',
      );

      if (sub && (sub.subscriptionStatus === 'active' || sub.status === 'active')) {
        setUserBotState({status: 'active', subscriptionId: sub.subscriptionId || sub.id, mode: sub.subscriptionMode || sub.mode});
      } else if (sub && (sub.subscriptionStatus === 'paused' || sub.status === 'paused')) {
        setUserBotState({status: 'paused', subscriptionId: sub.subscriptionId || sub.id});
      } else if (sub && (sub.subscriptionStatus === 'shadow' || sub.status === 'shadow') || shadowRunning || shadowCompleted || shadowPaused) {
        // Determine shadow sub-status
        if (shadowRunning) {
          setUserBotState({status: 'shadow_running', subscriptionId: sub?.subscriptionId || sub?.id, shadowSessionId: shadowRunning.id});
        } else if (shadowPaused) {
          setUserBotState({status: 'shadow_paused', subscriptionId: sub?.subscriptionId || sub?.id, shadowSessionId: shadowPaused.id});
        } else if (shadowCompleted) {
          setUserBotState({status: 'shadow_completed', subscriptionId: sub?.subscriptionId || sub?.id, shadowSessionId: shadowCompleted.id});
        } else {
          setUserBotState({status: 'shadow_running', subscriptionId: sub?.subscriptionId || sub?.id});
        }
      } else if (sub && (sub.subscriptionStatus === 'stopped' || sub.status === 'stopped')) {
        setUserBotState({status: 'stopped', subscriptionId: sub.subscriptionId || sub.id});
      } else {
        setUserBotState({status: 'none'});
      }
    } catch {
      // Bot details fetch failed
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [route.params.botId]);

  // Fetch bot equity curve (cumulative P&L)
  const fetchEquityCurve = useCallback(async (days: number) => {
    setEquityLoading(true);
    try {
      const res = await api.get<{data: any}>(`/bots/${route.params.botId}/equity-curve?days=${days}`);
      const d = res?.data;
      setEquityCurve(Array.isArray(d?.equityData) ? d.equityData : []);
      setEquityDates(Array.isArray(d?.dates) ? d.dates : []);
      setEquityPnl(Number(d?.totalPnl ?? 0));
    } catch {
      setEquityCurve([]);
      setEquityDates([]);
    } finally {
      setEquityLoading(false);
    }
  }, [route.params.botId]);

  // Fetch real candles + trade markers for a pair
  const fetchCandles = useCallback(async (pair: string, tf: string) => {
    setCandleLoading(true);
    setLivePrice(undefined);
    try {
      const [candleRes, markerRes] = await Promise.all([
        api.get<{data: any[]}>(`/market/candles?symbol=${encodeURIComponent(pair)}&timeframe=${tf}&limit=100`),
        api.get<{data: any[]}>(`/bots/${route.params.botId}/trade-markers?symbol=${encodeURIComponent(pair)}&days=90`),
      ]);
      const candles = Array.isArray(candleRes?.data) ? candleRes.data : [];
      setCandleData(candles);
      setTradeMarkers(Array.isArray(markerRes?.data) ? markerRes.data : []);
      // Use the very last candle close as the "live" price (most recent available)
      if (candles.length > 0) {
        setLivePrice(candles[candles.length - 1].close);
      }
    } catch {
      setCandleData([]);
      setTradeMarkers([]);
    } finally {
      setCandleLoading(false);
    }
  }, [route.params.botId]);

  const handlePairSelect = useCallback((pair: string) => {
    const isStockPair = !pair.includes('/');
    const defaultTF = isStockPair ? '1d' : '4h';
    setSelectedPair(pair);
    setCandleTF(defaultTF);
    fetchCandles(pair, defaultTF);
  }, [fetchCandles]);

  const handleCandleTFChange = useCallback((tf: string) => {
    setCandleTF(tf);
    if (selectedPair) fetchCandles(selectedPair, tf);
  }, [selectedPair, fetchCandles]);

  useFocusEffect(useCallback(() => {
    fetchData();
    fetchEquityCurve(30);
    // Auto-refresh every 30 seconds when bot is active/running
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData, fetchEquityCurve]));

  // ─── Actions ─────────────────────────────────────────────────────────────

  const handleStartShadow = useCallback(() => {
    if (!bot) return;
    if (userBotState.status === 'shadow_running') {
      showAlert('Shadow Mode Active', 'This bot already has a shadow session running. View or stop the current session first.');
      return;
    }
    if (userBotState.status === 'active') {
      showAlert('Bot Already Active', 'This bot is already live trading. Stop it first to start shadow mode.');
      return;
    }
    setSelectedDurationIdx(null);
    setCustomDays('');
    setVirtualBalance('10000');
    setShadowModalVisible(true);
  }, [bot, userBotState.status]);

  const handleConfirmShadow = useCallback(() => {
    if (!bot) return;
    if (selectedDurationIdx === null) {
      showAlert('Select Duration', 'Please select how long to run shadow mode.');
      return;
    }
    const balance = parseFloat(virtualBalance) || 10000;
    if (balance < 100) {
      showAlert('Invalid Balance', 'Virtual balance must be at least $100.');
      return;
    }

    let apiConfig: {virtualBalance: number; durationDays?: number; durationMinutes?: number};

    if (selectedDurationIdx === -1) {
      // Custom days
      const days = parseInt(customDays, 10);
      if (!days || days <= 0) {
        showAlert('Invalid Duration', 'Please enter a valid number of days.');
        return;
      }
      apiConfig = {virtualBalance: balance, durationDays: days};
    } else {
      const opt = DURATION_OPTIONS[selectedDurationIdx];
      if (opt.minutes) {
        apiConfig = {virtualBalance: balance, durationMinutes: opt.minutes};
      } else {
        apiConfig = {virtualBalance: balance, durationDays: opt.days!};
      }
    }

    setShadowModalVisible(false);
    setActionLoading(true);
    botsService
      .startShadowMode(bot.id, apiConfig)
      .then(() => navigation.navigate('ShadowMode'))
      .catch(() => showAlert('Error', 'Failed to start shadow mode.'))
      .finally(() => setActionLoading(false));
  }, [navigation, bot, selectedDurationIdx, customDays, virtualBalance, DURATION_OPTIONS]);

  const handleActivate = useCallback(() => {
    if (!bot) return;
    if (userBotState.status === 'active') {
      showAlert('Already Active', 'This bot is already active and trading.');
      return;
    }
    navigation.navigate('BotPurchase', {botId: bot.id});
  }, [navigation, bot, userBotState.status]);

  const handleViewShadow = useCallback(() => {
    navigation.navigate('ShadowMode');
  }, [navigation]);

  const handlePause = useCallback(() => {
    if (!userBotState.subscriptionId) return;
    showConfirm({
      title: 'Pause Bot',
      message: 'This will pause the bot. No new trades will be placed.',
      confirmText: 'Pause',
      onConfirm: () => {
        setActionLoading(true);
        botsService.pause(userBotState.subscriptionId!)
          .then(() => fetchData())
          .catch(() => showAlert('Error', 'Failed to pause bot.'))
          .finally(() => setActionLoading(false));
      },
    });
  }, [userBotState.subscriptionId, fetchData]);

  const handleResume = useCallback(() => {
    if (!userBotState.subscriptionId) return;
    setActionLoading(true);
    botsService.resume(userBotState.subscriptionId)
      .then(() => fetchData())
      .catch(() => showAlert('Error', 'Failed to resume bot.'))
      .finally(() => setActionLoading(false));
  }, [userBotState.subscriptionId, fetchData]);

  const handleStop = useCallback(() => {
    if (!userBotState.subscriptionId) return;
    showConfirm({
      title: 'Stop Bot',
      message: 'This will stop the bot and close all positions. This cannot be undone.',
      confirmText: 'Stop',
      destructive: true,
      onConfirm: () => {
        setActionLoading(true);
        botsService.stop(userBotState.subscriptionId!)
          .then(() => fetchData())
          .catch(() => showAlert('Error', 'Failed to stop bot.'))
          .finally(() => setActionLoading(false));
      },
    });
  }, [userBotState.subscriptionId, fetchData]);

  const handlePauseShadow = useCallback(() => {
    if (!userBotState.shadowSessionId) return;
    showConfirm({
      title: 'Pause Shadow Mode',
      message: 'This will pause the shadow session. No new paper trades will be made.',
      confirmText: 'Pause',
      onConfirm: () => {
        setActionLoading(true);
        botsService.pauseShadowSession(userBotState.shadowSessionId!)
          .then(() => fetchData())
          .catch(() => showAlert('Error', 'Failed to pause shadow session.'))
          .finally(() => setActionLoading(false));
      },
    });
  }, [userBotState.shadowSessionId, fetchData]);

  const handleStopShadow = useCallback(() => {
    if (!userBotState.shadowSessionId) return;
    showConfirm({
      title: 'Stop Shadow Mode',
      message: 'This will stop the shadow session permanently. You can view the results after.',
      confirmText: 'Stop',
      destructive: true,
      onConfirm: () => {
        setActionLoading(true);
        botsService.stopShadowSession(userBotState.shadowSessionId!)
          .then(() => fetchData())
          .catch(() => showAlert('Error', 'Failed to stop shadow session.'))
          .finally(() => setActionLoading(false));
      },
    });
  }, [userBotState.shadowSessionId, fetchData]);

  const handleResumeShadow = useCallback(() => {
    if (!userBotState.shadowSessionId) return;
    setActionLoading(true);
    botsService.resumeShadowSession(userBotState.shadowSessionId!)
      .then(() => fetchData())
      .catch(() => showAlert('Error', 'Failed to resume shadow session.'))
      .finally(() => setActionLoading(false));
  }, [userBotState.shadowSessionId, fetchData]);

  // ─── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.container, {alignItems: 'center', justifyContent: 'center'}]}>
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  if (!bot) {
    return (
      <View style={[styles.container, {alignItems: 'center', justifyContent: 'center'}]}>
        <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 16, color: 'rgba(255,255,255,0.5)', marginBottom: 8}}>Bot not found</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{fontFamily: 'Inter-Medium', fontSize: 14, color: '#10B981'}}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isCreator = !!user && !!bot.creatorId && user.id === bot.creatorId;

  const statCells = [
    {label: '30D RETURN', value: `${bot.returnPercent >= 0 ? '+' : ''}${bot.returnPercent.toFixed(1)}%`, color: bot.returnPercent >= 0 ? '#10B981' : '#EF4444'},
    {label: 'WIN RATE', value: `${bot.winRate}%`, color: '#0D7FF2'},
    {label: 'MAX DRAWDOWN', value: `${bot.maxDrawdown.toFixed(1)}%`, color: '#EF4444'},
    {label: 'SHARPE RATIO', value: `${bot.sharpeRatio.toFixed(2)}`, color: '#10B981'},
  ];

  const isRunning = userBotState.status === 'active' || userBotState.status === 'shadow_running';
  const feedMode = userBotState.status === 'active' ? 'live' : 'paper';

  return (
    <View style={styles.container}>
      {/* Header with Live Feed action */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <ChevronLeftIcon size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{bot.name}</Text>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
          {isRunning && (
            <TouchableOpacity
              style={styles.headerLiveFeedBtn}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('BotLiveFeed', {botId: bot.id, botName: bot.name, mode: feedMode})}>
              <View style={[styles.headerLiveDot, {backgroundColor: userBotState.status === 'active' ? '#10B981' : '#3B82F6'}]} />
              <Text style={[styles.headerLiveFeedText, {color: userBotState.status === 'active' ? '#10B981' : '#3B82F6'}]}>
                Live Feed
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.iconBtn}>
            <ShareIcon size={20} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Active status bar (shown when bot is live or shadow running) */}
      {isRunning && (
        <TouchableOpacity
          style={[styles.activeStatusBar, {backgroundColor: userBotState.status === 'active' ? 'rgba(16,185,129,0.08)' : 'rgba(59,130,246,0.08)', borderColor: userBotState.status === 'active' ? 'rgba(16,185,129,0.2)' : 'rgba(59,130,246,0.2)'}]}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('BotLiveFeed', {botId: bot.id, botName: bot.name, mode: feedMode})}>
          <View style={[styles.activeStatusDot, {backgroundColor: userBotState.status === 'active' ? '#10B981' : '#3B82F6'}]} />
          <Text style={[styles.activeStatusText, {color: userBotState.status === 'active' ? '#10B981' : '#3B82F6'}]}>
            {userBotState.status === 'active' ? 'Bot is Live — Trading with real funds' : 'Shadow Mode — AI analyzing markets'}
          </Text>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Path d="M9 18l6-6-6-6" stroke={userBotState.status === 'active' ? '#10B981' : '#3B82F6'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchData(); }}
            tintColor="#10B981"
            colors={['#10B981']}
            progressBackgroundColor="#161B22"
          />
        }>
        {/* Bot hero — compact card style */}
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={[styles.botAvatar, {backgroundColor: bot.avatarColor}]}>
              <Text style={styles.botAvatarText}>{bot.avatarLetter}</Text>
            </View>
            <View style={styles.heroInfo}>
              <View style={styles.heroNameRow}>
                <Text style={styles.botName} numberOfLines={1}>{bot.name}</Text>
                {isCreator && <Badge label="YOURS" variant="purple" size="sm" />}
              </View>
              <Text style={styles.botCreator} numberOfLines={1}>{isCreator ? 'Created by you' : bot.subtitle}</Text>
              <View style={styles.ratingRow}>
                {[1,2,3,4,5].map(i => (
                  <StarIcon key={i} size={12} filled={i <= Math.round(bot.rating)} color="#EAB308" />
                ))}
                <Text style={styles.ratingText}> {bot.rating.toFixed(1)} ({bot.reviewCount})</Text>
                <Text style={styles.activeUsers}>  •  {bot.activeUsers.toLocaleString()} traders</Text>
              </View>
            </View>
          </View>

          {/* Status badges */}
          {!isRunning && (userBotState.status === 'shadow_paused' || userBotState.status === 'shadow_completed' || userBotState.status === 'paused') && (
            <View style={styles.badgesRow}>
              {userBotState.status === 'shadow_paused' && <Badge label="SHADOW PAUSED" variant="orange" size="sm" />}
              {userBotState.status === 'shadow_completed' && <Badge label="SHADOW COMPLETE" variant="green" size="sm" />}
              {userBotState.status === 'paused' && <Badge label="PAUSED" variant="orange" size="sm" />}
            </View>
          )}
        </View>

        {/* Stats 2x2 grid */}
        <View style={styles.statsGrid}>
          {statCells.map(cell => (
            <View key={cell.label} style={styles.statCell}>
              <Text style={styles.statCellLabel}>{cell.label}</Text>
              <Text style={[styles.statCellValue, {color: cell.color}]}>{cell.value}</Text>
            </View>
          ))}
        </View>

        {/* Bot P&L Equity Curve (Line Chart) */}
        <View style={styles.chartSection}>
          <Text style={styles.chartSectionLabel}>BOT PERFORMANCE (P&L)</Text>
          <PortfolioLineChart
            data={equityCurve.length >= 2 ? equityCurve : [0, equityPnl]}
            dates={equityDates}
            currentValue={equityPnl}
            width={CHART_W}
            height={200}
            isRealData={equityCurve.length >= 2}
            loading={equityLoading}
            onTimeframeChange={fetchEquityCurve}
          />
        </View>

        {/* Trading Pairs — Real Candlestick Charts */}
        {(() => {
          const pairs = bot.config?.pairs ?? ['BTC/USDT'];
          return (
            <View style={styles.chartSection}>
              <Text style={styles.chartSectionLabel}>PRICE ACTION</Text>
              <Text style={{fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 12}}>
                Real-time market data for trading pairs
              </Text>

              {/* Pair selector */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap: 8, marginBottom: 14}}>
                {pairs.map(pair => (
                  <TouchableOpacity
                    key={pair}
                    activeOpacity={0.7}
                    style={[
                      styles.pairChip,
                      selectedPair === pair && styles.pairChipActive,
                    ]}
                    onPress={() => handlePairSelect(pair)}>
                    <Text style={[
                      styles.pairChipText,
                      selectedPair === pair && styles.pairChipTextActive,
                    ]}>{pair}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Candlestick chart for selected pair */}
              {selectedPair ? (
                candleLoading ? (
                  <View style={{alignItems: 'center', paddingVertical: 40}}>
                    <ActivityIndicator size="small" color="#10B981" />
                    <Text style={{fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 8}}>Loading {selectedPair}...</Text>
                  </View>
                ) : candleData.length > 0 ? (
                  <>
                    {/* Timeframe selector for candles */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap: 6, marginBottom: 10}}>
                      {(bot.category === 'Stocks' ? ['1d', '1w'] : ['1h', '4h', '1d', '1w']).map(tf => (
                        <TouchableOpacity
                          key={tf}
                          activeOpacity={0.7}
                          style={[styles.tfChip, candleTF === tf && styles.tfChipActive]}
                          onPress={() => handleCandleTFChange(tf)}>
                          <Text style={[styles.tfChipText, candleTF === tf && styles.tfChipTextActive]}>
                            {tf.toUpperCase()}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>

                    <CandlestickChart
                      data={candleData.map((c: any) => ({
                        time: c.timestamp,
                        open: c.open,
                        high: c.high,
                        low: c.low,
                        close: c.close,
                        volume: c.volume,
                      }))}
                      livePrice={livePrice}
                      width={CHART_W}
                      height={260}
                      showTimeframes={false}
                      showGrid
                      showCrosshair
                      showYLabels
                    />

                    {/* Trade markers legend */}
                    {tradeMarkers.length > 0 && (
                      <View style={styles.markersSection}>
                        <Text style={styles.markersTitle}>BOT TRADES ON THIS PAIR</Text>
                        {tradeMarkers.slice(0, 10).map((m, i) => (
                          <View key={i} style={styles.markerRow}>
                            <View style={[styles.markerDot, {backgroundColor: m.action === 'BUY' ? '#10B981' : '#EF4444'}]} />
                            <Text style={styles.markerAction}>{m.action}</Text>
                            <Text style={styles.markerPrice}>${m.price.toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
                            <Text style={styles.markerTime}>
                              {new Date(m.timestamp).toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </>
                ) : (
                  <View style={{alignItems: 'center', paddingVertical: 30}}>
                    <Text style={{fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.3)'}}>No candle data for {selectedPair}</Text>
                  </View>
                )
              ) : (
                <View style={{alignItems: 'center', paddingVertical: 30}}>
                  <Text style={{fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.3)'}}>
                    Select a pair to view price chart
                  </Text>
                </View>
              )}
            </View>
          );
        })()}

        {/* Bot Overview Card */}
        <View style={styles.overviewCard}>
          <View style={styles.overviewRow}>
            <View style={styles.overviewItem}>
              <Text style={styles.overviewLabel}>CATEGORY</Text>
              <Text style={styles.overviewValue}>{bot.category}</Text>
            </View>
            <View style={styles.overviewDivider} />
            <View style={styles.overviewItem}>
              <Text style={styles.overviewLabel}>RISK LEVEL</Text>
              <Text style={[styles.overviewValue, {color: bot.risk === 'Very High' || bot.risk === 'High' ? '#EF4444' : bot.risk === 'Med' ? '#F59E0B' : '#10B981'}]}>
                {bot.risk}
              </Text>
            </View>
            <View style={styles.overviewDivider} />
            <View style={styles.overviewItem}>
              <Text style={styles.overviewLabel}>PRICE</Text>
              <Text style={styles.overviewValue}>{bot.price === 0 ? 'Free' : `$${bot.price}/mo`}</Text>
            </View>
          </View>
        </View>

        {/* Trading Configuration */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>TRADING CONFIGURATION</Text>
          <View style={styles.metricsCard}>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Strategy</Text>
              <Text style={[styles.metricValue, {color: '#8B5CF6'}]}>{bot.strategy || 'N/A'}</Text>
            </View>
            <View style={[styles.metricRow, {flexDirection: 'column', alignItems: 'flex-start', gap: 8}]}>
              <Text style={styles.metricLabel}>Trading Pairs</Text>
              <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>
                {(bot.config?.pairs || ['BTC/USDT']).map((pair, i) => (
                  <View key={i} style={{backgroundColor: 'rgba(59,130,246,0.12)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(59,130,246,0.25)'}}>
                    <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 12, color: '#3B82F6'}} numberOfLines={1}>{pair}</Text>
                  </View>
                ))}
              </View>
            </View>
            {bot.config?.stopLoss && (
              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Stop Loss</Text>
                <Text style={[styles.metricValue, {color: '#EF4444'}]}>{bot.config.stopLoss}%</Text>
              </View>
            )}
            {bot.config?.takeProfit && (
              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Take Profit</Text>
                <Text style={[styles.metricValue, {color: '#10B981'}]}>{bot.config.takeProfit}%</Text>
              </View>
            )}
            {bot.config?.tradeDirection && (
              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Direction</Text>
                <Text style={styles.metricValue}>{bot.config.tradeDirection === 'buy' ? 'Buy Only' : bot.config.tradeDirection === 'sell' ? 'Sell Only' : 'Both'}</Text>
              </View>
            )}
            {bot.config?.orderType && (
              <View style={[styles.metricRow, {borderBottomWidth: 0}]}>
                <Text style={styles.metricLabel}>Order Type</Text>
                <Text style={styles.metricValue}>{bot.config.orderType === 'limit' ? 'Limit' : 'Market'}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Aggregate Stats (all users) */}
        {bot.aggregateStats && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>COMMUNITY STATS</Text>
            <View style={styles.metricsCard}>
              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Total Traders</Text>
                <Text style={styles.metricValue}>{bot.aggregateStats.totalUsers}</Text>
              </View>
              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Live Traders</Text>
                <Text style={[styles.metricValue, {color: '#10B981'}]}>{bot.aggregateStats.liveSubscribers}</Text>
              </View>
              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Total Trades</Text>
                <Text style={styles.metricValue}>{bot.aggregateStats.totalTrades}</Text>
              </View>
              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Open Positions</Text>
                <Text style={[styles.metricValue, {color: '#3B82F6'}]}>{bot.aggregateStats.openPositions}</Text>
              </View>
              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Closed Positions</Text>
                <Text style={styles.metricValue}>{bot.aggregateStats.closedPositions}</Text>
              </View>
              <View style={[styles.metricRow, {borderBottomWidth: 0}]}>
                <Text style={styles.metricLabel}>Total P&L (all users)</Text>
                <Text style={[styles.metricValue, {color: bot.aggregateStats.totalPnl >= 0 ? '#10B981' : '#EF4444'}]}>
                  {bot.aggregateStats.totalPnl >= 0 ? '+' : ''}${bot.aggregateStats.totalPnl.toFixed(2)}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Bot DNA */}
        {bot.tags && bot.tags.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>BOT DNA</Text>
          <View style={styles.tagsRow}>
            {bot.tags.map(tag => (
              <Badge key={tag} label={tag} variant="outline" size="sm" style={styles.tag} />
            ))}
          </View>
        </View>
        )}

        {/* Strategy Description */}
        {bot.description ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>STRATEGY</Text>
          <Text style={styles.strategyText}>{bot.description}</Text>
        </View>
        ) : null}

        {/* Key Metrics */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>KEY METRICS</Text>
          <View style={styles.metricsCard}>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Total Return (30D)</Text>
              <Text style={[styles.metricValue, {color: bot.returnPercent >= 0 ? '#10B981' : '#EF4444'}]}>
                {bot.returnPercent >= 0 ? '+' : ''}{bot.returnPercent.toFixed(2)}%
              </Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Win Rate</Text>
              <Text style={styles.metricValue}>{bot.winRate.toFixed(1)}%</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Max Drawdown</Text>
              <Text style={[styles.metricValue, {color: '#EF4444'}]}>{bot.maxDrawdown.toFixed(2)}%</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Sharpe Ratio</Text>
              <Text style={[styles.metricValue, {color: bot.sharpeRatio >= 1 ? '#10B981' : '#F59E0B'}]}>{bot.sharpeRatio.toFixed(2)}</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Active Users</Text>
              <Text style={styles.metricValue}>{bot.activeUsers.toLocaleString()}</Text>
            </View>
            <View style={[styles.metricRow, {borderBottomWidth: 0}]}>
              <Text style={styles.metricLabel}>Average Rating</Text>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
                <StarIcon size={12} filled color="#EAB308" />
                <Text style={styles.metricValue}>{bot.rating.toFixed(1)} ({bot.reviewCount})</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Creator Info */}
        {bot.creatorName ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>CREATOR</Text>
            <View style={styles.creatorCard}>
              <View style={[styles.creatorAvatar, {backgroundColor: bot.avatarColor}]}>
                <Text style={styles.creatorAvatarText}>{bot.creatorName.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.creatorInfo}>
                <Text style={styles.creatorName}>{bot.creatorName}</Text>
                <Text style={styles.creatorSub}>{isCreator ? 'You' : 'Bot Creator'}</Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Monthly Returns */}
        {bot.monthlyReturns.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>MONTHLY RETURNS</Text>
            <MonthlyReturnBars data={bot.monthlyReturns} />
          </View>
        )}

        {/* Recent Trades */}
        {bot.recentTrades.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Recent Trades" />
            <View style={styles.card}>
              {bot.recentTrades.slice(0, 3).map(trade => (
                <TradeRow key={trade.id} trade={trade} />
              ))}
            </View>
          </View>
        )}

        {/* Reviews */}
        {bot.reviews.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Reviews" />
            {bot.reviews.map(review => (
              <View key={review.id} style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  <View style={[styles.reviewAvatar, {backgroundColor: '#10B981'}]}>
                    <Text style={styles.reviewAvatarText}>{review.userInitials}</Text>
                  </View>
                  <View>
                    <Text style={styles.reviewName}>{review.userName}</Text>
                    <View style={styles.reviewStars}>
                      {[1,2,3,4,5].map(i => (
                        <StarIcon key={i} size={10} filled={i <= review.rating} color="#EAB308" />
                      ))}
                    </View>
                  </View>
                  <Text style={styles.reviewDate}>{review.date}</Text>
                </View>
                <Text style={styles.reviewText}>{review.text}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={{height: 120}} />
      </ScrollView>

      {/* ─── Shadow Mode Confirmation Modal ─────────────────────────── */}
      <Modal
        visible={shadowModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setShadowModalVisible(false)}>
        <View style={modalStyles.overlay}>
          <View style={modalStyles.sheet}>
            <View style={modalStyles.handle} />
            <View style={modalStyles.headerRow}>
              <Text style={modalStyles.title}>Start Shadow Mode</Text>
              <TouchableOpacity onPress={() => setShadowModalVisible(false)} style={modalStyles.closeBtn}>
                <XIcon size={18} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            </View>
            <Text style={modalStyles.desc}>
              Run {bot?.name ?? 'this bot'} with virtual funds. No real trades will be executed.
            </Text>

            {/* Duration picker */}
            <Text style={modalStyles.label}>DURATION</Text>
            <View style={modalStyles.durationGrid}>
              {DURATION_OPTIONS.map((opt, idx) => (
                <TouchableOpacity
                  key={opt.label}
                  style={[modalStyles.durationChip, selectedDurationIdx === idx && modalStyles.durationChipActive]}
                  onPress={() => { setSelectedDurationIdx(idx); setCustomDays(''); }}
                  activeOpacity={0.7}>
                  <Text style={[modalStyles.durationChipText, selectedDurationIdx === idx && modalStyles.durationChipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[modalStyles.durationChip, selectedDurationIdx === -1 && modalStyles.durationChipActive]}
                onPress={() => setSelectedDurationIdx(-1)}
                activeOpacity={0.7}>
                <Text style={[modalStyles.durationChipText, selectedDurationIdx === -1 && modalStyles.durationChipTextActive]}>Custom</Text>
              </TouchableOpacity>
            </View>

            {selectedDurationIdx === -1 && (
              <View style={modalStyles.customRow}>
                <TextInput
                  style={modalStyles.customInput}
                  value={customDays}
                  onChangeText={setCustomDays}
                  placeholder="Days"
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  keyboardType="number-pad"
                  maxLength={3}
                />
                <Text style={modalStyles.customLabel}>days</Text>
              </View>
            )}

            {/* Virtual balance */}
            <Text style={modalStyles.label}>VIRTUAL BALANCE</Text>
            <View style={modalStyles.balanceRow}>
              <Text style={modalStyles.dollarSign}>$</Text>
              <TextInput
                style={modalStyles.balanceInput}
                value={virtualBalance}
                onChangeText={setVirtualBalance}
                keyboardType="number-pad"
                maxLength={8}
              />
            </View>

            {/* Confirm button */}
            <TouchableOpacity style={modalStyles.confirmBtn} onPress={handleConfirmShadow} activeOpacity={0.85}>
              <Text style={modalStyles.confirmText}>Start Shadow Mode</Text>
            </TouchableOpacity>
            <Text style={modalStyles.disclaimer}>No real money will be used. You can pause or stop anytime.</Text>
          </View>
        </View>
      </Modal>

      {/* ─── Dynamic Footer ────────────────────────────────────────────── */}
      <View style={styles.footer}>
        {actionLoading ? (
          <View style={styles.footerLoading}>
            <ActivityIndicator size="small" color="#10B981" />
          </View>
        ) : userBotState.status === 'none' || userBotState.status === 'stopped' ? (
          /* No active relationship — show Shadow + Activate */
          <>
            <TouchableOpacity style={styles.shadowBtn} onPress={handleStartShadow} activeOpacity={0.8}>
              <Text style={styles.shadowBtnText}>Shadow Mode</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.activateBtn} onPress={handleActivate} activeOpacity={0.85}>
              <Text style={styles.activateBtnText}>
                {bot.price === 0 ? 'Activate Free' : `Activate — $${bot.price}/mo`}
              </Text>
            </TouchableOpacity>
          </>
        ) : userBotState.status === 'shadow_running' ? (
          /* Shadow mode running — Pause/Stop + Go Live */
          <>
            <View style={{flexDirection: 'row', gap: 10, marginBottom: 10}}>
              <TouchableOpacity style={[styles.pauseBtn, {flex: 1}]} onPress={handlePauseShadow} activeOpacity={0.8}>
                <Text style={styles.pauseBtnText}>Pause</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.stopBtn, {flex: 1}]} onPress={handleStopShadow} activeOpacity={0.8}>
                <Text style={styles.stopBtnText}>Stop</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.goLiveSmallBtn} onPress={handleActivate} activeOpacity={0.85}>
              <Text style={styles.goLiveSmallText}>Go Live</Text>
            </TouchableOpacity>
          </>
        ) : userBotState.status === 'shadow_paused' ? (
          /* Shadow mode paused — Resume/Stop + Go Live */
          <>
            <View style={{flexDirection: 'row', gap: 10, marginBottom: 10}}>
              <TouchableOpacity style={[styles.resumeBtn, {flex: 1}]} onPress={handleResumeShadow} activeOpacity={0.8}>
                <Text style={styles.resumeBtnText}>Resume Shadow</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.stopBtn, {flex: 1}]} onPress={handleStopShadow} activeOpacity={0.8}>
                <Text style={styles.stopBtnText}>Stop Shadow</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.goLiveSmallBtn} onPress={handleActivate} activeOpacity={0.85}>
              <Text style={styles.goLiveSmallText}>Go Live</Text>
            </TouchableOpacity>
          </>
        ) : userBotState.status === 'shadow_completed' ? (
          /* Shadow mode completed — two-row layout */
          <View style={styles.shadowCompleteFooter}>
            <View style={styles.shadowCompleteBanner}>
              <View style={styles.shadowCompleteCheck}>
                <Text style={{fontSize: 14}}>✓</Text>
              </View>
              <Text style={styles.shadowCompleteText}>Shadow Mode Complete</Text>
            </View>
            <View style={styles.shadowCompleteBtns}>
              <TouchableOpacity style={styles.shadowCompleteResultsBtn} onPress={handleViewShadow} activeOpacity={0.8}>
                <Text style={styles.shadowCompleteResultsText}>View Results</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shadowCompleteGoLiveBtn} onPress={handleActivate} activeOpacity={0.85}>
                <Text style={styles.shadowCompleteGoLiveText}>Go Live</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : userBotState.status === 'active' ? (
          /* Bot is live — Live Feed accessible from header, show pause/stop */
          <>
            <View style={{flexDirection: 'row', gap: 10}}>
              <TouchableOpacity style={[styles.pauseBtn, {flex: 1}]} onPress={handlePause} activeOpacity={0.8}>
                <Text style={styles.pauseBtnText}>Pause</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.stopBtn, {flex: 1}]} onPress={handleStop} activeOpacity={0.8}>
                <Text style={styles.stopBtnText}>Stop</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : userBotState.status === 'paused' ? (
          /* Bot is paused — show resume + stop */
          <>
            <View style={styles.statusCard}>
              <View style={[styles.statusDot, {backgroundColor: '#F97316'}]} />
              <View style={styles.statusTextCol}>
                <Text style={styles.statusTitle}>Bot Paused</Text>
                <Text style={styles.statusSub}>No trades being placed</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.resumeBtn} onPress={handleResume} activeOpacity={0.85}>
              <Text style={styles.resumeBtnText}>Resume</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.stopBtn} onPress={handleStop} activeOpacity={0.8}>
              <Text style={styles.stopBtnText}>Stop</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0F1117'},
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {flex: 1, fontFamily: 'Inter-SemiBold', fontSize: 16, color: '#FFFFFF', textAlign: 'center', marginHorizontal: 8},
  scroll: {paddingHorizontal: 20},
  headerLiveFeedBtn: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(16,185,129,0.1)', gap: 5},
  headerLiveDot: {width: 6, height: 6, borderRadius: 3},
  headerLiveFeedText: {fontFamily: 'Inter-SemiBold', fontSize: 12},
  activeStatusBar: {flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginBottom: 4, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, gap: 8},
  activeStatusDot: {width: 8, height: 8, borderRadius: 4},
  activeStatusText: {fontFamily: 'Inter-Medium', fontSize: 12, flex: 1},
  heroCard: {backgroundColor: '#161B22', borderRadius: 16, padding: 16, marginBottom: 16, marginTop:10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)'},
  heroTop: {flexDirection: 'row', alignItems: 'center', gap: 14},
  heroInfo: {flex: 1},
  heroNameRow: {flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2},
  heroSection: {alignItems: 'center', paddingVertical: 16},
  botAvatar: {width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 12},
  botAvatarText: {fontFamily: 'Inter-Bold', fontSize: 28, color: '#FFFFFF'},
  badgesRow: {flexDirection: 'row', gap: 6, marginTop: 10},
  botName: {fontFamily: 'Inter-Bold', fontSize: 18, color: '#FFFFFF', letterSpacing: -0.3, flexShrink: 1},
  botCreator: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 4},
  ratingRow: {flexDirection: 'row', alignItems: 'center'},
  ratingText: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.4)'},
  activeUsers: {fontFamily: 'Inter-Medium', fontSize: 11, color: 'rgba(255,255,255,0.35)'},
  statsGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16},
  statCell: {
    flex: 1, minWidth: '45%',
    backgroundColor: '#161B22', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  statCellLabel: {fontFamily: 'Inter-Medium', fontSize: 9, letterSpacing: 0.8, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 6},
  statCellValue: {fontFamily: 'Inter-Bold', fontSize: 22, letterSpacing: -0.5},
  chartSection: {marginBottom: 16},
  chartSectionLabel: {fontFamily: 'Inter-SemiBold', fontSize: 11, letterSpacing: 1.2, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' as const, marginBottom: 10},
  pairChip: {paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)'},
  pairChipActive: {backgroundColor: 'rgba(16,185,129,0.12)', borderColor: '#10B981'},
  pairChipText: {fontFamily: 'Inter-SemiBold', fontSize: 12, color: 'rgba(255,255,255,0.4)'},
  pairChipTextActive: {color: '#10B981'},
  tfChip: {paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)'},
  tfChipActive: {backgroundColor: '#10B981'},
  tfChipText: {fontFamily: 'Inter-SemiBold', fontSize: 11, color: 'rgba(255,255,255,0.35)'},
  tfChipTextActive: {color: '#FFFFFF'},
  markersSection: {marginTop: 12, backgroundColor: '#161B22', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)'},
  markersTitle: {fontFamily: 'Inter-SemiBold', fontSize: 10, letterSpacing: 1, color: 'rgba(255,255,255,0.4)', marginBottom: 10},
  markerRow: {flexDirection: 'row' as const, alignItems: 'center' as const, paddingVertical: 6, gap: 8},
  markerDot: {width: 8, height: 8, borderRadius: 4},
  markerAction: {fontFamily: 'Inter-SemiBold', fontSize: 12, color: '#FFFFFF', width: 36},
  markerPrice: {fontFamily: 'Inter-Medium', fontSize: 12, color: 'rgba(255,255,255,0.7)', flex: 1},
  markerTime: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.35)'},

  // Overview card
  overviewCard: {
    backgroundColor: '#161B22', borderRadius: 16, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  overviewRow: {flexDirection: 'row', alignItems: 'center'},
  overviewItem: {flex: 1, alignItems: 'center'},
  overviewDivider: {width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.08)'},
  overviewLabel: {
    fontFamily: 'Inter-Medium', fontSize: 9, letterSpacing: 0.8,
    color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 4,
  },
  overviewValue: {fontFamily: 'Inter-Bold', fontSize: 14, color: '#FFFFFF'},

  // Key Metrics
  metricsCard: {
    backgroundColor: '#161B22', borderRadius: 16, paddingHorizontal: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  metricRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  metricLabel: {fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.5)'},
  metricValue: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF'},

  // Creator
  creatorCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#161B22', borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  creatorAvatar: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  creatorAvatarText: {fontFamily: 'Inter-Bold', fontSize: 18, color: '#FFFFFF'},
  creatorInfo: {flex: 1},
  creatorName: {fontFamily: 'Inter-SemiBold', fontSize: 15, color: '#FFFFFF'},
  creatorSub: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 2},

  section: {marginBottom: 20},
  sectionLabel: {fontFamily: 'Inter-Medium', fontSize: 10, letterSpacing: 1, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 10},
  tagsRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 6},
  tag: {marginBottom: 4},
  strategyText: {fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 22},
  card: {backgroundColor: '#161B22', borderRadius: 16, paddingHorizontal: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)'},
  reviewCard: {
    backgroundColor: '#161B22', borderRadius: 14, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  reviewHeader: {flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8},
  reviewAvatar: {width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center'},
  reviewAvatarText: {fontFamily: 'Inter-Bold', fontSize: 12, color: '#FFFFFF'},
  reviewName: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#FFFFFF'},
  reviewStars: {flexDirection: 'row', gap: 2, marginTop: 2},
  reviewDate: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.3)', marginLeft: 'auto'},
  reviewText: {fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 20},

  // ─── Footer ──────────────────────────────────────────────────────────────
  footer: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32,
    backgroundColor: '#0F1117', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
  },
  footerLoading: {
    flex: 1, height: 52, alignItems: 'center', justifyContent: 'center',
  },

  // No subscription — default buttons
  shadowBtn: {
    flex: 1, height: 52, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#161B22', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  shadowBtnText: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF'},
  activateBtn: {
    flex: 2, height: 52, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#10B981',
  },
  activateBtnText: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF'},

  // Status card (shared)
  statusCard: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#161B22', borderRadius: 12, paddingHorizontal: 12, height: 52,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  statusDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#0D7FF2',
  },
  statusTextCol: {flex: 1},
  statusTitle: {fontFamily: 'Inter-SemiBold', fontSize: 12, color: '#FFFFFF'},
  statusSub: {fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 1},

  // Shadow running buttons
  viewShadowBtn: {
    height: 52, paddingHorizontal: 16, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(13,127,242,0.15)', borderWidth: 1, borderColor: 'rgba(13,127,242,0.3)',
  },
  viewShadowText: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#0D7FF2'},
  goLiveSmallBtn: {
    height: 52, paddingHorizontal: 16, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#10B981',
  },
  goLiveSmallText: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#FFFFFF'},

  // Live buttons
  pauseBtn: {
    height: 52, paddingHorizontal: 5, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(249,115,22,0.15)', borderWidth: 1, borderColor: 'rgba(249,115,22,0.3)',
  },
  pauseBtnText: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#F97316'},
  stopBtn: {
    height: 52, paddingHorizontal: 5, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(239,68,68,0.15)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
  },
  stopBtnText: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#EF4444'},

  // Paused buttons
  resumeBtn: {
    height: 52, paddingHorizontal: 20, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#10B981',
  },
  resumeBtnText: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#FFFFFF'},

  // Shadow completed footer — vertical layout
  shadowCompleteFooter: {
    flex: 1, flexDirection: 'column', gap: 10,
  },
  shadowCompleteBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(16,185,129,0.08)', borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 12,
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)',
  },
  shadowCompleteCheck: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#10B981',
    alignItems: 'center', justifyContent: 'center',
  },
  shadowCompleteText: {
    fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#10B981',
  },
  shadowCompleteBtns: {
    flexDirection: 'row', gap: 10,
  },
  shadowCompleteResultsBtn: {
    flex: 1, height: 48, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(13,127,242,0.12)', borderWidth: 1, borderColor: 'rgba(13,127,242,0.3)',
  },
  shadowCompleteResultsText: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#0D7FF2'},
  shadowCompleteGoLiveBtn: {
    flex: 1, height: 48, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#10B981',
  },
  shadowCompleteGoLiveText: {fontFamily: 'Inter-Bold', fontSize: 14, color: '#FFFFFF'},
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#161B22', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12,
    maxHeight: '85%',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center', marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {fontFamily: 'Inter-Bold', fontSize: 20, color: '#FFFFFF', letterSpacing: -0.3},
  closeBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  desc: {fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 19, marginBottom: 20},
  label: {
    fontFamily: 'Inter-Medium', fontSize: 10, letterSpacing: 1,
    color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 10,
  },
  durationGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16,
  },
  durationChip: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  durationChipActive: {
    backgroundColor: 'rgba(13,127,242,0.15)', borderColor: '#0D7FF2',
  },
  durationChipText: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: 'rgba(255,255,255,0.5)'},
  durationChipTextActive: {color: '#0D7FF2'},
  customRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16,
  },
  customInput: {
    flex: 1, height: 44, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10,
    paddingHorizontal: 14, fontFamily: 'Inter-SemiBold', fontSize: 16, color: '#FFFFFF',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  customLabel: {fontFamily: 'Inter-Medium', fontSize: 14, color: 'rgba(255,255,255,0.4)'},
  balanceRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10,
    paddingHorizontal: 14, height: 48, marginBottom: 24,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  dollarSign: {fontFamily: 'Inter-Bold', fontSize: 18, color: 'rgba(255,255,255,0.4)', marginRight: 4},
  balanceInput: {
    flex: 1, fontFamily: 'Inter-Bold', fontSize: 18, color: '#FFFFFF', padding: 0,
  },
  confirmBtn: {
    height: 54, borderRadius: 14, backgroundColor: '#10B981',
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  confirmText: {fontFamily: 'Inter-SemiBold', fontSize: 16, color: '#FFFFFF'},
  disclaimer: {
    fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.25)',
    textAlign: 'center',
  },
});
