import React, {useCallback, useState} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable, Dimensions, ActivityIndicator, RefreshControl, Modal, TextInput} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';
import Svg, {Circle as SvgCircle, Path} from 'react-native-svg';
import {RootStackParamList, Bot} from '../../types';
import {marketplaceApi} from '../../services/marketplace';
import {botsService} from '../../services/bots';
import {api} from '../../services/api';
import {useAuth} from '../../context/AuthContext';
import {useIAP} from '../../context/IAPContext';
import PortfolioLineChart from '../../components/charts/PortfolioLineChart';
import TradingViewChart from '../../components/charts/TradingViewChart';
import MonthlyReturnBars from '../../components/charts/MonthlyReturnBars';
import Badge from '../../components/common/Badge';
import TradeRow from '../../components/common/TradeRow';
import SectionHeader from '../../components/common/SectionHeader';
import ChevronLeftIcon from '../../components/icons/ChevronLeftIcon';
import ShareIcon from '../../components/icons/ShareIcon';
import StarIcon from '../../components/icons/StarIcon';
import XIcon from '../../components/icons/XIcon';
import {useToast} from '../../context/ToastContext';
import {useMarketKline, type ExchangeId, CRYPTO_INTERVALS, STOCK_INTERVALS, DEFAULT_CRYPTO_TF, DEFAULT_STOCK_TF} from '../../hooks/useMarketKline';

const {width} = Dimensions.get('window');
const CHART_W = width - 40;

// Format position size: stocks show integer or 4dp shares, crypto shows up to 6dp
function formatAmount(amount: number | null | undefined, symbol: string): string {
  if (amount == null || amount === 0) return '';
  const isStock = !symbol.includes('/') && !symbol.includes('USDT') && !symbol.includes('BTC') && symbol.length <= 5 && symbol === symbol.toUpperCase();
  if (isStock) {
    return amount % 1 === 0 ? `${amount.toFixed(0)} shares` : `${amount.toFixed(4).replace(/\.?0+$/, '')} shares`;
  }
  // Crypto: extract base currency
  const base = symbol.split('/')[0] ?? symbol;
  if (amount >= 1) return `${amount.toLocaleString('en-US', {maximumFractionDigits: 4})} ${base}`;
  if (amount >= 0.0001) return `${amount.toFixed(6).replace(/\.?0+$/, '')} ${base}`;
  return `${amount.toExponential(3)} ${base}`;
}

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
  const {isPro} = useIAP();
  const [bot, setBot] = useState<Bot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userBotState, setUserBotState] = useState<UserBotState>({status: 'none'});
  const [actionLoading, setActionLoading] = useState(false);
  const [shadowModalVisible, setShadowModalVisible] = useState(false);
  const [selectedDurationIdx, setSelectedDurationIdx] = useState<number | null>(null);
  const [customDays, setCustomDays] = useState('');
  const [virtualBalance, setVirtualBalance] = useState('10000');
  const [shadowMinOrder, setShadowMinOrder] = useState('10');

  // Stats tabs: 'live' = public live, 'my' = personal (shadow or live), shown when user has any active relationship
  const [activeStatsTab, setActiveStatsTab] = useState<'live' | 'my'>('live');
  const [publicLiveStats, setPublicLiveStats] = useState<any>(null);
  const [shadowSessionStats, setShadowSessionStats] = useState<any>(null);
  const [myLiveStats, setMyLiveStats] = useState<any>(null);
  const [statsTabLoading, setStatsTabLoading] = useState(false);

  // Subscriber customization
  const [subUserConfig, setSubUserConfig] = useState<{
    riskMultiplier?: number;
    maxDailyLoss?: string;
    autoStopBalance?: string;
    autoStopDays?: string;
    autoStopLossPercent?: string;
    compoundProfits?: boolean;
    notificationLevel?: string;
  }>({riskMultiplier: 1, notificationLevel: 'all'});
  const [savingConfig, setSavingConfig] = useState(false);
  const [configPanelExpanded, setConfigPanelExpanded] = useState(false);
  const [strategyExpanded, setStrategyExpanded] = useState(false);

  // Candlestick per trading pair
  const [selectedPair, setSelectedPair] = useState<string | null>(null);
  // Default to 4h — most common exchange default, chip is visually selected on load.
  const [chartTF, setChartTF] = useState('4h');
  const [chartTouching, setChartTouching] = useState(false);
  const [tradeMarkers, setTradeMarkers] = useState<{action: string; price: number; timestamp: number}[]>([]);
  // Binance-only — no exchange tabs shown
  const chartExchange: ExchangeId = 'binance';

  // ── Live hooks ──────────────────────────────────────────────────────────
  const {
    candles:      liveCandles,
    livePrice:    binanceLivePrice,
    loading:      candleLoading,
    loadingMore:  candleLoadingMore,
    connected:    candleConnected,
    source:       candleSource,
    totalCandles: candleTotalCount,
    hasMore:      candleHasMore,
    loadMore:     candleLoadMore,
  } = useMarketKline(selectedPair ?? undefined, chartTF, chartExchange);

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
      // Fetch bot details first — sets chart pair immediately without waiting for other calls
      const botData = await marketplaceApi.getBotDetails(route.params.botId).catch(() => null);
      if (botData) {
        setBot(botData);
        const pairs = botData.config?.pairs ?? ['BTC/USDT'];
        if (pairs.length > 0 && !selectedPair) {
          setSelectedPair(pairs[0]);
          setChartTF(botData.category === 'Stocks' ? DEFAULT_STOCK_TF : DEFAULT_CRYPTO_TF);
          fetchTradeMarkers(pairs[0]);
        }
      }

      // Now fetch the rest in parallel (non-blocking for chart)
      const [activeBots, shadowSessions, decisionsData] = await Promise.all([
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
          .map((d: any) => ({
            time: new Date(d.createdAt).getTime(),
            open: parseFloat(d.price),
            high: parseFloat(d.price) * 1.002,
            low: parseFloat(d.price) * 0.998,
            close: parseFloat(d.price),
            volume: d.action !== 'HOLD' ? 1000 : 100,
          }));
        if (equityPoints.length > 2) {
          botData.equityData = equityPoints;
          setBot({...botData}); // re-set with equity data added
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

      // Load subscriber userConfig if they have a subscription
      if (sub) {
        const subId = sub.subscriptionId || sub.id;
        botsService.getSubscription(subId).then((res: any) => {
          const uc = res?.data?.userConfig ?? {};
          setSubUserConfig({
            riskMultiplier: uc.riskMultiplier ?? 1,
            maxDailyLoss: uc.maxDailyLoss !== undefined ? String(uc.maxDailyLoss) : '',
            autoStopBalance: uc.autoStopBalance !== undefined ? String(uc.autoStopBalance) : '',
            autoStopDays: uc.autoStopDays !== undefined ? String(uc.autoStopDays) : '',
            autoStopLossPercent: uc.autoStopLossPercent !== undefined ? String(uc.autoStopLossPercent) : '',
            compoundProfits: uc.compoundProfits ?? false,
            notificationLevel: uc.notificationLevel ?? 'all',
          });
        }).catch(() => {});
      }

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
      // Always fetch public live stats for LIVE tab (includes equity curve + recent trades)
      setStatsTabLoading(true);
      botsService.getPublicLiveStats(route.params.botId)
        .then((res: any) => setPublicLiveStats(res?.data ?? null))
        .catch(() => {})
        .finally(() => setStatsTabLoading(false));

      // Determine who the current user is relative to this bot
      const isActiveLive = sub && (sub.subscriptionStatus === 'active' || sub.status === 'active') && (sub.subscriptionMode === 'live' || sub.mode === 'live');
      const shadowId = shadowRunning?.id ?? shadowPaused?.id ?? shadowCompleted?.id;

      // Fetch user's personal live stats if running live
      if (isActiveLive) {
        botsService.getMyLiveStats(route.params.botId)
          .then((res: any) => setMyLiveStats(res?.data ?? null))
          .catch(() => {});
      }

      // Fetch shadow session stats if user has a shadow session
      if (shadowId) {
        botsService.getShadowSessionLiveStats(shadowId)
          .then((res: any) => setShadowSessionStats(res?.data ?? null))
          .catch(() => {});
      }
    } catch {
      // Bot details fetch failed
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [route.params.botId]);

  // Fetch trade markers only — candle data now comes from useBinanceKline hook
  const fetchTradeMarkers = useCallback(async (pair: string) => {
    try {
      const markerRes = await api.get<{data: any[]}>(`/bots/${route.params.botId}/trade-markers?symbol=${encodeURIComponent(pair)}&days=90`);
      setTradeMarkers(Array.isArray(markerRes?.data) ? markerRes.data : []);
    } catch {
      setTradeMarkers([]);
    }
  }, [route.params.botId]);

  const handlePairSelect = useCallback((pair: string) => {
    setSelectedPair(pair);
    setChartTF(bot?.category === 'Stocks' ? DEFAULT_STOCK_TF : DEFAULT_CRYPTO_TF);
    fetchTradeMarkers(pair);
  }, [bot, fetchTradeMarkers]);

  const handleCandleTFChange = useCallback((tf: string) => {
    setChartTF(tf);
  }, []);

  useFocusEffect(useCallback(() => {
    fetchData();
    // No more setInterval — live data comes from WebSocket hooks
    return () => {};
  }, [fetchData]));

  // Auto-open shadow modal when navigated with openShadow=true (e.g. from Marketplace)
  const openShadowTriggered = React.useRef(false);
  React.useEffect(() => {
    if (route.params.openShadow && bot && !loading && !openShadowTriggered.current) {
      openShadowTriggered.current = true;
      // Small delay so the screen is fully rendered before the modal opens
      setTimeout(() => handleStartShadow(), 300);
    }
  }, [bot, loading, route.params.openShadow]);

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
    setShadowMinOrder(bot.category === 'Stocks' ? '1' : '10');
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
    const isStockBotCheck = bot.category === 'Stocks';
    const minOrderFloor = isStockBotCheck ? 1 : 10;
    const parsedMinOrder = parseFloat(shadowMinOrder) || minOrderFloor;
    if (parsedMinOrder < minOrderFloor) {
      showAlert('Invalid Min Order', `Minimum order must be at least $${minOrderFloor} for ${isStockBotCheck ? 'stock' : 'crypto'} bots.`);
      return;
    }

    let apiConfig: {virtualBalance: number; durationDays?: number; durationMinutes?: number; minOrderValue?: number};

    if (selectedDurationIdx === -1) {
      // Custom days
      const days = parseInt(customDays, 10);
      if (!days || days <= 0) {
        showAlert('Invalid Duration', 'Please enter a valid number of days.');
        return;
      }
      apiConfig = {virtualBalance: balance, durationDays: days, minOrderValue: parsedMinOrder};
    } else {
      const opt = DURATION_OPTIONS[selectedDurationIdx];
      if (opt.minutes) {
        apiConfig = {virtualBalance: balance, durationMinutes: opt.minutes, minOrderValue: parsedMinOrder};
      } else {
        apiConfig = {virtualBalance: balance, durationDays: opt.days!, minOrderValue: parsedMinOrder};
      }
    }

    setShadowModalVisible(false);
    setActionLoading(true);
    botsService
      .startShadowMode(bot.id, apiConfig)
      .then(() => navigation.navigate('ShadowMode'))
      .catch(() => showAlert('Error', 'Failed to start shadow mode.'))
      .finally(() => setActionLoading(false));
  }, [navigation, bot, selectedDurationIdx, customDays, virtualBalance, shadowMinOrder, DURATION_OPTIONS]);

  const handleActivate = useCallback(() => {
    if (!bot) return;
    if (userBotState.status === 'active') {
      showAlert('Already Active', 'This bot is already active and trading.');
      return;
    }
    const isAdmin = user?.role === 'admin';
    if (!isPro && !isAdmin) {
      showConfirm({
        title: 'Pro Required',
        message: 'Live bot trading requires an active Pro subscription. Upgrade now to unlock live trading, arena access, AI chat, and more.',
        confirmText: 'Upgrade to Pro',
        cancelText: 'Not Now',
        onConfirm: () => navigation.navigate('Subscription'),
      });
      return;
    }
    navigation.navigate('BotPurchase', {botId: bot.id});
  }, [navigation, bot, userBotState.status, isPro, user]);

  const handleViewShadow = useCallback(async () => {
    const sessionId = userBotState.shadowSessionId;
    if (!sessionId) {
      navigation.navigate('ShadowMode');
      return;
    }
    try {
      const res: any = await botsService.getShadowResults(sessionId);
      const d = res?.data ?? res;
      const profit = Number(d?.totalProfit ?? d?.profit ?? 0);
      const winRate = Number(d?.winRate ?? 0);
      navigation.navigate('ShadowModeResults', {botId: route.params.botId, profit, winRate, sessionId});
    } catch {
      // fallback: navigate with zeros — ShadowModeResults will fetch its own data
      navigation.navigate('ShadowModeResults', {botId: route.params.botId, profit: 0, winRate: 0, sessionId});
    }
  }, [navigation, userBotState.shadowSessionId, route.params.botId]);

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
      message: 'This will pause the shadow session. No new shadow trades will be made.',
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

  const handleSaveUserConfig = useCallback(async () => {
    const subId = userBotState.subscriptionId;
    if (!subId) return;
    setSavingConfig(true);
    try {
      await botsService.updateUserConfig(subId, {
        riskMultiplier: subUserConfig.riskMultiplier as any,
        maxDailyLoss: subUserConfig.maxDailyLoss ? parseFloat(subUserConfig.maxDailyLoss) : undefined,
        autoStopBalance: subUserConfig.autoStopBalance ? parseFloat(subUserConfig.autoStopBalance) : undefined,
        autoStopDays: subUserConfig.autoStopDays ? parseInt(subUserConfig.autoStopDays, 10) : undefined,
        autoStopLossPercent: subUserConfig.autoStopLossPercent ? parseFloat(subUserConfig.autoStopLossPercent) : undefined,
        compoundProfits: subUserConfig.compoundProfits,
        notificationLevel: subUserConfig.notificationLevel as any,
      });
      showAlert('Settings Saved', 'Your customizations have been applied to this bot.');
    } catch {
      showAlert('Error', 'Failed to save settings.');
    } finally {
      setSavingConfig(false);
    }
  }, [userBotState.subscriptionId, subUserConfig]);

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
  const isLiveActive = userBotState.status === 'active' || userBotState.status === 'paused' || userBotState.status === 'stopped';
  const hasShadowSession = userBotState.status === 'shadow_running' || userBotState.status === 'shadow_paused' || userBotState.status === 'shadow_completed';
  // Show dual tabs whenever user has any personal relationship (live OR shadow)
  const hasPersonalTab = isLiveActive || hasShadowSession;
  // Label for the personal tab
  const myTabLabel = isLiveActive ? 'MY LIVE' : 'MY SHADOW';
  // Personal stats data to show in "my" tab
  const myTabStats = isLiveActive ? myLiveStats : shadowSessionStats;

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

      {/* ── Tab bar (sticky, outside ScrollView) ── shown when user has any personal relationship */}
      {hasPersonalTab && (
        <View style={styles.tabBarWrap}>
          <Pressable
            style={[styles.tabBarBtn, activeStatsTab === 'live' && styles.tabBarBtnLiveActive]}
            onPress={() => setActiveStatsTab('live')}>
            <View style={[styles.tabBarDot, {backgroundColor: activeStatsTab === 'live' ? '#10B981' : 'rgba(255,255,255,0.2)'}]} />
            <Text style={[styles.tabBarBtnText, activeStatsTab === 'live' && {color: '#10B981'}]}>PUBLIC LIVE</Text>
          </Pressable>
          <Pressable
            style={[styles.tabBarBtn, activeStatsTab === 'my' && (isLiveActive ? styles.tabBarBtnLiveActive : styles.tabBarBtnShadowActive)]}
            onPress={() => setActiveStatsTab('my')}>
            <View style={[styles.tabBarDot, {backgroundColor: activeStatsTab === 'my' ? (isLiveActive ? '#10B981' : '#3B82F6') : 'rgba(255,255,255,0.2)'}]} />
            <Text style={[styles.tabBarBtnText, activeStatsTab === 'my' && {color: isLiveActive ? '#10B981' : '#3B82F6'}]}>{myTabLabel}</Text>
          </Pressable>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        scrollEnabled={!chartTouching}
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

        {/* ══ PUBLIC LIVE TAB — complete screen ══ */}
        <View style={{display: (!hasPersonalTab || activeStatsTab === 'live') ? 'flex' : 'none'}}>
            {/* Stats 2x2 grid */}
            <View style={styles.statsGrid}>
              {statCells.map(cell => (
                <View key={cell.label} style={styles.statCell}>
                  <Text style={styles.statCellLabel}>{cell.label}</Text>
                  <Text style={[styles.statCellValue, {color: cell.color}]}>{cell.value}</Text>
                </View>
              ))}
            </View>

            {/* Live community stats */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>LIVE TRADERS STATS</Text>
              {statsTabLoading ? (
                <ActivityIndicator size="small" color="#10B981" style={{marginVertical: 16}} />
              ) : (
                <View style={styles.metricsCard}>
                  <View style={styles.metricRow}>
                    <Text style={styles.metricLabel}>Live Traders</Text>
                    <Text style={[styles.metricValue, {color: '#10B981'}]}>{publicLiveStats?.liveTraders ?? bot.aggregateStats?.liveSubscribers ?? 0}</Text>
                  </View>
                  <View style={styles.metricRow}>
                    <Text style={styles.metricLabel}>All-Time Trades</Text>
                    <Text style={styles.metricValue}>{publicLiveStats?.totalTrades ?? bot.aggregateStats?.totalTrades ?? 0}</Text>
                  </View>
                  <View style={styles.metricRow}>
                    <Text style={styles.metricLabel}>Win Rate</Text>
                    <Text style={[styles.metricValue, {color: '#0D7FF2'}]}>{(publicLiveStats?.winRate ?? bot.winRate ?? 0).toFixed(1)}%</Text>
                  </View>
                  <View style={styles.metricRow}>
                    <Text style={styles.metricLabel}>Open Positions</Text>
                    <Text style={[styles.metricValue, {color: '#3B82F6'}]}>{publicLiveStats?.openPositions ?? bot.aggregateStats?.openPositions ?? 0}</Text>
                  </View>
                  <View style={styles.metricRow}>
                    <Text style={styles.metricLabel}>30D Trades</Text>
                    <Text style={styles.metricValue}>{publicLiveStats?.trades30d ?? '—'}</Text>
                  </View>
                  <View style={styles.metricRow}>
                    <Text style={styles.metricLabel}>30D P&L (all users)</Text>
                    <Text style={[styles.metricValue, {color: (publicLiveStats?.pnl30d ?? 0) >= 0 ? '#10B981' : '#EF4444'}]}>
                      {publicLiveStats ? `${(publicLiveStats.pnl30d ?? 0) >= 0 ? '+' : ''}$${(publicLiveStats.pnl30d ?? 0).toFixed(2)}` : '—'}
                    </Text>
                  </View>
                  <View style={styles.metricRow}>
                    <Text style={styles.metricLabel}>Avg Return 30D</Text>
                    <Text style={[styles.metricValue, {color: (publicLiveStats?.avgReturn30d ?? 0) >= 0 ? '#10B981' : '#EF4444'}]}>
                      {publicLiveStats ? `${(publicLiveStats.avgReturn30d ?? 0) >= 0 ? '+' : ''}${(publicLiveStats.avgReturn30d ?? 0).toFixed(2)}%` : '—'}
                    </Text>
                  </View>
                  <View style={[styles.metricRow, {borderBottomWidth: 0}]}>
                    <Text style={styles.metricLabel}>Total P&L (all-time)</Text>
                    <Text style={[styles.metricValue, {color: (publicLiveStats?.totalPnl ?? 0) >= 0 ? '#10B981' : '#EF4444'}]}>
                      {publicLiveStats ? `${(publicLiveStats.totalPnl ?? 0) >= 0 ? '+' : ''}$${(publicLiveStats.totalPnl ?? 0).toFixed(2)}` : '—'}
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {/* Bot P&L Equity Curve — cumulative live P&L across all users */}
            <View style={styles.chartSection}>
              <Text style={styles.chartSectionLabel}>LIVE PERFORMANCE (P&L)</Text>
              {statsTabLoading ? (
                <ActivityIndicator size="small" color="#10B981" style={{marginVertical: 40}} />
              ) : (
                <PortfolioLineChart
                  data={publicLiveStats?.equityCurve?.length >= 2 ? publicLiveStats.equityCurve : [0, publicLiveStats?.totalPnl ?? 0]}
                  dates={publicLiveStats?.equityDates ?? []}
                  currentValue={publicLiveStats?.totalPnl ?? 0}
                  width={CHART_W}
                  height={200}
                  isRealData={(publicLiveStats?.equityCurve?.length ?? 0) >= 2}
                  loading={false}
                />
              )}
            </View>

            {/* Candlestick Charts */}
            {(() => {
              const pairs = bot.config?.pairs ?? ['BTC/USDT'];
              const isStockBot = bot.category === 'Stocks';
              // Use real exchange intervals only
              const tfOptions = isStockBot ? STOCK_INTERVALS : CRYPTO_INTERVALS;
              return (
                <View style={styles.chartSection}>
                  <Text style={styles.chartSectionLabel}>PRICE ACTION</Text>

                  {/* Pair selector */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap: 8, marginBottom: 14}}>
                    {pairs.map(pair => (
                      <TouchableOpacity key={pair} activeOpacity={0.7}
                        style={[styles.pairChip, selectedPair === pair && styles.pairChipActive]}
                        onPress={() => handlePairSelect(pair)}>
                        <Text style={[styles.pairChipText, selectedPair === pair && styles.pairChipTextActive]}>{pair}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  {selectedPair ? (
                    liveCandles.length === 0 && (candleLoading || candleLoadingMore || !candleSource || candleSource === 'Loading...' || candleSource === 'Retrying...' || candleSource.startsWith('Connecting')) ? (
                      <View style={{alignItems: 'center', paddingVertical: 40}}>
                        <ActivityIndicator size="small" color="#10B981" />
                        <Text style={{fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 8}}>
                          {candleSource && candleSource !== 'Loading...' ? candleSource.replace('Connecting · ', 'Trying ').replace('...', '…') : `Loading ${selectedPair}…`}
                        </Text>
                      </View>
                    ) : liveCandles.length === 0 ? (
                      <View style={{alignItems: 'center', paddingVertical: 40}}>
                        <Text style={{fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.3)'}}>
                          {candleSource || 'No chart data available'}
                        </Text>
                      </View>
                    ) : (
                      <View>
                        {/* TF row */}
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap: 6, marginBottom: 8}}>
                          {tfOptions.map(tf => (
                            <TouchableOpacity key={tf} activeOpacity={0.7}
                              style={[styles.tfChip, chartTF === tf && styles.tfChipActive]}
                              onPress={() => handleCandleTFChange(tf)}>
                              <Text style={[styles.tfChipText, chartTF === tf && styles.tfChipTextActive]}>{tf.toUpperCase()}</Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>

                        {/* Source badge + candle count + pagination indicator */}
                        <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8}}>
                          {/* Left: source dot */}
                          {(() => {
                            const isLiveWS  = candleSource?.startsWith('Live');
                            const isLoading = !candleSource || candleSource === 'Loading...' || candleSource.startsWith('Connecting');
                            const dotColor  = isLiveWS ? '#10B981' : isLoading ? 'rgba(255,255,255,0.25)' : '#F59E0B';
                            return (
                              <View style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
                                <View style={{width: 6, height: 6, borderRadius: 3, backgroundColor: dotColor}} />
                                <Text style={{fontFamily: 'Inter-Regular', fontSize: 9, color: dotColor}}>
                                  {isLoading ? candleSource : candleSource}
                                </Text>
                              </View>
                            );
                          })()}
                          {/* Right: candle count + Load More button */}
                          <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                            {candleTotalCount > 0 && (
                              <Text style={{fontFamily: 'Inter-Regular', fontSize: 9, color: 'rgba(255,255,255,0.3)'}}>
                                {candleTotalCount.toLocaleString()} candles
                              </Text>
                            )}
                            {/* Load More button — only for Binance crypto pairs, not stocks */}
                            {candleTotalCount > 0 && !isStockBot && (
                              <TouchableOpacity
                                activeOpacity={candleHasMore && !candleLoadingMore ? 0.7 : 1}
                                onPress={candleHasMore && !candleLoadingMore ? candleLoadMore : undefined}
                                style={{
                                  flexDirection: 'row', alignItems: 'center', gap: 4,
                                  paddingHorizontal: 7, paddingVertical: 3,
                                  borderRadius: 5,
                                  backgroundColor: candleHasMore && !candleLoadingMore
                                    ? 'rgba(13,127,242,0.12)'
                                    : 'rgba(255,255,255,0.04)',
                                  borderWidth: 1,
                                  borderColor: candleHasMore && !candleLoadingMore
                                    ? 'rgba(13,127,242,0.3)'
                                    : 'rgba(255,255,255,0.08)',
                                }}>
                                {candleLoadingMore
                                  ? <ActivityIndicator size="small" color="rgba(255,255,255,0.3)" style={{transform: [{scale: 0.55}], width: 10, height: 10}} />
                                  : null}
                                <Text style={{
                                  fontFamily: 'Inter-Medium', fontSize: 9,
                                  color: candleHasMore && !candleLoadingMore
                                    ? '#0D7FF2'
                                    : 'rgba(255,255,255,0.2)',
                                }}>
                                  {candleLoadingMore ? 'Loading…' : candleHasMore ? '+ Load 1,000 more' : 'All loaded'}
                                </Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>

                        {/* Live price display */}
                        {binanceLivePrice && (
                          <View style={{flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 8}}>
                            <Text style={{fontFamily: 'Inter-Bold', fontSize: 20, color: '#FFFFFF'}}>
                              ${binanceLivePrice.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </Text>
                            <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.35)'}}>
                              {selectedPair}
                            </Text>
                          </View>
                        )}

                        <View
                          onTouchStart={() => setChartTouching(true)}
                          onTouchEnd={() => setChartTouching(false)}
                          onTouchCancel={() => setChartTouching(false)}>
                          <TradingViewChart
                            data={liveCandles}
                            livePrice={binanceLivePrice}
                            width={CHART_W}
                            height={320}
                            showVolume
                            timeframe={chartTF}
                            markers={tradeMarkers.map(m => ({time: m.timestamp, action: m.action as 'BUY'|'SELL', price: m.price}))}
                          />
                        </View>

                        {tradeMarkers.length > 0 && (
                          <View style={styles.markersSection}>
                            <Text style={styles.markersTitle}>BOT TRADES ON THIS PAIR</Text>
                            {tradeMarkers.slice(0, 10).map((m, i) => (
                              <View key={i} style={styles.markerRow}>
                                <View style={[styles.markerDot, {backgroundColor: m.action === 'BUY' ? '#10B981' : '#EF4444'}]} />
                                <Text style={styles.markerAction}>{m.action}</Text>
                                <Text style={styles.markerPrice}>${m.price.toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
                                <Text style={styles.markerTime}>{new Date(m.timestamp).toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    )
                  ) : (
                    <View style={{alignItems: 'center', paddingVertical: 30}}>
                      <Text style={{fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.3)'}}>Select a pair to view price chart</Text>
                    </View>
                  )}
                </View>
              );
            })()}

            {/* Recent Live Trades (all users — each is a complete round trip) */}
            {publicLiveStats?.recentTrades?.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>RECENT LIVE TRADES (ALL USERS)</Text>
                <ScrollView style={{maxHeight: 360}} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                  {publicLiveStats.recentTrades.map((t: any) => (
                    <View key={t.id} style={[styles.shadowTradeRow, {flexDirection: 'column', gap: 6, paddingVertical: 10}]}>
                      <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                        <Text style={styles.shadowTradePair}>{t.symbol}</Text>
                        <Text style={[styles.shadowTradePnl, {color: t.pnl >= 0 ? '#10B981' : '#EF4444'}]}>{t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)} <Text style={{fontSize: 11}}>{t.pnlPercent >= 0 ? '+' : ''}{t.pnlPercent.toFixed(2)}%</Text></Text>
                      </View>
                      <View style={{flexDirection: 'row', gap: 8}}>
                        <View style={{flex: 1, backgroundColor: 'rgba(16,185,129,0.08)', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: 'rgba(16,185,129,0.15)'}}>
                          <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 10, color: '#10B981', letterSpacing: 0.5}}>BUY</Text>
                          <Text style={{fontFamily: 'Inter-Medium', fontSize: 12, color: '#FFFFFF', marginTop: 2}}>${t.entryPrice?.toFixed(4) ?? '—'}</Text>
                          {!!formatAmount(t.amount, t.symbol) && <Text style={{fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 1}}>{formatAmount(t.amount, t.symbol)}</Text>}
                          <Text style={{fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 1}}>{t.openedAt ? new Date(t.openedAt).toLocaleDateString(undefined, {month: 'short', day: 'numeric'}) : '—'}</Text>
                        </View>
                        <View style={{flex: 1, backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: 'rgba(239,68,68,0.15)'}}>
                          <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 10, color: '#EF4444', letterSpacing: 0.5}}>SELL</Text>
                          <Text style={{fontFamily: 'Inter-Medium', fontSize: 12, color: '#FFFFFF', marginTop: 2}}>${t.exitPrice?.toFixed(4) ?? '—'}</Text>
                          {!!formatAmount(t.amount, t.symbol) && <Text style={{fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 1}}>{formatAmount(t.amount, t.symbol)}</Text>}
                          <Text style={{fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 1}}>{t.closedAt ? new Date(t.closedAt).toLocaleDateString(undefined, {month: 'short', day: 'numeric'}) : '—'}</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Overview Card */}
            <View style={styles.overviewCard}>
              <View style={styles.overviewRow}>
                <View style={styles.overviewItem}>
                  <Text style={styles.overviewLabel}>CATEGORY</Text>
                  <Text style={styles.overviewValue}>{bot.category}</Text>
                </View>
                <View style={styles.overviewDivider} />
                <View style={styles.overviewItem}>
                  <Text style={styles.overviewLabel}>RISK LEVEL</Text>
                  <Text style={[styles.overviewValue, {color: bot.risk === 'Very High' || bot.risk === 'High' ? '#EF4444' : bot.risk === 'Med' ? '#F59E0B' : '#10B981'}]}>{bot.risk}</Text>
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
                <View style={[styles.metricRow, bot.strategy && bot.strategy.length > 18 ? {flexDirection: 'column', alignItems: 'flex-start', gap: 4} : {}]}>
                  <Text style={styles.metricLabel}>Strategy</Text>
                  <Text style={[styles.metricValue, {color: '#8B5CF6', flexShrink: 1, flexWrap: 'wrap'}]}>{bot.strategy || 'N/A'}</Text>
                </View>
                <View style={[styles.metricRow, {flexDirection: 'column', alignItems: 'flex-start', gap: 8}]}>
                  <Text style={styles.metricLabel}>Trading Pairs</Text>
                  <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>
                    {(bot.config?.pairs || ['BTC/USDT']).map((pair, i) => (
                      <View key={i} style={{backgroundColor: 'rgba(59,130,246,0.12)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(59,130,246,0.25)'}}>
                        <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 12, color: '#3B82F6'}}>{pair}</Text>
                      </View>
                    ))}
                  </View>
                </View>
                {bot.config?.stopLoss && <View style={styles.metricRow}><Text style={styles.metricLabel}>Stop Loss</Text><Text style={[styles.metricValue, {color: '#EF4444'}]}>{bot.config.stopLoss}%</Text></View>}
                {bot.config?.takeProfit && <View style={styles.metricRow}><Text style={styles.metricLabel}>Take Profit</Text><Text style={[styles.metricValue, {color: '#10B981'}]}>{bot.config.takeProfit}%</Text></View>}
                {bot.config?.tradeDirection && <View style={styles.metricRow}><Text style={styles.metricLabel}>Direction</Text><Text style={styles.metricValue}>{bot.config.tradeDirection === 'buy' ? 'Buy Only' : bot.config.tradeDirection === 'sell' ? 'Sell Only' : 'Both'}</Text></View>}
                {bot.config?.orderType && <View style={styles.metricRow}><Text style={styles.metricLabel}>Order Type</Text><Text style={styles.metricValue}>{bot.config.orderType === 'limit' ? 'Limit' : 'Market'}</Text></View>}
                {bot.config?.tradingFrequency && (
                  <View style={styles.metricRow}><Text style={styles.metricLabel}>Trading Frequency</Text>
                    <Text style={[styles.metricValue, {color: bot.config.tradingFrequency === 'max' || bot.config.tradingFrequency === 'aggressive' ? '#EF4444' : '#10B981'}]}>
                      {bot.config.tradingFrequency.charAt(0).toUpperCase() + bot.config.tradingFrequency.slice(1)}
                    </Text>
                  </View>
                )}
                {bot.config?.aiMode && <View style={styles.metricRow}><Text style={styles.metricLabel}>AI Mode</Text><Text style={[styles.metricValue, {color: '#8B5CF6'}]}>{bot.config.aiMode === 'rules_only' ? 'Rules Only' : bot.config.aiMode === 'full_ai' ? 'Full AI' : 'Hybrid'}</Text></View>}
                {bot.config?.maxOpenPositions !== undefined && <View style={styles.metricRow}><Text style={styles.metricLabel}>Max Open Positions</Text><Text style={styles.metricValue}>{bot.config.maxOpenPositions}</Text></View>}
                {bot.config?.tradingSchedule && (
                  <View style={[styles.metricRow, {borderBottomWidth: 0}]}><Text style={styles.metricLabel}>Trading Schedule</Text>
                    <Text style={styles.metricValue}>{bot.config.tradingSchedule === '24_7' ? '24/7' : bot.config.tradingSchedule === 'us_hours' ? 'US Market Hours' : 'Custom'}</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Subscriber Customization */}
            {(userBotState.status === 'active' || userBotState.status === 'paused') && (
              <View style={styles.section}>
                <TouchableOpacity style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: configPanelExpanded ? 14 : 0}} activeOpacity={0.7} onPress={() => setConfigPanelExpanded(v => !v)}>
                  <Text style={styles.sectionLabel}>MY SETTINGS</Text>
                  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                    <Path d={configPanelExpanded ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'} stroke="rgba(255,255,255,0.4)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                </TouchableOpacity>
                {configPanelExpanded && (
                  <View style={styles.metricsCard}>
                    <View style={[styles.metricRow, {flexDirection: 'column', alignItems: 'flex-start', gap: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', paddingBottom: 14}]}>
                      <Text style={styles.metricLabel}>RISK MULTIPLIER</Text>
                      <View style={{flexDirection: 'row', gap: 8}}>
                        {([0.5, 1, 1.5, 2] as const).map(v => (
                          <TouchableOpacity key={v} activeOpacity={0.7} style={{paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, backgroundColor: subUserConfig.riskMultiplier === v ? 'rgba(16,185,129,0.18)' : '#1C2333', borderWidth: 1, borderColor: subUserConfig.riskMultiplier === v ? '#10B981' : 'rgba(255,255,255,0.08)'}} onPress={() => setSubUserConfig(c => ({...c, riskMultiplier: v}))}>
                            <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 13, color: subUserConfig.riskMultiplier === v ? '#10B981' : 'rgba(255,255,255,0.5)'}}>{v}x</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    <View style={[styles.metricRow, {flexDirection: 'column', alignItems: 'flex-start', gap: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', paddingBottom: 14}]}>
                      <Text style={styles.metricLabel}>NOTIFICATIONS</Text>
                      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
                        {(['all', 'wins_only', 'losses_only', 'summary'] as const).map(n => (
                          <TouchableOpacity key={n} activeOpacity={0.7} style={{paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: subUserConfig.notificationLevel === n ? 'rgba(59,130,246,0.18)' : '#1C2333', borderWidth: 1, borderColor: subUserConfig.notificationLevel === n ? '#3B82F6' : 'rgba(255,255,255,0.08)'}} onPress={() => setSubUserConfig(c => ({...c, notificationLevel: n}))}>
                            <Text style={{fontFamily: 'Inter-Medium', fontSize: 12, color: subUserConfig.notificationLevel === n ? '#3B82F6' : 'rgba(255,255,255,0.5)'}}>{n === 'all' ? 'All' : n === 'wins_only' ? 'Wins Only' : n === 'losses_only' ? 'Losses Only' : 'Summary'}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    <View style={[styles.metricRow, {alignItems: 'center', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', paddingBottom: 14}]}>
                      <View style={{flex: 1}}><Text style={styles.metricLabel}>MAX DAILY LOSS</Text></View>
                      <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#1C2333', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 12, paddingVertical: 8, minWidth: 80}}>
                        <TextInput style={{fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF', minWidth: 40, textAlign: 'right'}} keyboardType="decimal-pad" value={subUserConfig.maxDailyLoss ?? ''} onChangeText={v => setSubUserConfig(c => ({...c, maxDailyLoss: v}))} placeholder="—" placeholderTextColor="rgba(255,255,255,0.3)" />
                        <Text style={{fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.4)', marginLeft: 2}}>%</Text>
                      </View>
                    </View>
                    <View style={[styles.metricRow, {alignItems: 'center', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', paddingBottom: 14}]}>
                      <View style={{flex: 1}}><Text style={styles.metricLabel}>AUTO-STOP LOSS %</Text></View>
                      <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#1C2333', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 12, paddingVertical: 8, minWidth: 80}}>
                        <TextInput style={{fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF', minWidth: 40, textAlign: 'right'}} keyboardType="decimal-pad" value={subUserConfig.autoStopLossPercent ?? ''} onChangeText={v => setSubUserConfig(c => ({...c, autoStopLossPercent: v}))} placeholder="—" placeholderTextColor="rgba(255,255,255,0.3)" />
                        <Text style={{fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.4)', marginLeft: 2}}>%</Text>
                      </View>
                    </View>
                    <View style={[styles.metricRow, {alignItems: 'center', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', paddingBottom: 14}]}>
                      <View style={{flex: 1}}><Text style={styles.metricLabel}>AUTO-STOP BALANCE</Text></View>
                      <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#1C2333', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 12, paddingVertical: 8, minWidth: 80}}>
                        <Text style={{fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.4)', marginRight: 2}}>$</Text>
                        <TextInput style={{fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF', minWidth: 40, textAlign: 'right'}} keyboardType="decimal-pad" value={subUserConfig.autoStopBalance ?? ''} onChangeText={v => setSubUserConfig(c => ({...c, autoStopBalance: v}))} placeholder="—" placeholderTextColor="rgba(255,255,255,0.3)" />
                      </View>
                    </View>
                    <View style={[styles.metricRow, {alignItems: 'center', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', paddingBottom: 14}]}>
                      <View style={{flex: 1}}><Text style={styles.metricLabel}>AUTO-STOP DAYS</Text></View>
                      <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#1C2333', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 12, paddingVertical: 8, minWidth: 80}}>
                        <TextInput style={{fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF', minWidth: 40, textAlign: 'right'}} keyboardType="number-pad" value={subUserConfig.autoStopDays ?? ''} onChangeText={v => setSubUserConfig(c => ({...c, autoStopDays: v}))} placeholder="—" placeholderTextColor="rgba(255,255,255,0.3)" />
                        <Text style={{fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.4)', marginLeft: 4}}>days</Text>
                      </View>
                    </View>
                    <View style={[styles.metricRow, {alignItems: 'center', paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)'}]}>
                      <View style={{flex: 1}}><Text style={styles.metricLabel}>COMPOUND PROFITS</Text></View>
                      <TouchableOpacity activeOpacity={0.7} style={{width: 48, height: 26, borderRadius: 13, backgroundColor: subUserConfig.compoundProfits ? '#10B981' : '#2D3748', justifyContent: 'center', paddingHorizontal: 3}} onPress={() => setSubUserConfig(c => ({...c, compoundProfits: !c.compoundProfits}))}>
                        <View style={{width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF', alignSelf: subUserConfig.compoundProfits ? 'flex-end' : 'flex-start'}} />
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity style={{marginTop: 14, backgroundColor: '#10B981', borderRadius: 14, paddingVertical: 14, alignItems: 'center', opacity: savingConfig ? 0.6 : 1}} activeOpacity={0.8} disabled={savingConfig} onPress={handleSaveUserConfig}>
                      {savingConfig ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 15, color: '#FFFFFF'}}>Save My Settings</Text>}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* Bot DNA */}
            {bot.tags && bot.tags.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>BOT DNA</Text>
                <View style={styles.tagsRow}>
                  {bot.tags.map(tag => <Badge key={tag} label={tag} variant="outline" size="sm" style={styles.tag} />)}
                </View>
              </View>
            )}

            {/* Strategy */}
            {bot.description ? (
              <View style={styles.section}>
                <View style={styles.strategyHeader}>
                  <Text style={styles.sectionLabel}>STRATEGY</Text>
                  {bot.description.length > 180 && (
                    <TouchableOpacity onPress={() => setStrategyExpanded(v => !v)} activeOpacity={0.7}>
                      <Text style={styles.strategyToggle}>{strategyExpanded ? 'Show less' : 'Read more'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.strategyCard}>
                  {/* Strategy name pill */}
                  {bot.strategy ? (
                    <View style={styles.strategyNamePill}>
                      <Text style={styles.strategyNamePillText} numberOfLines={2}>{bot.strategy}</Text>
                    </View>
                  ) : null}
                  <Text
                    style={styles.strategyText}
                    numberOfLines={strategyExpanded || bot.description.length <= 180 ? undefined : 4}>
                    {bot.description}
                  </Text>
                  {bot.description.length > 180 && !strategyExpanded && (
                    <TouchableOpacity style={styles.readMoreBtn} onPress={() => setStrategyExpanded(true)} activeOpacity={0.7}>
                      <Text style={styles.readMoreBtnText}>Read full strategy  ↓</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ) : null}

            {/* Key Metrics */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>KEY METRICS</Text>
              <View style={styles.metricsCard}>
                <View style={styles.metricRow}><Text style={styles.metricLabel}>Total Return (30D)</Text><Text style={[styles.metricValue, {color: bot.returnPercent >= 0 ? '#10B981' : '#EF4444'}]}>{bot.returnPercent >= 0 ? '+' : ''}{bot.returnPercent.toFixed(2)}%</Text></View>
                <View style={styles.metricRow}><Text style={styles.metricLabel}>Win Rate</Text><Text style={styles.metricValue}>{bot.winRate.toFixed(1)}%</Text></View>
                <View style={styles.metricRow}><Text style={styles.metricLabel}>Max Drawdown</Text><Text style={[styles.metricValue, {color: '#EF4444'}]}>{bot.maxDrawdown.toFixed(2)}%</Text></View>
                <View style={styles.metricRow}><Text style={styles.metricLabel}>Sharpe Ratio</Text><Text style={[styles.metricValue, {color: bot.sharpeRatio >= 1 ? '#10B981' : '#F59E0B'}]}>{bot.sharpeRatio.toFixed(2)}</Text></View>
                <View style={styles.metricRow}><Text style={styles.metricLabel}>Active Users</Text><Text style={styles.metricValue}>{bot.activeUsers.toLocaleString()}</Text></View>
                <View style={[styles.metricRow, {borderBottomWidth: 0}]}>
                  <Text style={styles.metricLabel}>Average Rating</Text>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
                    <StarIcon size={12} filled color="#EAB308" />
                    <Text style={styles.metricValue}>{bot.rating.toFixed(1)} ({bot.reviewCount})</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Creator */}
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
                  {bot.recentTrades.slice(0, 3).map(trade => <TradeRow key={trade.id} trade={trade} />)}
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
                          {[1,2,3,4,5].map(i => <StarIcon key={i} size={10} filled={i <= review.rating} color="#EAB308" />)}
                        </View>
                      </View>
                      <Text style={styles.reviewDate}>{review.date}</Text>
                    </View>
                    <Text style={styles.reviewText}>{review.text}</Text>
                  </View>
                ))}
              </View>
            )}
        </View>
        {/* ══ MY TAB — personal live or shadow stats ══ */}
        {hasPersonalTab && (
        <View style={{display: activeStatsTab === 'my' ? 'flex' : 'none'}}>
            {myTabStats ? (
              <View>
                {/* 2x2 stat grid */}
                <View style={styles.statsGrid}>
                  {[
                    {label: 'RETURN', value: `${(myTabStats.totalReturn ?? 0) >= 0 ? '+' : ''}${(myTabStats.totalReturn ?? 0).toFixed(1)}%`, color: (myTabStats.totalReturn ?? 0) >= 0 ? '#10B981' : '#EF4444'},
                    {label: 'WIN RATE', value: `${(myTabStats.winRate ?? 0).toFixed(0)}%`, color: isLiveActive ? '#10B981' : '#3B82F6'},
                    {label: 'MAX DRAWDOWN', value: `-${(myTabStats.maxDrawdown ?? 0).toFixed(1)}%`, color: '#EF4444'},
                    {label: 'TRADES', value: `${myTabStats.totalTrades ?? 0}`, color: '#FFFFFF'},
                  ].map(cell => (
                    <View key={cell.label} style={styles.statCell}>
                      <Text style={styles.statCellLabel}>{cell.label}</Text>
                      <Text style={[styles.statCellValue, {color: cell.color}]}>{cell.value}</Text>
                    </View>
                  ))}
                </View>

                {/* Status row — shadow only */}
                {hasShadowSession && shadowSessionStats && (
                  <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8}}>
                    <View style={{paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: shadowSessionStats.status === 'running' ? 'rgba(59,130,246,0.15)' : shadowSessionStats.status === 'paused' ? 'rgba(245,158,11,0.15)' : 'rgba(107,114,128,0.15)', borderWidth: 1, borderColor: shadowSessionStats.status === 'running' ? 'rgba(59,130,246,0.4)' : shadowSessionStats.status === 'paused' ? 'rgba(245,158,11,0.4)' : 'rgba(107,114,128,0.3)'}}>
                      <Text style={{fontFamily: 'Inter-Bold', fontSize: 10, letterSpacing: 0.8, color: shadowSessionStats.status === 'running' ? '#3B82F6' : shadowSessionStats.status === 'paused' ? '#F59E0B' : '#9CA3AF'}}>
                        {shadowSessionStats.status === 'running' ? '● RUNNING' : shadowSessionStats.status === 'paused' ? '⏸ PAUSED' : '✓ COMPLETED'}
                      </Text>
                    </View>
                    <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.35)'}}>Day {shadowSessionStats.daysRunning} of {shadowSessionStats.durationDays ?? '?'}</Text>
                  </View>
                )}

                {/* Balance row */}
                <View style={styles.shadowTabBalanceRow}>
                  <View style={{flex: 1, alignItems: 'center'}}>
                    <Text style={styles.shadowTabBalLabel}>{isLiveActive ? 'ALLOCATED' : 'STARTED WITH'}</Text>
                    <Text style={styles.shadowTabBalValue}>${((isLiveActive ? myTabStats.allocatedAmount : myTabStats.virtualBalance) ?? 0).toFixed(0)}</Text>
                  </View>
                  <View style={styles.shadowTabBalDivider} />
                  <View style={{flex: 1, alignItems: 'center'}}>
                    <Text style={styles.shadowTabBalLabel}>CURRENT</Text>
                    <Text style={[styles.shadowTabBalValue, {color: (myTabStats.totalReturn ?? 0) >= 0 ? '#10B981' : '#EF4444'}]}>${(myTabStats.currentBalance ?? 0).toFixed(0)}</Text>
                  </View>
                  <View style={styles.shadowTabBalDivider} />
                  <View style={{flex: 1, alignItems: 'center'}}>
                    <Text style={styles.shadowTabBalLabel}>REALIZED P&L</Text>
                    <Text style={[styles.shadowTabBalValue, {color: (myTabStats.realizedPnl ?? 0) >= 0 ? '#10B981' : '#EF4444'}]}>{(myTabStats.realizedPnl ?? 0) >= 0 ? '+' : ''}${(myTabStats.realizedPnl ?? 0).toFixed(2)}</Text>
                  </View>
                </View>

                {/* P&L equity curve — uses backend equityCurve (cumulative realized P&L) */}
                {(() => {
                  // Both live and shadow now return equityCurve from backend
                  const curveData: number[] = myTabStats.equityCurve ?? [];
                  const curveDates: string[] = myTabStats.equityDates ?? [];
                  const hasEquity = curveData.length >= 2;
                  if (!hasEquity) return null;
                  return (
                    <View style={[styles.chartSection, {marginTop: 16}]}>
                      <Text style={styles.chartSectionLabel}>{isLiveActive ? 'MY LIVE PERFORMANCE (P&L)' : 'MY SHADOW PERFORMANCE (P&L)'}</Text>
                      <PortfolioLineChart
                        data={curveData}
                        dates={curveDates}
                        currentValue={myTabStats.realizedPnl ?? 0}
                        width={CHART_W}
                        height={180}
                        isRealData={true}
                        loading={false}
                      />
                    </View>
                  );
                })()}

                {/* My metrics */}
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>{isLiveActive ? 'MY LIVE METRICS' : 'MY SHADOW METRICS'}</Text>
                  <View style={styles.metricsCard}>
                    <View style={styles.metricRow}><Text style={styles.metricLabel}>Realized P&L</Text><Text style={[styles.metricValue, {color: (myTabStats.realizedPnl ?? 0) >= 0 ? '#10B981' : '#EF4444'}]}>{(myTabStats.realizedPnl ?? 0) >= 0 ? '+' : ''}${(myTabStats.realizedPnl ?? 0).toFixed(2)}</Text></View>
                    <View style={styles.metricRow}><Text style={styles.metricLabel}>Win Rate</Text><Text style={[styles.metricValue, {color: '#0D7FF2'}]}>{(myTabStats.winRate ?? 0).toFixed(1)}%</Text></View>
                    <View style={styles.metricRow}><Text style={styles.metricLabel}>Total Trades</Text><Text style={styles.metricValue}>{myTabStats.totalTrades ?? 0}</Text></View>
                    <View style={styles.metricRow}><Text style={styles.metricLabel}>Open Positions</Text><Text style={[styles.metricValue, {color: isLiveActive ? '#10B981' : '#3B82F6'}]}>{myTabStats.openPositionsCount ?? 0}</Text></View>
                    <View style={styles.metricRow}><Text style={styles.metricLabel}>Wins / Losses</Text><Text style={styles.metricValue}><Text style={{color: '#10B981'}}>{myTabStats.wins ?? 0}W</Text> / <Text style={{color: '#EF4444'}}>{myTabStats.losses ?? 0}L</Text></Text></View>
                    <View style={styles.metricRow}><Text style={styles.metricLabel}>Avg Win</Text><Text style={[styles.metricValue, {color: '#10B981'}]}>+{(myTabStats.avgWinPercent ?? 0).toFixed(2)}%</Text></View>
                    <View style={styles.metricRow}><Text style={styles.metricLabel}>Avg Loss</Text><Text style={[styles.metricValue, {color: '#EF4444'}]}>{(myTabStats.avgLossPercent ?? 0).toFixed(2)}%</Text></View>
                    <View style={[styles.metricRow, {borderBottomWidth: 0}]}><Text style={styles.metricLabel}>Max Drawdown</Text><Text style={[styles.metricValue, {color: '#EF4444'}]}>-{(myTabStats.maxDrawdown ?? 0).toFixed(2)}%</Text></View>
                  </View>
                </View>

                {/* Best / Worst trade */}
                {(myTabStats.bestTrade || myTabStats.worstTrade) && (
                  <View style={styles.section}>
                    <Text style={styles.sectionLabel}>TRADE EXTREMES</Text>
                    <View style={styles.metricsCard}>
                      {myTabStats.bestTrade && <View style={styles.metricRow}><Text style={styles.metricLabel}>Best Trade ({myTabStats.bestTrade.symbol})</Text><Text style={[styles.metricValue, {color: '#10B981'}]}>+{myTabStats.bestTrade.pnlPercent.toFixed(2)}%</Text></View>}
                      {myTabStats.worstTrade && <View style={[styles.metricRow, {borderBottomWidth: 0}]}><Text style={styles.metricLabel}>Worst Trade ({myTabStats.worstTrade.symbol})</Text><Text style={[styles.metricValue, {color: '#EF4444'}]}>{myTabStats.worstTrade.pnlPercent.toFixed(2)}%</Text></View>}
                    </View>
                  </View>
                )}

                {/* Monthly returns */}
                {myTabStats.monthlyReturns?.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionLabel}>MONTHLY RETURNS</Text>
                    <View style={styles.metricsCard}>
                      {myTabStats.monthlyReturns.map((m: any, idx: number) => (
                        <View key={m.month} style={[styles.metricRow, {borderBottomWidth: idx === myTabStats.monthlyReturns.length - 1 ? 0 : 1}]}>
                          <Text style={styles.metricLabel}>{m.month}</Text>
                          <View style={{alignItems: 'flex-end'}}>
                            <Text style={[styles.metricValue, {color: m.returnPct >= 0 ? '#10B981' : '#EF4444'}]}>{m.returnPct >= 0 ? '+' : ''}{m.returnPct.toFixed(2)}%</Text>
                            <Text style={{fontFamily: 'Inter-Regular', fontSize: 10, color: m.pnl >= 0 ? 'rgba(16,185,129,0.6)' : 'rgba(239,68,68,0.6)'}}>{m.pnl >= 0 ? '+' : ''}${m.pnl.toFixed(2)}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Closed trades list — each row is a complete round trip (BUY entry + SELL exit) */}
                {myTabStats.closedTrades?.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionLabel}>{isLiveActive ? 'MY LIVE TRADES' : 'MY SHADOW TRADES'} ({myTabStats.closedTrades.length} round trips)</Text>
                    <ScrollView style={{maxHeight: 420}} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                      {myTabStats.closedTrades.slice(0, 50).map((t: any) => (
                        <View key={t.id} style={[styles.shadowTradeRow, {flexDirection: 'column', gap: 6, paddingVertical: 10}]}>
                          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                            <Text style={styles.shadowTradePair}>{t.symbol}</Text>
                            <Text style={[styles.shadowTradePnl, {color: t.pnl >= 0 ? '#10B981' : '#EF4444'}]}>{t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)} <Text style={{fontSize: 11}}>{t.pnlPercent >= 0 ? '+' : ''}{t.pnlPercent.toFixed(2)}%</Text></Text>
                          </View>
                          <View style={{flexDirection: 'row', gap: 8}}>
                            <View style={{flex: 1, backgroundColor: 'rgba(16,185,129,0.08)', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: 'rgba(16,185,129,0.15)'}}>
                              <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 10, color: '#10B981', letterSpacing: 0.5}}>BUY</Text>
                              <Text style={{fontFamily: 'Inter-Medium', fontSize: 12, color: '#FFFFFF', marginTop: 2}}>${t.entryPrice?.toFixed(4) ?? '—'}</Text>
                              {!!formatAmount(t.amount, t.symbol) && <Text style={{fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 1}}>{formatAmount(t.amount, t.symbol)}</Text>}
                              <Text style={{fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 1}}>{t.openedAt ? new Date(t.openedAt).toLocaleDateString(undefined, {month: 'short', day: 'numeric'}) : '—'}</Text>
                            </View>
                            <View style={{flex: 1, backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: 'rgba(239,68,68,0.15)'}}>
                              <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 10, color: '#EF4444', letterSpacing: 0.5}}>SELL</Text>
                              <Text style={{fontFamily: 'Inter-Medium', fontSize: 12, color: '#FFFFFF', marginTop: 2}}>${t.exitPrice?.toFixed(4) ?? '—'}</Text>
                              {!!formatAmount(t.amount, t.symbol) && <Text style={{fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 1}}>{formatAmount(t.amount, t.symbol)}</Text>}
                              <Text style={{fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 1}}>{t.closedAt ? new Date(t.closedAt).toLocaleDateString(undefined, {month: 'short', day: 'numeric'}) : '—'}</Text>
                            </View>
                          </View>
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* Open positions */}
                {myTabStats.openPositions?.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionLabel}>OPEN POSITIONS ({myTabStats.openPositions.length})</Text>
                    <ScrollView style={{maxHeight: 280}} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                      {myTabStats.openPositions.map((p: any) => (
                        <View key={p.id} style={styles.shadowTradeRow}>
                          <View style={{flex: 1}}>
                            <Text style={styles.shadowTradePair}>{p.symbol} <Text style={{color: '#10B981', textTransform: 'uppercase'}}>LONG</Text></Text>
                            <Text style={styles.shadowTradeDate}>Entry: ${p.entryPrice.toFixed(4)} · {p.openedAt ? new Date(p.openedAt).toLocaleDateString(undefined, {month: 'short', day: 'numeric'}) : '—'}</Text>
                            {!!formatAmount(p.amount, p.symbol) && <Text style={{fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 1}}>{formatAmount(p.amount, p.symbol)}</Text>}
                          </View>
                          <View style={{alignItems: 'flex-end'}}>
                            <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 12, color: '#3B82F6'}}>OPEN</Text>
                            <Text style={{fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.4)'}}>${(p.entryValue ?? 0).toFixed(2)}</Text>
                          </View>
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {hasShadowSession && (
                  <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.2)', textAlign: 'center', marginTop: 8, marginBottom: 4}}>
                    Shadow mode uses virtual funds — no real money at risk
                  </Text>
                )}
              </View>
            ) : (
              <View style={{alignItems: 'center', paddingVertical: 40}}>
                <ActivityIndicator size="small" color={isLiveActive ? '#10B981' : '#3B82F6'} />
                <Text style={{fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 12}}>
                  {isLiveActive ? 'Loading your live stats…' : 'Loading your shadow session…'}
                </Text>
              </View>
            )}
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

            {/* Min order value */}
            <Text style={modalStyles.label}>MIN ORDER VALUE (PER TRADE)</Text>
            <View style={modalStyles.balanceRow}>
              <Text style={modalStyles.dollarSign}>$</Text>
              <TextInput
                style={modalStyles.balanceInput}
                value={shadowMinOrder}
                onChangeText={setShadowMinOrder}
                keyboardType="decimal-pad"
                maxLength={8}
              />
            </View>
            <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 16}}>
              {`Bot skips trades below this · min $${bot?.category === 'Stocks' ? '1' : '10'}`}
            </Text>

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
          /* No active relationship — Shadow (secondary) + Activate (primary) */
          <View style={styles.footerRow}>
            <TouchableOpacity style={[styles.shadowBtn, {flex: 1}]} onPress={handleStartShadow} activeOpacity={0.8}>
              <Text style={styles.shadowBtnText}>Shadow Mode</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.activateBtn, {flex: 2}]} onPress={handleActivate} activeOpacity={0.85}>
              <Text style={styles.activateBtnText}>
                {isPro || user?.role === 'admin'
                  ? (bot.price === 0 ? 'Go Live (Free)' : `Go Live — $${bot.price}/mo`)
                  : '⚡ Go Pro to Live Trade'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : userBotState.status === 'shadow_running' ? (
          /* Shadow running — top row: Pause + Stop (equal); bottom: Go Live (full width) */
          <>
            <View style={styles.footerRow}>
              <TouchableOpacity style={[styles.pauseBtn, {flex: 1}]} onPress={handlePauseShadow} activeOpacity={0.8}>
                <Text style={styles.pauseBtnText}>Pause Shadow</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.stopBtn, {flex: 1}]} onPress={handleStopShadow} activeOpacity={0.8}>
                <Text style={styles.stopBtnText}>Stop Shadow</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.goLiveSmallBtn} onPress={handleActivate} activeOpacity={0.85}>
              <Text style={styles.goLiveSmallText}>
                {isPro || user?.role === 'admin' ? 'Go Live Now' : '⚡ Go Pro to Live Trade'}
              </Text>
            </TouchableOpacity>
          </>
        ) : userBotState.status === 'shadow_paused' ? (
          /* Shadow paused — top row: Resume + Stop (equal); bottom: Go Live (full width) */
          <>
            <View style={styles.footerRow}>
              <TouchableOpacity style={[styles.resumeBtn, {flex: 1}]} onPress={handleResumeShadow} activeOpacity={0.8}>
                <Text style={styles.resumeBtnText}>Resume Shadow</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.stopBtn, {flex: 1}]} onPress={handleStopShadow} activeOpacity={0.8}>
                <Text style={styles.stopBtnText}>Stop Shadow</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.goLiveSmallBtn} onPress={handleActivate} activeOpacity={0.85}>
              <Text style={styles.goLiveSmallText}>
                {isPro || user?.role === 'admin' ? 'Go Live Now' : '⚡ Go Pro to Live Trade'}
              </Text>
            </TouchableOpacity>
          </>
        ) : userBotState.status === 'shadow_completed' ? (
          /* Shadow completed — banner + two equal buttons */
          <>
            <View style={styles.shadowCompleteBanner}>
              <View style={styles.shadowCompleteCheck}>
                <Text style={{fontSize: 14}}>✓</Text>
              </View>
              <Text style={styles.shadowCompleteText}>Shadow Mode Complete</Text>
            </View>
            <View style={styles.footerRow}>
              <TouchableOpacity style={[styles.shadowCompleteResultsBtn, {flex: 1}]} onPress={handleViewShadow} activeOpacity={0.8}>
                <Text style={styles.shadowCompleteResultsText}>View Results</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.shadowCompleteGoLiveBtn, {flex: 1}]} onPress={handleActivate} activeOpacity={0.85}>
                <Text style={styles.shadowCompleteGoLiveText}>
                  {isPro || user?.role === 'admin' ? 'Go Live' : '⚡ Go Pro'}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        ) : userBotState.status === 'active' ? (
          /* Bot is live — Pause + Stop in one row (both full width equal) */
          <View style={styles.footerRow}>
            <TouchableOpacity style={[styles.pauseBtn, {flex: 1}]} onPress={handlePause} activeOpacity={0.8}>
              <Text style={styles.pauseBtnText}>Pause Bot</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.stopBtn, {flex: 1}]} onPress={handleStop} activeOpacity={0.8}>
              <Text style={styles.stopBtnText}>Stop Bot</Text>
            </TouchableOpacity>
          </View>
        ) : userBotState.status === 'paused' ? (
          /* Bot paused — status indicator + Resume (primary, full) + Stop (secondary, full) */
          <>
            <View style={styles.statusCard}>
              <View style={[styles.statusDot, {backgroundColor: '#F97316'}]} />
              <View style={styles.statusTextCol}>
                <Text style={styles.statusTitle}>Bot Paused</Text>
                <Text style={styles.statusSub}>No trades being placed</Text>
              </View>
            </View>
            <View style={styles.footerRow}>
              <TouchableOpacity style={[styles.resumeBtn, {flex: 2}]} onPress={handleResume} activeOpacity={0.85}>
                <Text style={styles.resumeBtnText}>Resume Bot</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.stopBtn, {flex: 1}]} onPress={handleStop} activeOpacity={0.8}>
                <Text style={styles.stopBtnText}>Stop</Text>
              </TouchableOpacity>
            </View>
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
  tabBarWrap: {flexDirection: 'row', backgroundColor: '#161B22', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 20, paddingVertical: 8, gap: 8},
  tabBarBtn: {flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10},
  tabBarBtnLiveActive: {backgroundColor: 'rgba(16,185,129,0.12)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)'},
  tabBarBtnShadowActive: {backgroundColor: 'rgba(59,130,246,0.12)', borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)'},
  tabBarDot: {width: 7, height: 7, borderRadius: 3.5},
  tabBarBtnText: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5},
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
  strategyHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
  },
  strategyToggle: {
    fontFamily: 'Inter-SemiBold', fontSize: 12, color: '#10B981',
  },
  strategyCard: {
    backgroundColor: '#161B22', borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    padding: 14,
  },
  strategyNamePill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12, paddingVertical: 5, marginBottom: 10,
  },
  strategyNamePillText: {
    fontFamily: 'Inter-SemiBold', fontSize: 12, color: 'rgba(255,255,255,0.55)',
    flexShrink: 1,
  },
  strategyText: {fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.65)', lineHeight: 22},
  readMoreBtn: {
    marginTop: 10, alignSelf: 'flex-start',
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderRadius: 8, borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)',
    paddingHorizontal: 12, paddingVertical: 6,
  },
  readMoreBtnText: {
    fontFamily: 'Inter-SemiBold', fontSize: 12, color: '#10B981',
  },
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

  // ─── Stats Tab UI ─────────────────────────────────────────────────────────
  statsTabBar: {
    flexDirection: 'row' as const, backgroundColor: '#161B22',
    borderRadius: 12, padding: 4, marginBottom: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  statsTab: {
    flex: 1, paddingVertical: 10, alignItems: 'center' as const,
    borderRadius: 9, flexDirection: 'row' as const, justifyContent: 'center' as const, gap: 6,
  },
  statsTabLiveActive: {
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)',
  },
  statsTabShadowActive: {
    backgroundColor: 'rgba(59,130,246,0.12)',
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)',
  },
  statsTabText: {fontFamily: 'Inter-SemiBold', fontSize: 12, color: 'rgba(255,255,255,0.35)', letterSpacing: 0.5},
  statsTabTextLiveActive: {color: '#10B981'},
  statsTabTextShadowActive: {color: '#3B82F6'},
  statsTabLiveDot: {width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981'},

  shadowTabBalanceRow: {
    flexDirection: 'row' as const, alignItems: 'stretch' as const,
    backgroundColor: 'rgba(59,130,246,0.06)',
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(59,130,246,0.2)',
    paddingVertical: 16,
  },
  shadowTabBalLabel: {fontFamily: 'Inter-Medium', fontSize: 9, letterSpacing: 0.8, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' as const, marginBottom: 6},
  shadowTabBalValue: {fontFamily: 'Inter-Bold', fontSize: 18, color: '#FFFFFF', letterSpacing: -0.5},
  shadowTabBalDivider: {width: 1, backgroundColor: 'rgba(59,130,246,0.2)'},

  shadowTradeRow: {
    flexDirection: 'row' as const, alignItems: 'center' as const,
    backgroundColor: '#161B22', borderRadius: 12, padding: 12, marginBottom: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  shadowTradePair: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#FFFFFF', marginBottom: 2},
  shadowTradeDate: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.35)'},
  shadowTradePnl: {fontFamily: 'Inter-Bold', fontSize: 14, textAlign: 'right' as const},

  // ─── Footer ──────────────────────────────────────────────────────────────
  footer: {
    flexDirection: 'column', gap: 8,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32,
    backgroundColor: '#0F1117', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
  },
  footerRow: {
    flexDirection: 'row', gap: 10,
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
    height: 52, borderRadius: 12,
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
