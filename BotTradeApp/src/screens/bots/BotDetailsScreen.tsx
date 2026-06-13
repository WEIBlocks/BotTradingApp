import React, {useCallback, useState, useTransition} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable, Dimensions, ActivityIndicator, Animated, RefreshControl, Modal, TextInput, KeyboardAvoidingView, Platform, InteractionManager} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';
import Svg, {Circle as SvgCircle, Path} from 'react-native-svg';
import {RootStackParamList, Bot} from '../../types';
import {marketplaceApi} from '../../services/marketplace';
import {botsService, type CompoundingSettings, type TrainerConfig, type BotPerformanceSnapshot} from '../../services/bots';
import {api} from '../../services/api';
import {useAuth} from '../../context/AuthContext';
import {useIAP} from '../../context/IAPContext';
import PortfolioLineChart from '../../components/charts/PortfolioLineChart';
import TradingViewChart from '../../components/charts/TradingViewChart';
import MonthlyReturnBars from '../../components/charts/MonthlyReturnBars';
import Badge from '../../components/common/Badge';
import BotAvatar from '../../components/common/BotAvatar';
import HeartIcon from '../../components/icons/HeartIcon';
import {useFavorites} from '../../context/FavoritesContext';
import TradeRow from '../../components/common/TradeRow';
import SectionHeader from '../../components/common/SectionHeader';
import ChevronLeftIcon from '../../components/icons/ChevronLeftIcon';
import StarIcon from '../../components/icons/StarIcon';
import XIcon from '../../components/icons/XIcon';
import {useToast} from '../../context/ToastContext';
import {useMarketKline, type ExchangeId, CRYPTO_INTERVALS, STOCK_INTERVALS, DEFAULT_CRYPTO_TF, DEFAULT_STOCK_TF} from '../../hooks/useMarketKline';

const {width} = Dimensions.get('window');
const CHART_W = width - 40;

// Module-level cache — survives navigation, cleared after 30s TTL
const _cache: Map<string, {data: any; ts: number}> = new Map();
const CACHE_TTL = 30_000;
function cacheGet(key: string): any | null {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { _cache.delete(key); return null; }
  return entry.data;
}
function cacheSet(key: string, data: any) { _cache.set(key, {data, ts: Date.now()}); }

const SkeletonBlock = React.memo(({width: w, height: h, borderRadius: br = 6, style: s}: {width?: number | string; height: number; borderRadius?: number; style?: any}) => {
  const shimmer = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(shimmer, {toValue: 1, duration: 900, useNativeDriver: true}),
      Animated.timing(shimmer, {toValue: 0, duration: 900, useNativeDriver: true}),
    ]));
    loop.start();
    return () => loop.stop();
  }, [shimmer]);
  const opacity = shimmer.interpolate({inputRange: [0, 1], outputRange: [0.06, 0.14]});
  return <Animated.View style={[{height: h, borderRadius: br, backgroundColor: '#FFFFFF', opacity}, w !== undefined ? {width: w as any} : {flex: 1}, s]} />;
});

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
  const {alert: showAlert, showConfirm, showToast} = useToast();
  const {isPro} = useIAP();
  const {isFavorite, toggle: toggleFavorite} = useFavorites();

  // Tracks whether this screen is still mounted. Every fire-and-forget
  // .then(setX) chain consults this before calling setState — without it,
  // a slow API response that lands after the user has navigated away
  // attempts to update unmounted state, which Hermes (release/TestFlight
  // builds) can promote from a warning to a hard crash.
  const mountedRef = React.useRef(true);
  const hasFetchedRef = React.useRef(false);
  const pagerRef = React.useRef<ScrollView>(null);
  const livePulse = React.useRef(new Animated.Value(1)).current;
  React.useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(livePulse, {toValue: 0.35, duration: 700, useNativeDriver: true}),
      Animated.timing(livePulse, {toValue: 1, duration: 700, useNativeDriver: true}),
    ]));
    loop.start();
    return () => loop.stop();
  }, [livePulse]);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const safeSet = React.useCallback(<T,>(setter: React.Dispatch<React.SetStateAction<T>>) => {
    return (value: React.SetStateAction<T>) => {
      if (mountedRef.current) setter(value);
    };
  }, []);

  const [bot, setBot] = useState<Bot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userBotState, setUserBotState] = useState<UserBotState>({status: 'none'});
  const [actionLoading, setActionLoading] = useState(false);
  const [shadowModalVisible, setShadowModalVisible] = useState(false);
  const [selectedDurationIdx, setSelectedDurationIdx] = useState<number | null>(null);
  const [customDays, setCustomDays] = useState('');
  const [virtualBalance, setVirtualBalance] = useState('10000');

  const [activeStatsTab, setActiveStatsTab] = useState<'live' | 'my'>('live');
  const [, startTabTransition] = useTransition();
  const [publicLiveStats, setPublicLiveStats] = useState<any>(null);
  const [shadowSessionStats, setShadowSessionStats] = useState<any>(null);
  const [myLiveStats, setMyLiveStats] = useState<any>(null);
  const [liveStatsLoading, setLiveStatsLoading] = useState(false);
  const [myStatsLoading, setMyStatsLoading] = useState(false);

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
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [settingsModalTab, setSettingsModalTab] = useState<'settings' | 'compounding'>('settings');
  const [shadowUserConfig, setShadowUserConfig] = useState<{
    notificationLevel: string;
    autoStopDays: string;
    autoStopLossPercent: string;
    autoStopBalance: string;
  }>({notificationLevel: 'all', autoStopDays: '', autoStopLossPercent: '', autoStopBalance: ''});
  const [strategyExpanded, setStrategyExpanded] = useState(false);

  // Compounding settings (per subscription)
  const [compounding, setCompounding] = useState<CompoundingSettings | null>(null);
  const [compoundingExpanded, setCompoundingExpanded] = useState(false);
  const [savingCompounding, setSavingCompounding] = useState(false);

  // Trainer state (visible to all, creator-controls gated on isCreator)
  const [trainerStatus, setTrainerStatus] = useState<{config: TrainerConfig; performance: BotPerformanceSnapshot; isCreator?: boolean} | null>(null);
  const [trainerModalVisible, setTrainerModalVisible] = useState(false);
  const [retraining, setRetraining] = useState(false);
  const [promoting, setPromoting] = useState(false);

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
    const botId = route.params.botId;
    const isRefresh = refreshing;

    // ── Cache hit: restore instantly, skip skeleton on revisit ──────────────
    if (!isRefresh) {
      const cached = cacheGet(`bot:${botId}`);
      if (cached) {
        setBot(cached.bot);
        setPublicLiveStats(cached.publicLiveStats);
        setUserBotState(cached.userBotState);
        if (cached.shadowSessionStats) setShadowSessionStats(cached.shadowSessionStats);
        if (cached.myLiveStats) setMyLiveStats(cached.myLiveStats);
        if (cached.trainerStatus) setTrainerStatus(cached.trainerStatus);
        const pairs = cached.bot?.config?.pairs ?? ['BTC/USDT'];
        if (pairs.length > 0 && !selectedPair) {
          setSelectedPair(pairs[0]);
          setChartTF(cached.bot?.category === 'Stocks' ? DEFAULT_STOCK_TF : DEFAULT_CRYPTO_TF);
          fetchTradeMarkers(pairs[0]);
        }
        setLoading(false);
        return; // cached data shown instantly — background refresh handled by pull-to-refresh
      }
    }

    try {
      // ── Fix #1: fire ALL requests simultaneously ─────────────────────────
      const [botData, activeBots, shadowSessions, decisionsData] = await Promise.all([
        marketplaceApi.getBotDetails(botId).catch(() => null),
        botsService.getActive().then((res: any) => {
          const items = Array.isArray(res?.data) ? res.data : Array.isArray(res?.subscriptions) ? res.subscriptions : [];
          return items;
        }).catch(() => []),
        botsService.getShadowSessions().then((res: any) => {
          return Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        }).catch(() => []),
        botsService.getDecisions(botId, 100).then((res: any) => {
          return Array.isArray(res?.data) ? res.data : [];
        }).catch(() => []),
      ]);

      if (!mountedRef.current) return;

      // ── Fix #4: single setBot with equity data merged in one pass ────────
      if (botData) {
        if (decisionsData.length > 0) {
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
          if (equityPoints.length > 2) botData.equityData = equityPoints;
        }
        setBot(botData); // single render
        const pairs = botData.config?.pairs ?? ['BTC/USDT'];
        if (pairs.length > 0 && !selectedPair) {
          setSelectedPair(pairs[0]);
          setChartTF(botData.category === 'Stocks' ? DEFAULT_STOCK_TF : DEFAULT_CRYPTO_TF);
          fetchTradeMarkers(pairs[0]);
        }
      }

      // ── Resolve user state ───────────────────────────────────────────────
      const sub = activeBots.find((s: any) => s.botId === botId);
      const shadowRunning  = shadowSessions.find((s: any) => s.botId === botId && s.status === 'running');
      const shadowCompleted = shadowSessions.find((s: any) => s.botId === botId && s.status === 'completed');
      const shadowPaused   = shadowSessions.find((s: any) => s.botId === botId && s.status === 'paused');

      let resolvedState: UserBotState = {status: 'none'};
      if (sub && (sub.subscriptionStatus === 'active' || sub.status === 'active')) {
        resolvedState = {status: 'active', subscriptionId: sub.subscriptionId || sub.id, mode: sub.subscriptionMode || sub.mode};
      } else if (sub && (sub.subscriptionStatus === 'paused' || sub.status === 'paused')) {
        resolvedState = {status: 'paused', subscriptionId: sub.subscriptionId || sub.id};
      } else if ((sub && (sub.subscriptionStatus === 'shadow' || sub.status === 'shadow')) || shadowRunning || shadowCompleted || shadowPaused) {
        if (shadowRunning) {
          resolvedState = {status: 'shadow_running', subscriptionId: sub?.subscriptionId || sub?.id, shadowSessionId: shadowRunning.id};
        } else if (shadowPaused) {
          resolvedState = {status: 'shadow_paused', subscriptionId: sub?.subscriptionId || sub?.id, shadowSessionId: shadowPaused.id};
        } else if (shadowCompleted) {
          resolvedState = {status: 'shadow_completed', subscriptionId: sub?.subscriptionId || sub?.id, shadowSessionId: shadowCompleted.id};
        } else {
          resolvedState = {status: 'shadow_running', subscriptionId: sub?.subscriptionId || sub?.id};
        }
      } else if (sub && (sub.subscriptionStatus === 'stopped' || sub.status === 'stopped')) {
        resolvedState = {status: 'stopped', subscriptionId: sub.subscriptionId || sub.id};
      }
      setUserBotState(resolvedState);

      const isActiveLive = sub && (sub.subscriptionStatus === 'active' || sub.status === 'active') && (sub.subscriptionMode === 'live' || sub.mode === 'live');
      const shadowId = shadowRunning?.id ?? shadowPaused?.id ?? shadowCompleted?.id;

      // ── Fix #2: independent loading flags per section ────────────────────
      // Public live stats (Live tab — traders card + equity chart)
      setLiveStatsLoading(true);
      botsService.getPublicLiveStats(botId)
        .then((res: any) => {
          if (!mountedRef.current) return;
          const d = res?.data ?? null;
          setPublicLiveStats(d);
          const cached = cacheGet(`bot:${botId}`);
          if (cached) cacheSet(`bot:${botId}`, {...cached, publicLiveStats: d});
        })
        .catch(() => {})
        .finally(() => { if (mountedRef.current) setLiveStatsLoading(false); });

      // My stats (My tab only)
      if (isActiveLive) {
        setMyStatsLoading(true);
        botsService.getMyLiveStats(botId)
          .then((res: any) => { if (mountedRef.current) setMyLiveStats(res?.data ?? null); })
          .catch(() => {})
          .finally(() => { if (mountedRef.current) setMyStatsLoading(false); });
      }
      if (shadowId) {
        setMyStatsLoading(true);
        botsService.getShadowSessionLiveStats(shadowId)
          .then((res: any) => { if (mountedRef.current) setShadowSessionStats(res?.data ?? null); })
          .catch(() => {})
          .finally(() => { if (mountedRef.current) setMyStatsLoading(false); });
        // Load shadow session user config (including compounding stored in userConfig.compounding)
        botsService.getShadowSessionConfig(shadowId).then((res: any) => {
          if (!mountedRef.current) return;
          const cfg = res?.data?.userConfig ?? {};
          setShadowUserConfig({
            notificationLevel: cfg.notificationLevel ?? 'all',
            autoStopDays: cfg.autoStopDays !== undefined ? String(cfg.autoStopDays) : '',
            autoStopLossPercent: cfg.autoStopLossPercent !== undefined ? String(cfg.autoStopLossPercent) : '',
            autoStopBalance: cfg.autoStopBalance !== undefined ? String(cfg.autoStopBalance) : '',
          });
          // Load shadow compounding from userConfig.compounding
          if (cfg.compounding) {
            setCompounding({
              enabled: cfg.compounding.enabled ?? false,
              reinvestmentRate: cfg.compounding.reinvestmentRate ?? 50,
              reinvestmentMode: cfg.compounding.reinvestmentMode ?? 'free_balance',
              compoundFrequency: cfg.compounding.compoundFrequency ?? 'each_trade',
              maxPositionSizeUSD: cfg.compounding.maxPositionSizeUSD ?? null,
              minProfitThresholdUSD: cfg.compounding.minProfitThresholdUSD ?? 0,
              maxCompoundMultiplier: cfg.compounding.maxCompoundMultiplier ?? 3,
              withdrawalReservePct: cfg.compounding.withdrawalReservePct ?? 0,
              riskReductionEnabled: cfg.compounding.riskReductionEnabled ?? false,
              riskReductionRate: cfg.compounding.riskReductionRate ?? 0,
              totalCompounded: cfg.compounding.totalCompounded ?? 0,
              lastCompoundAt: cfg.compounding.lastCompoundAt ?? null,
            });
          } else {
            // Default compounding state for shadow sessions
            setCompounding({
              enabled: false,
              reinvestmentRate: 50,
              reinvestmentMode: 'free_balance',
              compoundFrequency: 'each_trade',
              maxPositionSizeUSD: null,
              minProfitThresholdUSD: 0,
              maxCompoundMultiplier: 3,
              withdrawalReservePct: 0,
              riskReductionEnabled: false,
              riskReductionRate: 0,
              totalCompounded: 0,
              lastCompoundAt: null,
            });
          }
        }).catch(() => {});
      }

      // Subscriber config + compounding (fire-and-forget, no spinner needed)
      if (sub) {
        const subId = sub.subscriptionId || sub.id;
        botsService.getSubscription(subId).then((res: any) => {
          if (!mountedRef.current) return;
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
          botsService.getCompounding(subId).then((cr: any) => {
            if (!mountedRef.current) return;
            if (cr?.data?.compounding) setCompounding(cr.data.compounding);
          }).catch(() => {});
        }).catch(() => {});
      }

      // For users with no subscription and no shadow session, set a default compounding state
      if (!sub && !shadowId) {
        setCompounding({
          enabled: false,
          reinvestmentRate: 50,
          reinvestmentMode: 'free_balance',
          compoundFrequency: 'each_trade',
          maxPositionSizeUSD: null,
          minProfitThresholdUSD: 0,
          maxCompoundMultiplier: 3,
          withdrawalReservePct: 0,
          riskReductionEnabled: false,
          riskReductionRate: 0,
          totalCompounded: 0,
          lastCompoundAt: null,
        });
      }

      // Trainer (fire-and-forget)
      botsService.getTrainerStatus(botId).then((tr: any) => {
        if (!mountedRef.current) return;
        if (tr?.data) setTrainerStatus(tr.data);
      }).catch(() => {});

      // ── Fix #3: write cache after primary data is ready ──────────────────
      // Store what we have now; secondary calls (.then) update state directly
      cacheSet(`bot:${botId}`, {
        bot: botData,
        publicLiveStats: null, // updated by the .then above
        userBotState: resolvedState,
        shadowSessionStats: null,
        myLiveStats: null,
        trainerStatus: null,
      });

    } catch {
      // silently ignore — skeleton stays until setLoading(false)
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
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
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchData();
    }
    return () => {};
  }, [fetchData]));

  // Auto-open shadow modal when navigated with openShadow=true (e.g. from Marketplace)
  const openShadowTriggered = React.useRef(false);
  React.useEffect(() => {
    if (route.params.openShadow && bot && !loading && !openShadowTriggered.current) {
      openShadowTriggered.current = true;
      // Small delay so the screen is fully rendered before the modal opens.
      // The handle is cleared on unmount so a fast back-nav doesn't trigger
      // handleStartShadow on an unmounted screen.
      const t = setTimeout(() => {
        if (mountedRef.current) handleStartShadow();
      }, 300);
      return () => clearTimeout(t);
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
    setShadowModalVisible(true);
  }, [bot, userBotState.status]);

  const handleConfirmShadow = useCallback(() => {
    if (!bot) return;
    if (selectedDurationIdx === null) {
      showAlert('Select Duration', 'Please select how long to run shadow mode.');
      return;
    }
    const balance = parseFloat(virtualBalance) || 10000;
    if (balance <= 0) {
      showAlert('Invalid Balance', 'Virtual balance must be greater than $0.');
      return;
    }

    let apiConfig: {virtualBalance: number; durationDays?: number; durationMinutes?: number};

    if (selectedDurationIdx === -1) {
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
    const startConfig: typeof apiConfig & {compounding?: CompoundingSettings} = apiConfig;
    if (compounding && compounding.enabled) {
      startConfig.compounding = compounding;
    }
    botsService
      .startShadowMode(bot.id, startConfig)
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

  const handleSaveShadowConfig = useCallback(async () => {
    const sessionId = userBotState.shadowSessionId;
    if (!sessionId) return;
    setSavingConfig(true);
    try {
      await botsService.updateShadowSessionConfig(sessionId, {
        notificationLevel: shadowUserConfig.notificationLevel as any,
        autoStopDays: shadowUserConfig.autoStopDays ? parseInt(shadowUserConfig.autoStopDays, 10) : undefined,
        autoStopLossPercent: shadowUserConfig.autoStopLossPercent ? parseFloat(shadowUserConfig.autoStopLossPercent) : undefined,
        autoStopBalance: shadowUserConfig.autoStopBalance ? parseFloat(shadowUserConfig.autoStopBalance) : undefined,
      });
      showAlert('Settings Saved', 'Shadow session preferences updated.');
    } catch {
      showAlert('Error', 'Failed to save shadow settings.');
    } finally {
      setSavingConfig(false);
    }
  }, [userBotState.shadowSessionId, shadowUserConfig]);

  // ─── Render ──────────────────────────────────────────────────────────────

  const statCells = React.useMemo(() => {
    if (!bot) return [];
    return [
      {label: '30D RETURN', value: `${bot.returnPercent >= 0 ? '+' : ''}${bot.returnPercent.toFixed(1)}%`, color: bot.returnPercent >= 0 ? '#10B981' : '#EF4444'},
      {label: 'WIN RATE', value: `${bot.winRate}%`, color: '#0D7FF2'},
      {label: 'MAX DRAWDOWN', value: `${bot.maxDrawdown.toFixed(1)}%`, color: '#EF4444'},
      {label: 'SHARPE RATIO', value: `${bot.sharpeRatio.toFixed(2)}`, color: '#10B981'},
    ];
  }, [bot?.returnPercent, bot?.winRate, bot?.maxDrawdown, bot?.sharpeRatio]);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, {justifyContent: 'space-between'}]}>
          <SkeletonBlock width={36} height={36} borderRadius={10} />
          <SkeletonBlock width={80} height={16} />
          <SkeletonBlock width={36} height={36} borderRadius={10} />
        </View>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={{flexDirection: 'row', gap: 12, marginBottom: 16}}>
            <SkeletonBlock width={52} height={52} borderRadius={14} />
            <View style={{flex: 1, gap: 8}}>
              <SkeletonBlock width={80} height={10} />
              <SkeletonBlock width={160} height={16} />
              <View style={{flexDirection: 'row', gap: 6}}>
                <SkeletonBlock width={60} height={22} borderRadius={5} />
                <SkeletonBlock width={50} height={22} borderRadius={5} />
                <SkeletonBlock width={55} height={22} borderRadius={5} />
              </View>
            </View>
          </View>
          <View style={{flexDirection: 'row', gap: 6, marginBottom: 14}}>
            <SkeletonBlock height={62} borderRadius={12} />
            <SkeletonBlock height={62} borderRadius={12} />
            <SkeletonBlock height={62} borderRadius={12} />
            <SkeletonBlock height={62} borderRadius={12} />
          </View>
          <SkeletonBlock height={160} borderRadius={14} style={{marginBottom: 12}} />
          <SkeletonBlock height={260} borderRadius={14} style={{marginBottom: 12}} />
          <SkeletonBlock height={140} borderRadius={14} style={{marginBottom: 12}} />
        </ScrollView>
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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <ChevronLeftIcon size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{flex: 1}} />
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
          {/* AI Trainer header icon */}
          {trainerStatus && (() => {
            const tCfg = trainerStatus.config as any;
            const tPerf = trainerStatus.performance;
            const hasPending = !!(tCfg.pendingPrompt);
            const score = tPerf?.trainerScore ?? 0;
            const scoreColor = score >= 70 ? '#10B981' : score >= 50 ? '#F59E0B' : '#EF4444';
            const trainerMode = tCfg.trainingMode ?? (tCfg.autoRetrain ? 'suggestions' : 'off');
            // Creator always sees the icon (even when off — they need to be able to turn it on)
            // Subscriber only sees it when trainer is active (not off)
            if (!isCreator && trainerMode === 'off') return null;
            if (isCreator) {
              return (
                <TouchableOpacity
                  style={[styles.iconBtn, {
                    backgroundColor: hasPending ? 'rgba(139,92,246,0.2)' : 'rgba(139,92,246,0.1)',
                    borderWidth: 1,
                    borderColor: hasPending ? 'rgba(139,92,246,0.6)' : 'rgba(139,92,246,0.25)',
                    width: 44, height: 40,
                  }]}
                  activeOpacity={0.7}
                  onPress={() => setTrainerModalVisible(true)}>
                  {hasPending && (
                    <View style={{position: 'absolute', top: 6, right: 7, width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#8B5CF6', borderWidth: 1.5, borderColor: '#0D1117'}} />
                  )}
                  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                    <Path d="M12 2a2 2 0 012 2c0 .74-.4 1.38-1 1.73V7h1a7 7 0 017 7H3a7 7 0 017-7h1V5.73A2 2 0 0112 2zM3 21v-2a4 4 0 014-4h10a4 4 0 014 4v2" stroke="#8B5CF6" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
                  </Svg>
                </TouchableOpacity>
              );
            } else {
              return (
                <TouchableOpacity
                  style={[styles.iconBtn, {
                    backgroundColor: `${scoreColor}18`,
                    borderWidth: 1,
                    borderColor: `${scoreColor}35`,
                    width: 44, height: 40,
                  }]}
                  activeOpacity={0.7}
                  onPress={() => setTrainerModalVisible(true)}>
                  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                    <Path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke={scoreColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
                  </Svg>
                </TouchableOpacity>
              );
            }
          })()}
          {/* Pulsing live feed icon — replaces the banner */}
          {isRunning && (() => {
            const liveColor = userBotState.status === 'active' ? '#10B981' : '#3B82F6';
            const liveBg = userBotState.status === 'active' ? 'rgba(16,185,129,0.12)' : 'rgba(59,130,246,0.12)';
            const liveBorder = userBotState.status === 'active' ? 'rgba(16,185,129,0.3)' : 'rgba(59,130,246,0.3)';
            return (
              <TouchableOpacity
                style={[styles.iconBtn, {backgroundColor: liveBg, borderWidth: 1, borderColor: liveBorder, width: 44, height: 40}]}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('BotLiveFeed', {botId: bot.id, botName: bot.name, mode: feedMode})}>
                <Animated.View style={{opacity: livePulse, width: 8, height: 8, borderRadius: 4, backgroundColor: liveColor, position: 'absolute', top: 8, right: 9}} />
                <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                  <Path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke={liveColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </TouchableOpacity>
            );
          })()}
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => { setSettingsModalTab('settings'); setSettingsModalVisible(true); }}
            accessibilityRole="button"
            accessibilityLabel="Bot Settings">
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
              <Path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="rgba(255,255,255,0.75)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
              <Path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="rgba(255,255,255,0.75)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => bot && toggleFavorite(bot.id, bot).catch(() => {})}
            accessibilityRole="button"
            accessibilityLabel={bot && isFavorite(bot.id) ? 'Remove from favorites' : 'Add to favorites'}>
            <HeartIcon
              size={22}
              filled={!!bot && isFavorite(bot.id)}
              color={bot && isFavorite(bot.id) ? '#EF4444' : 'rgba(255,255,255,0.7)'}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Hero — always visible above tabs ── */}
      <View style={styles.heroCard}>
        <View style={styles.heroRow}>
          <View style={[styles.heroAvatarRing, {borderColor: bot.avatarColor ? `${bot.avatarColor}55` : 'rgba(255,255,255,0.1)'}]}>
            <BotAvatar
              size={46}
              avatarUrl={bot.avatarUrl}
              avatarColor={bot.avatarColor}
              avatarLetter={bot.avatarLetter}
              borderRadius={12}
            />
          </View>
          <View style={styles.heroMeta}>
            <View style={styles.heroCreatorRow}>
              <View style={styles.heroCreatorDot} />
              <Text style={styles.botCreator} numberOfLines={1}>
                {isCreator ? 'Created by you' : (bot.creatorName || bot.subtitle || 'Creator')}
              </Text>
            </View>
            <View style={{flexDirection: 'row',  alignItems: 'center', gap: 6, marginTop: 1}}>
              <Text style={styles.botName}>{bot.name}</Text>
              {/* {isCreator && <Badge label="YOURS" variant="purple" size="sm" />} */}
            </View>
            <Text style={[styles.activeUsers, {marginTop: 4}]}>{bot.activeUsers.toLocaleString()} traders active</Text>
          </View>
        </View>
        {!isRunning && (userBotState.status === 'shadow_paused' || userBotState.status === 'shadow_completed' || userBotState.status === 'paused') && (
          <View style={[styles.badgesRow, {marginTop: 10}]}>
            {userBotState.status === 'shadow_paused' && <Badge label="SHADOW PAUSED" variant="orange" size="sm" />}
            {userBotState.status === 'shadow_completed' && <Badge label="SHADOW COMPLETE" variant="green" size="sm" />}
            {userBotState.status === 'paused' && <Badge label="PAUSED" variant="orange" size="sm" />}
          </View>
        )}
      </View>

      {/* ── Tab bar ── */}
      {hasPersonalTab && (() => {
        const myColor = isLiveActive ? '#10B981' : '#3B82F6';
        return (
          <View style={styles.tabBarWrap}>
            <Pressable
              unstable_pressDelay={0}
              style={styles.tabBarTab}
              onPress={() => {
                setActiveStatsTab('live');
                pagerRef.current?.scrollTo({x: 0, animated: false});
              }}>
              <Text style={[styles.tabBarBtnText, {color: activeStatsTab === 'live' ? '#FFFFFF' : 'rgba(255,255,255,0.3)'}]}>Public</Text>
              {activeStatsTab === 'live' && <View style={[styles.tabBarUnderline, {backgroundColor: '#10B981'}]} />}
            </Pressable>
            <Pressable
              unstable_pressDelay={0}
              style={styles.tabBarTab}
              onPress={() => {
                setActiveStatsTab('my');
                pagerRef.current?.scrollTo({x: width, animated: false});
              }}>
              <Text style={[styles.tabBarBtnText, {color: activeStatsTab === 'my' ? '#FFFFFF' : 'rgba(255,255,255,0.3)'}]}>
                {isLiveActive ? 'My Live' : 'My Shadow'}
              </Text>
              {activeStatsTab === 'my' && <View style={[styles.tabBarUnderline, {backgroundColor: myColor}]} />}
            </Pressable>
          </View>
        );
      })()}

      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        style={{flex: 1}}
        nestedScrollEnabled={false}
      >
        {/* ══ PAGE 0 — Public Live ══ */}
        <ScrollView
          style={{width}}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          scrollEnabled={!chartTouching}
          removeClippedSubviews={true}
          keyboardShouldPersistTaps="handled"
          overScrollMode="never"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchData(); }}
              tintColor="#10B981"
              colors={['#10B981']}
              progressBackgroundColor="#161B22"
            />
          }
        >
        {/* ══ PUBLIC LIVE TAB — complete screen ══ */}
        <View>
            {/* Stats single-row grid — individual cards */}
            <View style={styles.statsGrid}>
              {statCells.map((cell) => (
                <View key={cell.label} style={styles.statCell}>
                  <Text style={styles.statCellLabel}>{cell.label}</Text>
                  <Text style={[styles.statCellValue, {color: cell.color}]}>{cell.value}</Text>
                </View>
              ))}
            </View>

            {/* Live community stats */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>LIVE TRADERS STATS</Text>
              {liveStatsLoading ? (
                <View style={{gap: 1, backgroundColor: '#161B22', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 16}}>
                  {[0,1,2,3,4].map(i => <View key={i} style={{flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: i < 4 ? 1 : 0, borderBottomColor: 'rgba(255,255,255,0.04)'}}><SkeletonBlock width={100} height={12} /><SkeletonBlock width={50} height={12} /></View>)}
                </View>
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
              {liveStatsLoading ? (
                <SkeletonBlock height={200} borderRadius={14} />
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
            {(publicLiveStats?.recentTrades?.length ?? 0) > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>RECENT LIVE TRADES (ALL USERS)</Text>
                <ScrollView style={{maxHeight: 360}} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                  {(publicLiveStats?.recentTrades ?? []).map((t: any) => (
                    <View key={t.id} style={[styles.shadowTradeRow, {flexDirection: 'column', gap: 6, paddingVertical: 10}]}>
                      <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                        <Text style={styles.shadowTradePair}>{t.symbol}</Text>
                        <Text style={[styles.shadowTradePnl, {color: (t.pnl ?? 0) >= 0 ? '#10B981' : '#EF4444'}]}>{(t.pnl ?? 0) >= 0 ? '+' : ''}${(t.pnl ?? 0).toFixed(2)} <Text style={{fontSize: 11}}>{(t.pnlPercent ?? 0) >= 0 ? '+' : ''}{(t.pnlPercent ?? 0).toFixed(2)}%</Text></Text>
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
                  <Text style={[styles.metricValue, {color: '#3B82F6', flexShrink: 1, flexWrap: 'wrap'}]}>{bot.strategy || 'N/A'}</Text>
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
                {bot.config?.aiMode && <View style={styles.metricRow}><Text style={styles.metricLabel}>AI Mode</Text><Text style={[styles.metricValue, {color: '#10B981'}]}>{bot.config.aiMode === 'rules_only' ? 'Rules Only' : bot.config.aiMode === 'full_ai' ? 'Full AI' : 'Hybrid'}</Text></View>}
                {bot.config?.maxOpenPositions !== undefined && <View style={styles.metricRow}><Text style={styles.metricLabel}>Max Open Positions</Text><Text style={styles.metricValue}>{bot.config.maxOpenPositions}</Text></View>}
                {bot.config?.tradingSchedule && (
                  <View style={[styles.metricRow, {borderBottomWidth: 0}]}><Text style={styles.metricLabel}>Trading Schedule</Text>
                    <Text style={styles.metricValue}>{bot.config.tradingSchedule === '24_7' ? '24/7' : bot.config.tradingSchedule === 'us_hours' ? 'US Market Hours' : 'Custom'}</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Compounding settings moved to settings modal gear icon */}
            {/* AI Trainer accessible via header brain/pulse icon */}
            {false && (() => {
              // dead — kept only so JSX nesting stays valid; never rendered
              const effectiveMode: 'auto' | 'suggestions' | 'off' = 'off' as const;
              const tCfg: Record<string, any> = {}; const tPerf: Record<string, any> = {}; const tIsCreator = false; const trainerExpanded = false; const setTrainerExpanded = (_v: boolean | ((prev: boolean) => boolean)) => {};

              const modeOptions: {key: 'auto' | 'suggestions' | 'off'; label: string; sub: string; accent: string; bg: string}[] = [
                {
                  key: 'auto',
                  label: 'Auto',
                  sub: 'Trains & applies improvements automatically',
                  accent: '#10B981',
                  bg: 'rgba(16,185,129,0.12)',
                },
                {
                  key: 'suggestions',
                  label: 'Suggestions',
                  sub: 'Trains automatically, you confirm before applying',
                  accent: '#8B5CF6',
                  bg: 'rgba(139,92,246,0.12)',
                },
                {
                  key: 'off',
                  label: 'Off',
                  sub: 'Trainer disabled — manual only',
                  accent: 'rgba(255,255,255,0.3)',
                  bg: 'rgba(255,255,255,0.04)',
                },
              ];

              const activeModeOpt = modeOptions.find(m => m.key === effectiveMode) ?? modeOptions[2];

              const statusBadgeColor =
                tCfg.trainerStatus === 'retraining' ? '#F59E0B' :
                tCfg.trainerStatus === 'shadow_validating' ? '#3B82F6' :
                effectiveMode === 'off' ? 'rgba(255,255,255,0.3)' :
                tPerf.trainerScore >= 70 ? '#10B981' : tPerf.trainerScore >= 50 ? '#F59E0B' : '#EF4444';

              const statusBadgeBg =
                tCfg.trainerStatus === 'retraining' ? 'rgba(245,158,11,0.2)' :
                tCfg.trainerStatus === 'shadow_validating' ? 'rgba(59,130,246,0.2)' :
                effectiveMode === 'off' ? 'rgba(255,255,255,0.06)' :
                tPerf.trainerScore >= 70 ? 'rgba(16,185,129,0.2)' : tPerf.trainerScore >= 50 ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)';

              const statusBadgeLabel =
                tCfg.trainerStatus === 'retraining' ? 'TRAINING' :
                tCfg.trainerStatus === 'shadow_validating' ? 'VALIDATING' :
                effectiveMode === 'off' ? 'OFF' :
                `${tPerf.trainerScore ?? '—'}/100`;

              return (
                <View style={[styles.section, {marginTop: 8}]}>
                  {/* Header row */}
                  <TouchableOpacity
                    style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: trainerExpanded ? 16 : 0}}
                    activeOpacity={0.7}
                    onPress={() => setTrainerExpanded(v => !v)}
                  >
                    <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
                      <View style={{width: 30, height: 30, borderRadius: 9, backgroundColor: activeModeOpt.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${activeModeOpt.accent}40`}}>
                        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                          <Path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" stroke={activeModeOpt.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
                        </Svg>
                      </View>
                      <View>
                        <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                          <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#FFFFFF'}}>AI Trainer</Text>
                          <View style={{paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: statusBadgeBg}}>
                            <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 10, color: statusBadgeColor}}>{statusBadgeLabel}</Text>
                          </View>
                          {effectiveMode !== 'off' && (
                            <View style={{paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: activeModeOpt.bg}}>
                              <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 9, color: activeModeOpt.accent}}>{activeModeOpt.label.toUpperCase()}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1}}>
                          {tPerf.totalTrades} trades · WR {tPerf.winRate.toFixed(0)}% · PF {tPerf.profitFactor.toFixed(2)}
                        </Text>
                      </View>
                    </View>
                    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                      <Path d={trainerExpanded ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'} stroke="rgba(255,255,255,0.4)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </Svg>
                  </TouchableOpacity>

                  {trainerExpanded && (
                    <View style={{gap: 14}}>

                      {/* ── Training Mode Selector (creator only) ── */}
                      {tIsCreator && (
                        <View style={{gap: 8}}>
                          <Text style={[styles.metricLabel, {marginBottom: 2}]}>TRAINING MODE</Text>
                          {modeOptions.map(opt => {
                            const active = effectiveMode === opt.key;
                            return (
                              <TouchableOpacity
                                key={opt.key}
                                activeOpacity={0.7}
                                style={{
                                  flexDirection: 'row', alignItems: 'center', padding: 12,
                                  borderRadius: 12, gap: 12,
                                  backgroundColor: active ? opt.bg : '#1C2333',
                                  borderWidth: 1.5,
                                  borderColor: active ? opt.accent : 'rgba(255,255,255,0.07)',
                                }}
                                onPress={async () => {
                                  if (active) return;
                                  try {
                                    const res: any = await botsService.updateTrainerConfig(bot?.id ?? '', { trainingMode: opt.key });
                                    const newCfg = res?.data?.config;
                                    if (newCfg) setTrainerStatus(s => s ? {...s, config: {...s.config, ...newCfg}} : s);
                                    showToast('success', `Trainer set to ${opt.label}`);
                                  } catch { showToast('error', 'Failed to update trainer mode'); }
                                }}
                              >
                                {/* Radio dot */}
                                <View style={{width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: active ? opt.accent : 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center'}}>
                                  {active && <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: opt.accent}} />}
                                </View>
                                <View style={{flex: 1}}>
                                  <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 13, color: active ? opt.accent : '#FFFFFF'}}>{opt.label}</Text>
                                  <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2}}>{opt.sub}</Text>
                                </View>
                                {active && opt.key !== 'off' && (
                                  <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: opt.accent}} />
                                )}
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}

                      {/* Divider before metrics */}
                      {tIsCreator && effectiveMode !== 'off' && (
                        <View style={{height: 1, backgroundColor: 'rgba(255,255,255,0.06)'}} />
                      )}

                      {/* Performance meters */}
                      {effectiveMode !== 'off' && (
                        <View style={{flexDirection: 'row', gap: 8}}>
                          {[
                            {label: 'WIN RATE', value: `${tPerf.winRate.toFixed(0)}%`,         color: tPerf.winRate >= 55 ? '#10B981' : tPerf.winRate >= 45 ? '#F59E0B' : '#EF4444'},
                            {label: 'PROFIT FACTOR', value: tPerf.profitFactor.toFixed(2),     color: tPerf.profitFactor >= 1.5 ? '#10B981' : tPerf.profitFactor >= 1.0 ? '#F59E0B' : '#EF4444'},
                            {label: 'DRAWDOWN', value: `${tPerf.maxDrawdown.toFixed(1)}%`,     color: tPerf.maxDrawdown <= 10 ? '#10B981' : tPerf.maxDrawdown <= 25 ? '#F59E0B' : '#EF4444'},
                          ].map(m => (
                            <View key={m.label} style={{flex: 1, backgroundColor: '#1C2333', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', alignItems: 'center'}}>
                              <Text style={{fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4}}>{m.label}</Text>
                              <Text style={{fontFamily: 'Inter-Bold', fontSize: 16, color: m.color}}>{m.value}</Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {/* Pending improvement banner — SUGGESTIONS mode only, creator only */}
                      {tCfg.pendingPrompt && tIsCreator && (
                        <View style={{backgroundColor: 'rgba(139,92,246,0.1)', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)', gap: 12}}>
                          <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                              <Path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#8B5CF6" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
                            </Svg>
                            <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 12, color: '#8B5CF6'}}>Trainer suggestion ready — review &amp; confirm</Text>
                          </View>
                          {/* Improved prompt preview */}
                          <View style={{backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 10}}>
                            <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4}}>SUGGESTED STRATEGY</Text>
                            <Text style={{fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 18}}>
                              {tCfg.pendingPrompt.slice(0, 160)}{tCfg.pendingPrompt.length > 160 ? '...' : ''}
                            </Text>
                          </View>
                          {/* Confirm + Dismiss row */}
                          <View style={{flexDirection: 'row', gap: 10}}>
                            <TouchableOpacity
                              style={{flex: 1, backgroundColor: '#8B5CF6', borderRadius: 10, paddingVertical: 11, alignItems: 'center', opacity: promoting ? 0.6 : 1}}
                              activeOpacity={0.8}
                              disabled={promoting}
                              onPress={async () => {
                                setPromoting(true);
                                try {
                                  await botsService.promoteTrainerChanges(bot?.id ?? '');
                                  showToast('success', 'Strategy improvement applied!');
                                  const tr: any = await botsService.getTrainerStatus(bot?.id ?? '');
                                  if (tr?.data) setTrainerStatus(tr.data);
                                } catch { showToast('error', 'Failed to apply changes'); }
                                finally { setPromoting(false); }
                              }}
                            >
                              {promoting
                                ? <ActivityIndicator size="small" color="#FFF" />
                                : <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#FFFFFF'}}>Confirm &amp; Apply</Text>
                              }
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={{paddingHorizontal: 16, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center'}}
                              activeOpacity={0.7}
                              onPress={async () => {
                                // Dismiss pending — clear pendingPrompt/Config without promoting
                                try {
                                  await botsService.updateTrainerConfig(bot?.id ?? '', {pendingPrompt: null, pendingConfig: null} as any);
                                  setTrainerStatus(s => s ? {...s, config: {...s.config, pendingPrompt: null, pendingConfig: null}} : s);
                                  showToast('info', 'Suggestion dismissed');
                                } catch {}
                              }}
                            >
                              <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 13, color: 'rgba(255,255,255,0.4)'}}>Dismiss</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}

                      {/* Recent insights log */}
                      {tCfg.insights?.length > 0 && effectiveMode !== 'off' && (
                        <View style={{gap: 0}}>
                          <Text style={[styles.metricLabel, {marginBottom: 8}]}>TRAINER LOG</Text>
                          {tCfg.insights.slice(0, 4).map((ins: any, i: number) => (
                            <View
                              key={i}
                              style={{flexDirection: 'row', gap: 10, paddingVertical: 10,
                                borderBottomWidth: i < Math.min(tCfg.insights.length, 4) - 1 ? 1 : 0,
                                borderBottomColor: 'rgba(255,255,255,0.05)'}}
                            >
                              <View style={{
                                width: 6, height: 6, borderRadius: 3, marginTop: 6,
                                backgroundColor:
                                  ins.type === 'retrain' ? '#EF4444' :
                                  ins.type === 'improvement' ? '#10B981' :
                                  ins.type === 'warning' ? '#F59E0B' : 'rgba(255,255,255,0.25)',
                              }} />
                              <View style={{flex: 1}}>
                                <Text style={{fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 18}}>{ins.message}</Text>
                                <Text style={{fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 3}}>{(() => { const d = new Date(ins.ts); const pad = (n: number) => String(n).padStart(2,'0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; })()}</Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      )}

                      {/* Manual retrain — creator only, any mode except off */}
                      {tIsCreator && effectiveMode !== 'off' && (
                        <TouchableOpacity
                          style={{
                            backgroundColor: 'rgba(139,92,246,0.1)', borderRadius: 14,
                            paddingVertical: 13, alignItems: 'center',
                            borderWidth: 1, borderColor: 'rgba(139,92,246,0.25)',
                            opacity: (retraining || tCfg.trainerStatus === 'retraining') ? 0.5 : 1,
                          }}
                          activeOpacity={0.8}
                          disabled={retraining || tCfg.trainerStatus === 'retraining'}
                          onPress={async () => {
                            setRetraining(true);
                            try {
                              const res: any = await botsService.triggerRetrain(bot?.id ?? '');
                              showToast('success', res?.data?.message ?? 'Trainer running…');
                              const tr: any = await botsService.getTrainerStatus(bot?.id ?? '');
                              if (tr?.data) setTrainerStatus(tr.data);
                            } catch { showToast('error', 'Retrain failed — AI credits needed'); }
                            finally { setRetraining(false); }
                          }}
                        >
                          {retraining
                            ? <ActivityIndicator size="small" color="#8B5CF6" />
                            : <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#8B5CF6'}}>
                                Run AI Trainer Now
                              </Text>
                          }
                        </TouchableOpacity>
                      )}

                      {/* Off state message */}
                      {effectiveMode === 'off' && !tIsCreator && (
                        <Text style={{fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center', paddingVertical: 8}}>
                          AI Trainer is disabled for this bot.
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              );
            })()}

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

            {/* Creator — removed, name already shown in hero */}
            {false ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>CREATOR</Text>
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
        <View style={{height: 120}} />
        </ScrollView>
        {/* ══ PAGE 1 — My Live / Shadow (only mounted when user has personal tab) ══ */}
        {hasPersonalTab && (
        <ScrollView
          style={{width}}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          removeClippedSubviews={true}
          keyboardShouldPersistTaps="handled"
          overScrollMode="never"
        >
            {myStatsLoading && !myTabStats ? (
              <View style={{gap: 12}}>
                <View style={{flexDirection: 'row', gap: 6}}>
                  <SkeletonBlock height={62} borderRadius={12} />
                  <SkeletonBlock height={62} borderRadius={12} />
                  <SkeletonBlock height={62} borderRadius={12} />
                  <SkeletonBlock height={62} borderRadius={12} />
                </View>
                <SkeletonBlock height={80} borderRadius={14} />
                <SkeletonBlock height={260} borderRadius={14} />
                <SkeletonBlock height={120} borderRadius={14} />
              </View>
            ) : myTabStats ? (
              <View>
                {/* Single-row stat grid — individual cards */}
                <View style={styles.statsGrid}>
                  {[
                    {label: 'RETURN', value: `${(myTabStats.totalReturn ?? 0) >= 0 ? '+' : ''}${(myTabStats.totalReturn ?? 0).toFixed(1)}%`, color: (myTabStats.totalReturn ?? 0) >= 0 ? '#10B981' : '#EF4444'},
                    {label: 'WIN RATE', value: `${(myTabStats.winRate ?? 0).toFixed(0)}%`, color: isLiveActive ? '#10B981' : '#3B82F6'},
                    {label: 'DRAWDOWN', value: `-${(myTabStats.maxDrawdown ?? 0).toFixed(1)}%`, color: '#EF4444'},
                    {label: 'TRADES', value: `${myTabStats.totalTrades ?? 0}`, color: '#FFFFFF'},
                  ].map((cell) => (
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
                            <Text style={[styles.shadowTradePnl, {color: (t.pnl ?? 0) >= 0 ? '#10B981' : '#EF4444'}]}>{(t.pnl ?? 0) >= 0 ? '+' : ''}${(t.pnl ?? 0).toFixed(2)} <Text style={{fontSize: 11}}>{(t.pnlPercent ?? 0) >= 0 ? '+' : ''}{(t.pnlPercent ?? 0).toFixed(2)}%</Text></Text>
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
        <View style={{height: 120}} />
        </ScrollView>
        )}
      </ScrollView>

      {/* ─── AI Trainer Modal (header icon) ──────────────────────────── */}
      {trainerStatus && (
        <Modal
          visible={trainerModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setTrainerModalVisible(false)}>
          <View style={modalStyles.overlay}>
            <TouchableOpacity style={{flex: 1}} activeOpacity={1} onPress={() => setTrainerModalVisible(false)} />
            <View style={[modalStyles.sheet, {maxHeight: '92%', minHeight: '78%', paddingHorizontal: 20}]}>
              {/* Handle */}
              <View style={{width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 16}} />

              {/* Header */}
              <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20}}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
                  {(() => {
                    const tCfg2 = trainerStatus.config as any;
                    const tPerf2 = trainerStatus.performance;
                    const score2 = tPerf2?.trainerScore ?? 0;
                    const scoreColor2 = score2 >= 70 ? '#10B981' : score2 >= 50 ? '#F59E0B' : '#EF4444';
                    const iconColor = isCreator ? '#8B5CF6' : scoreColor2;
                    const iconBg = isCreator ? 'rgba(139,92,246,0.15)' : `${scoreColor2}18`;
                    return (
                      <View style={{width: 36, height: 36, borderRadius: 11, backgroundColor: iconBg, alignItems: 'center', justifyContent: 'center'}}>
                        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                          {isCreator
                            ? <Path d="M9.5 2a2.5 2.5 0 01.5 5v1h4V7a2.5 2.5 0 11.5-5M9.5 2A2.5 2.5 0 007 4.5c0 .94.52 1.76 1.28 2.19M9.5 2h5m0 0A2.5 2.5 0 0117 4.5c0 .94-.52 1.76-1.28 2.19M14 7h-4m0 0v1m4-1v1M7 12a5 5 0 005 5v2M7 12a5 5 0 010-4.36M7 12H5m12-4.36A5 5 0 0117 12m0 0h2m-2 0a5 5 0 01-5 5v2m0 0H9m3 0h3" stroke={iconColor} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
                            : <Path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke={iconColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
                          }
                        </Svg>
                      </View>
                    );
                  })()}
                  <View>
                    <Text style={{fontFamily: 'Inter-Bold', fontSize: 16, color: '#FFFFFF'}}>AI Trainer</Text>
                    <Text style={{fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 1}}>
                      {isCreator ? 'Manage training behaviour' : 'Training activity log'}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => setTrainerModalVisible(false)} style={{padding: 6}}>
                  <XIcon size={20} color="rgba(255,255,255,0.4)" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} style={{flex: 1}} contentContainerStyle={{gap: 16, paddingBottom: 32}}>
                {(() => {
                  const tCfg = trainerStatus.config as any;
                  const tPerf = trainerStatus.performance;
                  const tIsCreator = isCreator || !!trainerStatus.isCreator;
                  const effectiveMode: 'auto' | 'suggestions' | 'off' = tCfg.trainingMode ?? (tCfg.autoRetrain ? 'suggestions' : 'off');

                  const modeOptions: {key: 'auto' | 'suggestions' | 'off'; label: string; sub: string; accent: string; bg: string}[] = [
                    {key: 'auto', label: 'Auto-Train', sub: 'Applies improvements automatically when confidence ≥ 70%', accent: '#10B981', bg: 'rgba(16,185,129,0.12)'},
                    {key: 'suggestions', label: 'Suggestions', sub: 'AI suggests improvements — you review before applying', accent: '#8B5CF6', bg: 'rgba(139,92,246,0.12)'},
                    {key: 'off', label: 'Off', sub: 'No automatic training', accent: 'rgba(255,255,255,0.3)', bg: 'rgba(255,255,255,0.04)'},
                  ];
                  const activeModeOpt = modeOptions.find(m => m.key === effectiveMode) ?? modeOptions[2];

                  const score = tPerf?.trainerScore ?? 0;
                  const scoreColor = score >= 70 ? '#10B981' : score >= 50 ? '#F59E0B' : '#EF4444';

                  return (
                    <>
                      {/* Status + score row */}
                      <View style={{flexDirection: 'row', gap: 8}}>
                        <View style={{flex: 1, backgroundColor: '#1C2333', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', alignItems: 'center', gap: 4}}>
                          <Text style={{fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5}}>TRAINER SCORE</Text>
                          <Text style={{fontFamily: 'Inter-Bold', fontSize: 22, color: scoreColor}}>{tPerf?.trainerScore ?? '—'}</Text>
                          <Text style={{fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.3)'}}>/ 100</Text>
                        </View>
                        <View style={{flex: 1, backgroundColor: '#1C2333', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', alignItems: 'center', gap: 4}}>
                          <Text style={{fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5}}>MODE</Text>
                          <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 14, color: activeModeOpt.accent}}>{activeModeOpt.label}</Text>
                          <Text style={{fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.3)'}}>
                            {tCfg.trainerStatus === 'retraining' ? '⚡ Training now' : tCfg.trainerStatus === 'shadow_validating' ? '🔍 Validating' : 'Idle'}
                          </Text>
                        </View>
                        <View style={{flex: 1, backgroundColor: '#1C2333', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', alignItems: 'center', gap: 4}}>
                          <Text style={{fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5}}>WIN RATE</Text>
                          <Text style={{fontFamily: 'Inter-Bold', fontSize: 22, color: (tPerf?.winRate ?? 0) >= 55 ? '#10B981' : (tPerf?.winRate ?? 0) >= 45 ? '#F59E0B' : '#EF4444'}}>{tPerf?.winRate?.toFixed(0) ?? '—'}%</Text>
                          <Text style={{fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.3)'}}>{tPerf?.totalTrades ?? 0} trades</Text>
                        </View>
                      </View>

                      {/* Perf metrics row 2 */}
                      {effectiveMode !== 'off' && (
                        <View style={{flexDirection: 'row', gap: 8}}>
                          {[
                            {label: 'PROFIT FACTOR', value: tPerf?.profitFactor?.toFixed(2) ?? '—', color: (tPerf?.profitFactor ?? 0) >= 1.5 ? '#10B981' : (tPerf?.profitFactor ?? 0) >= 1.0 ? '#F59E0B' : '#EF4444'},
                            {label: 'MAX DRAWDOWN', value: `${tPerf?.maxDrawdown?.toFixed(1) ?? '—'}%`, color: (tPerf?.maxDrawdown ?? 0) <= 10 ? '#10B981' : (tPerf?.maxDrawdown ?? 0) <= 25 ? '#F59E0B' : '#EF4444'},
                            {label: 'AVG P&L', value: tPerf?.avgPnlPercent != null ? `${tPerf.avgPnlPercent.toFixed(2)}%` : '—', color: (tPerf?.avgPnlPercent ?? 0) >= 0 ? '#10B981' : '#EF4444'},
                          ].map(m => (
                            <View key={m.label} style={{flex: 1, backgroundColor: '#1C2333', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', alignItems: 'center'}}>
                              <Text style={{fontFamily: 'Inter-Regular', fontSize: 9, color: 'rgba(255,255,255,0.35)', marginBottom: 4, letterSpacing: 0.4}}>{m.label}</Text>
                              <Text style={{fontFamily: 'Inter-Bold', fontSize: 15, color: m.color}}>{m.value}</Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {/* Pending suggestion banner — creator only */}
                      {tCfg.pendingPrompt && tIsCreator && (
                        <View style={{backgroundColor: 'rgba(139,92,246,0.1)', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: 'rgba(139,92,246,0.35)', gap: 12}}>
                          <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                            <View style={{width: 6, height: 6, borderRadius: 3, backgroundColor: '#8B5CF6'}} />
                            <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#8B5CF6'}}>Trainer suggestion ready</Text>
                          </View>
                          <View style={{backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 12}}>
                            <Text style={{fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 5, letterSpacing: 0.5}}>SUGGESTED IMPROVEMENT</Text>
                            <Text style={{fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 18}}>
                              {tCfg.pendingPrompt.slice(0, 200)}{tCfg.pendingPrompt.length > 200 ? '...' : ''}
                            </Text>
                          </View>
                          <View style={{flexDirection: 'row', gap: 10}}>
                            <TouchableOpacity
                              style={{flex: 1, backgroundColor: '#8B5CF6', borderRadius: 12, paddingVertical: 13, alignItems: 'center', opacity: promoting ? 0.6 : 1}}
                              activeOpacity={0.8}
                              disabled={promoting}
                              onPress={async () => {
                                setPromoting(true);
                                try {
                                  await botsService.promoteTrainerChanges(bot!.id);
                                  showToast('success', 'Strategy improvement applied!');
                                  const tr: any = await botsService.getTrainerStatus(bot!.id);
                                  if (tr?.data) setTrainerStatus(tr.data);
                                } catch { showToast('error', 'Failed to apply — AI credits needed'); }
                                finally { setPromoting(false); }
                              }}>
                              {promoting
                                ? <ActivityIndicator size="small" color="#FFF" />
                                : <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF'}}>Apply Now</Text>
                              }
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={{paddingHorizontal: 18, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center'}}
                              activeOpacity={0.7}
                              onPress={async () => {
                                try {
                                  await botsService.updateTrainerConfig(bot!.id, {pendingPrompt: null, pendingConfig: null} as any);
                                  setTrainerStatus(s => s ? {...s, config: {...s.config, pendingPrompt: null, pendingConfig: null}} : s);
                                  showToast('info', 'Suggestion dismissed');
                                } catch {}
                              }}>
                              <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 14, color: 'rgba(255,255,255,0.4)'}}>Dismiss</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}

                      {/* Training mode selector — creator only */}
                      {tIsCreator && (
                        <View style={{gap: 8}}>
                          <Text style={{fontFamily: 'Inter-Medium', fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: 1, marginBottom: 2}}>TRAINING MODE</Text>
                          {modeOptions.map(opt => {
                            const active = effectiveMode === opt.key;
                            return (
                              <TouchableOpacity
                                key={opt.key}
                                activeOpacity={0.7}
                                style={{
                                  flexDirection: 'row', alignItems: 'center', padding: 14,
                                  borderRadius: 12, gap: 12,
                                  backgroundColor: active ? opt.bg : '#1C2333',
                                  borderWidth: 1.5,
                                  borderColor: active ? opt.accent : 'rgba(255,255,255,0.07)',
                                }}
                                onPress={async () => {
                                  if (active) return;
                                  try {
                                    const res: any = await botsService.updateTrainerConfig(bot!.id, {trainingMode: opt.key});
                                    const newCfg = res?.data?.config;
                                    if (newCfg) setTrainerStatus(s => s ? {...s, config: {...s.config, ...newCfg}} : s);
                                    showToast('success', `Trainer set to ${opt.label}`);
                                  } catch { showToast('error', 'Failed to update trainer mode'); }
                                }}>
                                <View style={{width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: active ? opt.accent : 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center'}}>
                                  {active && <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: opt.accent}} />}
                                </View>
                                <View style={{flex: 1}}>
                                  <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 13, color: active ? opt.accent : '#FFFFFF'}}>{opt.label}</Text>
                                  <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2}}>{opt.sub}</Text>
                                </View>
                                {active && opt.key !== 'off' && <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: opt.accent}} />}
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}

                      {/* Trainer log — visible to all */}
                      {tCfg.insights?.length > 0 && (
                        <View style={{gap: 0}}>
                          <Text style={{fontFamily: 'Inter-Medium', fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: 1, marginBottom: 10}}>TRAINING LOG</Text>
                          <View style={{backgroundColor: '#1C2333', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', overflow: 'hidden'}}>
                            {tCfg.insights.slice(0, 6).map((ins: any, i: number) => (
                              <View
                                key={i}
                                style={{flexDirection: 'row', gap: 12, paddingHorizontal: 14, paddingVertical: 12,
                                  borderBottomWidth: i < Math.min(tCfg.insights.length, 6) - 1 ? 1 : 0,
                                  borderBottomColor: 'rgba(255,255,255,0.05)'}}>
                                <View style={{
                                  width: 7, height: 7, borderRadius: 3.5, marginTop: 5,
                                  backgroundColor:
                                    ins.type === 'retrain' ? '#EF4444' :
                                    ins.type === 'improvement' ? '#10B981' :
                                    ins.type === 'warning' ? '#F59E0B' : 'rgba(255,255,255,0.25)',
                                }} />
                                <View style={{flex: 1}}>
                                  <Text style={{fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 18}}>{ins.message}</Text>
                                  <Text style={{fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 3}}>{(() => { const d = new Date(ins.ts); const pad = (n: number) => String(n).padStart(2,'0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; })()}</Text>
                                </View>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}

                      {/* No log yet */}
                      {(!tCfg.insights || tCfg.insights.length === 0) && effectiveMode !== 'off' && (
                        <View style={{backgroundColor: '#1C2333', borderRadius: 14, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', alignItems: 'center', gap: 8}}>
                          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
                            <Path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" stroke="rgba(255,255,255,0.2)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
                          </Svg>
                          <Text style={{fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.3)', textAlign: 'center'}}>
                            No training activity yet.{'\n'}The trainer runs every 5 minutes.
                          </Text>
                        </View>
                      )}

                      {/* Off state — no controls for non-creator */}
                      {effectiveMode === 'off' && !tIsCreator && (
                        <View style={{backgroundColor: '#1C2333', borderRadius: 14, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', alignItems: 'center', gap: 8}}>
                          <Text style={{fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.3)', textAlign: 'center'}}>AI Trainer is disabled for this bot.</Text>
                        </View>
                      )}

                      {/* Manual retrain — creator only */}
                      {tIsCreator && effectiveMode !== 'off' && (
                        <TouchableOpacity
                          style={{
                            backgroundColor: 'rgba(139,92,246,0.1)', borderRadius: 14,
                            paddingVertical: 15, alignItems: 'center',
                            borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)',
                            flexDirection: 'row', justifyContent: 'center', gap: 8,
                            opacity: (retraining || tCfg.trainerStatus === 'retraining') ? 0.5 : 1,
                          }}
                          activeOpacity={0.8}
                          disabled={retraining || tCfg.trainerStatus === 'retraining'}
                          onPress={async () => {
                            setRetraining(true);
                            try {
                              const res: any = await botsService.triggerRetrain(bot!.id);
                              showToast('success', res?.data?.message ?? 'Trainer running…');
                              const tr: any = await botsService.getTrainerStatus(bot!.id);
                              if (tr?.data) setTrainerStatus(tr.data);
                            } catch { showToast('error', 'Retrain failed — AI credits needed'); }
                            finally { setRetraining(false); }
                          }}>
                          {retraining
                            ? <ActivityIndicator size="small" color="#8B5CF6" />
                            : (
                              <>
                                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                                  <Path d="M9.5 2a2.5 2.5 0 01.5 5v1h4V7a2.5 2.5 0 11.5-5M9.5 2A2.5 2.5 0 007 4.5c0 .94.52 1.76 1.28 2.19M9.5 2h5m0 0A2.5 2.5 0 0117 4.5c0 .94-.52 1.76-1.28 2.19M14 7h-4m0 0v1m4-1v1M7 12a5 5 0 005 5v2M7 12a5 5 0 010-4.36M7 12H5m12-4.36A5 5 0 0117 12m0 0h2m-2 0a5 5 0 01-5 5v2m0 0H9m3 0h3" stroke="#8B5CF6" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
                                </Svg>
                                <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#8B5CF6'}}>Train Now</Text>
                              </>
                            )
                          }
                        </TouchableOpacity>
                      )}
                    </>
                  );
                })()}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* ─── Bot Settings Modal (gear icon) ──────────────────────────── */}
      <Modal
        visible={settingsModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSettingsModalVisible(false)}>
        <KeyboardAvoidingView
          style={modalStyles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[modalStyles.sheet, {maxHeight: '90%'}]}>
            <View style={modalStyles.handle} />
            <View style={modalStyles.headerRow}>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
                {(() => {
                  const iconColor = hasShadowSession ? '#3B82F6' : isLiveActive ? '#8B5CF6' : '#6B7280';
                  const iconBg = hasShadowSession ? 'rgba(59,130,246,0.15)' : isLiveActive ? 'rgba(139,92,246,0.15)' : 'rgba(107,114,128,0.15)';
                  return (
                    <View style={{width: 32, height: 32, borderRadius: 10, backgroundColor: iconBg, alignItems: 'center', justifyContent: 'center'}}>
                      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                        <Path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke={iconColor} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                        <Path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke={iconColor} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                      </Svg>
                    </View>
                  );
                })()}
                <View>
                  <Text style={modalStyles.title}>
                    {hasShadowSession ? 'Shadow Settings' : isLiveActive ? 'Bot Settings' : 'Bot Preferences'}
                  </Text>
                  {userBotState.status === 'none' && (
                    <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 1}}>Applied when you start this bot</Text>
                  )}
                </View>
              </View>
              <TouchableOpacity onPress={() => setSettingsModalVisible(false)} style={modalStyles.closeBtn}>
                <XIcon size={18} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            </View>

            {/* Tab bar — Settings + Compounding for all states */}
            <View style={{flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)'}}>
              {(['settings', 'compounding'] as const).map(tab => {
                const accentColor = hasShadowSession ? '#3B82F6' : isLiveActive ? '#8B5CF6' : '#6B7280';
                return (
                  <TouchableOpacity key={tab} activeOpacity={0.7}
                    style={{flex: 1, alignItems: 'center', paddingVertical: 11, position: 'relative'}}
                    onPress={() => setSettingsModalTab(tab)}>
                    <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 13, color: settingsModalTab === tab ? '#FFFFFF' : 'rgba(255,255,255,0.35)', letterSpacing: 0.2}}>
                      {tab === 'settings' ? 'Settings' : 'Compounding'}
                    </Text>
                    {settingsModalTab === tab && (
                      <View style={{position: 'absolute', bottom: 0, left: '20%', right: '20%', height: 2, borderRadius: 2, backgroundColor: accentColor}} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <ScrollView
              style={modalStyles.body}
              contentContainerStyle={[modalStyles.bodyContent, {gap: 22, paddingTop: 20}]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}>

              {settingsModalTab !== 'compounding' && (hasShadowSession || userBotState.status === 'none') ? (
                /* ── Shadow session settings (also used as pre-run defaults when status=none) ── */
                <>
                  {/* Pre-run info banner */}
                  {userBotState.status === 'none' && (
                    <View style={{backgroundColor: 'rgba(107,114,128,0.1)', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(107,114,128,0.2)', flexDirection: 'row', alignItems: 'flex-start', gap: 10}}>
                      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" style={{marginTop: 1}}>
                        <Path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" stroke="#9CA3AF" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                        <Path d="M12 8v4M12 16h.01" stroke="#9CA3AF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                      </Svg>
                      <View style={{flex: 1}}>
                        <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 13, color: 'rgba(255,255,255,0.7)'}}>Pre-run preferences</Text>
                        <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 3, lineHeight: 16}}>Configure your shadow session defaults before you start. These apply when you tap Try Shadow Mode.</Text>
                      </View>
                    </View>
                  )}

                  {/* Notifications card */}
                  <View style={{backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', paddingHorizontal: 16, paddingVertical: 14}}>
                    <Text style={[modalStyles.label, {marginBottom: 12}]}>NOTIFICATIONS</Text>
                    <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
                      {(['all', 'wins_only', 'losses_only', 'summary'] as const).map(n => (
                        <TouchableOpacity key={n} activeOpacity={0.7}
                          style={{paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, backgroundColor: shadowUserConfig.notificationLevel === n ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: shadowUserConfig.notificationLevel === n ? '#3B82F6' : 'rgba(255,255,255,0.08)'}}
                          onPress={() => setShadowUserConfig(c => ({...c, notificationLevel: n}))}>
                          <Text style={{fontFamily: 'Inter-Medium', fontSize: 13, color: shadowUserConfig.notificationLevel === n ? '#3B82F6' : 'rgba(255,255,255,0.5)'}}>{n === 'all' ? 'All Trades' : n === 'wins_only' ? 'Wins Only' : n === 'losses_only' ? 'Losses Only' : 'Summary'}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Auto-Stop card */}
                  <View style={{backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', overflow: 'hidden'}}>
                    <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4}}>AUTO-STOP RULES</Text>

                    {/* Auto-Stop Loss % */}
                    <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)'}}>
                      <View style={{flex: 1}}>
                        <Text style={modalStyles.label}>LOSS %</Text>
                        <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2}}>Stop if portfolio drops this %</Text>
                      </View>
                      <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 14, paddingVertical: 10, minWidth: 90}}>
                        <TextInput style={{fontFamily: 'Inter-SemiBold', fontSize: 15, color: '#FFFFFF', minWidth: 44, textAlign: 'right'}} keyboardType="decimal-pad" value={shadowUserConfig.autoStopLossPercent} onChangeText={v => setShadowUserConfig(c => ({...c, autoStopLossPercent: v}))} placeholder="—" placeholderTextColor="rgba(255,255,255,0.3)" />
                        <Text style={{fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.4)', marginLeft: 4}}>%</Text>
                      </View>
                    </View>

                    {/* Auto-Stop Balance */}
                    <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)'}}>
                      <View style={{flex: 1}}>
                        <Text style={modalStyles.label}>MIN BALANCE</Text>
                        <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2}}>Stop if virtual balance falls below</Text>
                      </View>
                      <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 14, paddingVertical: 10, minWidth: 90}}>
                        <Text style={{fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.4)', marginRight: 4}}>$</Text>
                        <TextInput style={{fontFamily: 'Inter-SemiBold', fontSize: 15, color: '#FFFFFF', minWidth: 44, textAlign: 'right'}} keyboardType="decimal-pad" value={shadowUserConfig.autoStopBalance} onChangeText={v => setShadowUserConfig(c => ({...c, autoStopBalance: v}))} placeholder="—" placeholderTextColor="rgba(255,255,255,0.3)" />
                      </View>
                    </View>

                    {/* Auto-Stop Days */}
                    <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)'}}>
                      <View style={{flex: 1}}>
                        <Text style={modalStyles.label}>MAX DURATION</Text>
                        <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2}}>End session after N days</Text>
                      </View>
                      <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 14, paddingVertical: 10, minWidth: 90}}>
                        <TextInput style={{fontFamily: 'Inter-SemiBold', fontSize: 15, color: '#FFFFFF', minWidth: 44, textAlign: 'right'}} keyboardType="number-pad" value={shadowUserConfig.autoStopDays} onChangeText={v => setShadowUserConfig(c => ({...c, autoStopDays: v}))} placeholder="—" placeholderTextColor="rgba(255,255,255,0.3)" />
                        <Text style={{fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.4)', marginLeft: 6}}>days</Text>
                      </View>
                    </View>
                  </View>
                </>
              ) : settingsModalTab !== 'compounding' ? (
                /* ── Live subscription settings (settings tab, live user) ── */
                <>
                  {/* Risk Multiplier card */}
                  <View style={{backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', paddingHorizontal: 16, paddingVertical: 14}}>
                    <Text style={[modalStyles.label, {marginBottom: 12}]}>RISK MULTIPLIER</Text>
                    <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 12}}>Scale trade size relative to bot defaults</Text>
                    <View style={{flexDirection: 'row', gap: 8}}>
                      {([0.5, 1, 1.5, 2] as const).map(v => (
                        <TouchableOpacity key={v} activeOpacity={0.7}
                          style={{flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: subUserConfig.riskMultiplier === v ? 'rgba(16,185,129,0.18)' : 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: subUserConfig.riskMultiplier === v ? '#10B981' : 'rgba(255,255,255,0.08)', alignItems: 'center'}}
                          onPress={() => setSubUserConfig(c => ({...c, riskMultiplier: v}))}>
                          <Text style={{fontFamily: 'Inter-Bold', fontSize: 15, color: subUserConfig.riskMultiplier === v ? '#10B981' : 'rgba(255,255,255,0.5)'}}>{v}x</Text>
                          <Text style={{fontFamily: 'Inter-Regular', fontSize: 10, color: subUserConfig.riskMultiplier === v ? 'rgba(16,185,129,0.7)' : 'rgba(255,255,255,0.25)', marginTop: 3}}>{v === 0.5 ? 'Safe' : v === 1 ? 'Default' : v === 1.5 ? 'Moderate' : 'Aggressive'}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Notifications card */}
                  <View style={{backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', paddingHorizontal: 16, paddingVertical: 14}}>
                    <Text style={[modalStyles.label, {marginBottom: 12}]}>NOTIFICATIONS</Text>
                    <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
                      {(['all', 'wins_only', 'losses_only', 'summary'] as const).map(n => (
                        <TouchableOpacity key={n} activeOpacity={0.7}
                          style={{paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, backgroundColor: subUserConfig.notificationLevel === n ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: subUserConfig.notificationLevel === n ? '#3B82F6' : 'rgba(255,255,255,0.08)'}}
                          onPress={() => setSubUserConfig(c => ({...c, notificationLevel: n}))}>
                          <Text style={{fontFamily: 'Inter-Medium', fontSize: 13, color: subUserConfig.notificationLevel === n ? '#3B82F6' : 'rgba(255,255,255,0.5)'}}>{n === 'all' ? 'All Trades' : n === 'wins_only' ? 'Wins Only' : n === 'losses_only' ? 'Losses Only' : 'Summary'}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Risk limits card */}
                  <View style={{backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', overflow: 'hidden'}}>
                    <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4}}>RISK LIMITS</Text>

                    {/* Max Daily Loss */}
                    <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)'}}>
                      <View style={{flex: 1}}>
                        <Text style={modalStyles.label}>MAX DAILY LOSS</Text>
                        <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2}}>Pause if this % is lost in a day</Text>
                      </View>
                      <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 14, paddingVertical: 10, minWidth: 90}}>
                        <TextInput style={{fontFamily: 'Inter-SemiBold', fontSize: 15, color: '#FFFFFF', minWidth: 44, textAlign: 'right'}} keyboardType="decimal-pad" value={subUserConfig.maxDailyLoss ?? ''} onChangeText={v => setSubUserConfig(c => ({...c, maxDailyLoss: v}))} placeholder="—" placeholderTextColor="rgba(255,255,255,0.3)" />
                        <Text style={{fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.4)', marginLeft: 4}}>%</Text>
                      </View>
                    </View>

                    {/* Auto-Stop Loss */}
                    <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)'}}>
                      <View style={{flex: 1}}>
                        <Text style={modalStyles.label}>STOP-LOSS %</Text>
                        <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2}}>Stop bot if portfolio drops this %</Text>
                      </View>
                      <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 14, paddingVertical: 10, minWidth: 90}}>
                        <TextInput style={{fontFamily: 'Inter-SemiBold', fontSize: 15, color: '#FFFFFF', minWidth: 44, textAlign: 'right'}} keyboardType="decimal-pad" value={subUserConfig.autoStopLossPercent ?? ''} onChangeText={v => setSubUserConfig(c => ({...c, autoStopLossPercent: v}))} placeholder="—" placeholderTextColor="rgba(255,255,255,0.3)" />
                        <Text style={{fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.4)', marginLeft: 4}}>%</Text>
                      </View>
                    </View>

                    {/* Auto-Stop Balance */}
                    <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)'}}>
                      <View style={{flex: 1}}>
                        <Text style={modalStyles.label}>MIN BALANCE</Text>
                        <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2}}>Stop if balance falls below $</Text>
                      </View>
                      <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 14, paddingVertical: 10, minWidth: 90}}>
                        <Text style={{fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.4)', marginRight: 4}}>$</Text>
                        <TextInput style={{fontFamily: 'Inter-SemiBold', fontSize: 15, color: '#FFFFFF', minWidth: 44, textAlign: 'right'}} keyboardType="decimal-pad" value={subUserConfig.autoStopBalance ?? ''} onChangeText={v => setSubUserConfig(c => ({...c, autoStopBalance: v}))} placeholder="—" placeholderTextColor="rgba(255,255,255,0.3)" />
                      </View>
                    </View>

                    {/* Auto-Stop Days */}
                    <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)'}}>
                      <View style={{flex: 1}}>
                        <Text style={modalStyles.label}>MAX DURATION</Text>
                        <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2}}>Auto-stop after N days</Text>
                      </View>
                      <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 14, paddingVertical: 10, minWidth: 90}}>
                        <TextInput style={{fontFamily: 'Inter-SemiBold', fontSize: 15, color: '#FFFFFF', minWidth: 44, textAlign: 'right'}} keyboardType="number-pad" value={subUserConfig.autoStopDays ?? ''} onChangeText={v => setSubUserConfig(c => ({...c, autoStopDays: v}))} placeholder="—" placeholderTextColor="rgba(255,255,255,0.3)" />
                        <Text style={{fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.4)', marginLeft: 6}}>days</Text>
                      </View>
                    </View>
                  </View>
                </>
              ) : (
                /* ── Compounding tab — all states (shadow stores in userConfig.compounding, live in subscription) ── */
                <>
                  {/* Shadow / pre-run context banner */}
                  {(hasShadowSession || userBotState.status === 'none') && (
                    <View style={{backgroundColor: 'rgba(59,130,246,0.08)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(59,130,246,0.2)', flexDirection: 'row', alignItems: 'center', gap: 10}}>
                      <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                        <Path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" stroke="#3B82F6" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                        <Path d="M12 8v4M12 16h.01" stroke="#3B82F6" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                      </Svg>
                      <Text style={{flex: 1, fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 16}}>
                        {userBotState.status === 'none'
                          ? 'Virtual compounding — these settings apply when you start shadow mode.'
                          : 'Shadow compounding reinvests virtual profits to grow your paper balance.'}
                      </Text>
                    </View>
                  )}
                  {compounding && (<>
                    {/* Enable toggle card */}
                    <View style={{backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', paddingHorizontal: 16, paddingVertical: 14}}>
                      <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
                        <View style={{flex: 1}}>
                          <Text style={modalStyles.label}>AUTO-COMPOUND</Text>
                          <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 3}}>Reinvest profits automatically after each trade</Text>
                        </View>
                        <TouchableOpacity activeOpacity={0.7}
                          style={{width: 48, height: 26, borderRadius: 13, backgroundColor: compounding.enabled ? '#10B981' : 'rgba(255,255,255,0.08)', justifyContent: 'center', paddingHorizontal: 3}}
                          onPress={() => setCompounding(c => c ? {...c, enabled: !c.enabled} : c)}>
                          <View style={{width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF', alignSelf: compounding.enabled ? 'flex-end' : 'flex-start'}} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {compounding.enabled && (<>
                      {/* Reinvestment Rate card */}
                      <View style={{backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', paddingHorizontal: 16, paddingVertical: 14}}>
                        <Text style={[modalStyles.label, {marginBottom: 6}]}>REINVESTMENT RATE</Text>
                        <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 12}}>% of profit to reinvest each time</Text>
                        <View style={{flexDirection: 'row', gap: 8}}>
                          {([25, 50, 75, 100] as const).map(v => (
                            <TouchableOpacity key={v} activeOpacity={0.7}
                              style={{flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: compounding.reinvestmentRate === v ? 'rgba(16,185,129,0.18)' : 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: compounding.reinvestmentRate === v ? '#10B981' : 'rgba(255,255,255,0.08)', alignItems: 'center'}}
                              onPress={() => setCompounding(c => c ? {...c, reinvestmentRate: v} : c)}>
                              <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 14, color: compounding.reinvestmentRate === v ? '#10B981' : 'rgba(255,255,255,0.5)'}}>{v}%</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>

                      {/* Frequency + Mode card */}
                      <View style={{backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', paddingHorizontal: 16, paddingVertical: 14, gap: 14}}>
                        {/* Compound Frequency */}
                        <View>
                          <Text style={[modalStyles.label, {marginBottom: 10}]}>COMPOUND FREQUENCY</Text>
                          <View style={{flexDirection: 'row', gap: 8}}>
                            {([
                              {key: 'each_trade', label: 'Each Trade'},
                              {key: 'daily', label: 'Daily'},
                              {key: 'weekly', label: 'Weekly'},
                            ] as const).map(f => (
                              <TouchableOpacity key={f.key} activeOpacity={0.7}
                                style={{flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: compounding.compoundFrequency === f.key ? 'rgba(16,185,129,0.18)' : 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: compounding.compoundFrequency === f.key ? '#10B981' : 'rgba(255,255,255,0.08)', alignItems: 'center'}}
                                onPress={() => setCompounding(c => c ? {...c, compoundFrequency: f.key} : c)}>
                                <Text style={{fontFamily: 'Inter-Medium', fontSize: 12, color: compounding.compoundFrequency === f.key ? '#10B981' : 'rgba(255,255,255,0.5)', textAlign: 'center'}}>{f.label}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </View>

                        {/* Reinvestment Mode */}
                        <View>
                          <Text style={[modalStyles.label, {marginBottom: 10}]}>REINVEST FROM</Text>
                          <View style={{flexDirection: 'row', gap: 8}}>
                            {([
                              {key: 'free_balance', label: 'Free Balance'},
                              {key: 'total_balance', label: 'Total Balance'},
                              {key: 'fixed', label: 'Fixed Amount'},
                            ] as const).map(m => (
                              <TouchableOpacity key={m.key} activeOpacity={0.7}
                                style={{flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: compounding.reinvestmentMode === m.key ? 'rgba(16,185,129,0.18)' : 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: compounding.reinvestmentMode === m.key ? '#10B981' : 'rgba(255,255,255,0.08)', alignItems: 'center'}}
                                onPress={() => setCompounding(c => c ? {...c, reinvestmentMode: m.key} : c)}>
                                <Text style={{fontFamily: 'Inter-Medium', fontSize: 12, color: compounding.reinvestmentMode === m.key ? '#10B981' : 'rgba(255,255,255,0.5)', textAlign: 'center'}}>{m.label}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </View>
                      </View>

                      {/* Limits card */}
                      <View style={{backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', paddingHorizontal: 16, paddingVertical: 14, gap: 14}}>
                        {/* Max Multiplier + Keep as Cash */}
                        <View style={{flexDirection: 'row', gap: 10}}>
                          <View style={{flex: 1}}>
                            <Text style={[modalStyles.label, {marginBottom: 8}]}>MAX GROWTH</Text>
                            <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 14, paddingVertical: 10}}>
                              <TextInput style={{flex: 1, fontFamily: 'Inter-SemiBold', fontSize: 15, color: '#10B981', textAlign: 'center'}} keyboardType="decimal-pad" value={String(compounding.maxCompoundMultiplier)} onChangeText={v => setCompounding(c => c ? {...c, maxCompoundMultiplier: parseFloat(v) || 3} : c)} />
                              <Text style={{fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.4)', marginLeft: 4}}>×</Text>
                            </View>
                            <Text style={{fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 4, textAlign: 'center'}}>max multiplier</Text>
                          </View>
                          <View style={{flex: 1}}>
                            <Text style={[modalStyles.label, {marginBottom: 8}]}>KEEP AS CASH</Text>
                            <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 14, paddingVertical: 10}}>
                              <TextInput style={{flex: 1, fontFamily: 'Inter-SemiBold', fontSize: 15, color: '#F59E0B', textAlign: 'center'}} keyboardType="number-pad" value={String(compounding.withdrawalReservePct)} onChangeText={v => setCompounding(c => c ? {...c, withdrawalReservePct: v === '' ? 0 : parseInt(v, 10) || 0} : c)} />
                              <Text style={{fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.4)', marginLeft: 4}}>%</Text>
                            </View>
                            <Text style={{fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 4, textAlign: 'center'}}>of profit reserved</Text>
                          </View>
                        </View>

                        {/* Min profit threshold */}
                        <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
                          <View style={{flex: 1}}>
                            <Text style={modalStyles.label}>MIN PROFIT THRESHOLD</Text>
                            <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 3}}>Only compound if profit ≥ $</Text>
                          </View>
                          <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 14, paddingVertical: 10, minWidth: 90}}>
                            <Text style={{fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.4)', marginRight: 4}}>$</Text>
                            <TextInput style={{fontFamily: 'Inter-SemiBold', fontSize: 15, color: '#FFFFFF', minWidth: 44, textAlign: 'right'}} keyboardType="decimal-pad" value={String(compounding.minProfitThresholdUSD ?? 0)} onChangeText={v => setCompounding(c => c ? {...c, minProfitThresholdUSD: parseFloat(v) || 0} : c)} placeholder="0" placeholderTextColor="rgba(255,255,255,0.3)" />
                          </View>
                        </View>
                      </View>
                    </>)}

                    {/* Total compounded stat */}
                    {(compounding.totalCompounded ?? 0) > 0 && (
                      <View style={{backgroundColor: 'rgba(16,185,129,0.07)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(16,185,129,0.15)'}}>
                        <Text style={{fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.5)'}}>Total compounded to date</Text>
                        <Text style={{fontFamily: 'Inter-Bold', fontSize: 20, color: '#10B981', marginTop: 4}}>${(compounding.totalCompounded ?? 0).toFixed(2)}</Text>
                        {compounding.lastCompoundAt && <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4}}>Last: {new Date(compounding.lastCompoundAt).toLocaleDateString()}</Text>}
                      </View>
                    )}
                  </>)}
                  {!compounding && <Text style={{fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center', paddingVertical: 20}}>Loading compounding settings...</Text>}
                </>
              )}

            </ScrollView>

            <View style={modalStyles.footer}>
              <TouchableOpacity
                style={[modalStyles.confirmBtn, {opacity: (savingConfig || savingCompounding) ? 0.6 : 1}]}
                activeOpacity={0.85}
                disabled={savingConfig || savingCompounding}
                onPress={async () => {
                  const isNone = userBotState.status === 'none';
                  const isCompoundingTab = settingsModalTab === 'compounding';

                  if (isCompoundingTab) {
                    if (isNone) {
                      // Settings are held in local state and will be passed to startShadowMode
                      showAlert('Ready', 'Compounding settings saved. They will be applied when you start shadow mode.');
                      setSettingsModalVisible(false);
                      return;
                    }
                    if (!compounding) return;
                    setSavingCompounding(true);
                    try {
                      if (hasShadowSession && userBotState.shadowSessionId) {
                        // Shadow: save compounding inside userConfig.compounding
                        await botsService.updateShadowSessionConfig(userBotState.shadowSessionId, {
                          compounding,
                        });
                        showAlert('Saved', 'Shadow compounding settings updated.');
                      } else if (isLiveActive && userBotState.subscriptionId) {
                        // Live: save to subscription compoundingSettings
                        await botsService.updateCompounding(userBotState.subscriptionId, compounding);
                        showAlert('Saved', 'Compounding settings updated.');
                      }
                    } catch { showAlert('Error', 'Failed to save compounding settings.'); }
                    finally { setSavingCompounding(false); }
                  } else if (isNone) {
                    setSettingsModalVisible(false);
                  } else if (hasShadowSession) {
                    await handleSaveShadowConfig();
                    setSettingsModalVisible(false);
                  } else {
                    await handleSaveUserConfig();
                    setSettingsModalVisible(false);
                  }
                }}>
                {(savingConfig || savingCompounding)
                  ? <ActivityIndicator size="small" color="#FFFFFF" />
                  : <Text style={modalStyles.confirmText}>
                      {userBotState.status === 'none' && settingsModalTab !== 'compounding'
                        ? 'Close'
                        : settingsModalTab === 'compounding'
                          ? (userBotState.status === 'none' ? 'Close' : 'Save Compounding')
                          : 'Save Settings'}
                    </Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Shadow Mode Confirmation Modal ─────────────────────────── */}
      <Modal
        visible={shadowModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setShadowModalVisible(false)}>
        {/* Two-region layout that stays sane no matter the keyboard:
            • KeyboardAvoidingView is the OUTER shell so the whole sheet
              translates up when the keyboard opens (iOS) / shrinks the
              available height (Android).
            • The sheet itself is split into a SCROLLABLE body (inputs) and
              a STICKY footer (Confirm button). The footer is OUTSIDE the
              ScrollView so it never disappears when the keyboard opens, and
              never falls below the visible viewport when the keyboard
              closes. Mirrors the working pattern from BotPurchaseScreen. */}
        <KeyboardAvoidingView
          style={modalStyles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={modalStyles.sheet}>
            <View style={modalStyles.handle} />
            <View style={modalStyles.headerRow}>
              <Text style={modalStyles.title}>Start Shadow Mode</Text>
              <TouchableOpacity onPress={() => setShadowModalVisible(false)} style={modalStyles.closeBtn}>
                <XIcon size={18} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={modalStyles.body}
              contentContainerStyle={modalStyles.bodyContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}>
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
                    maxLength={4}
                  />
                  <Text style={modalStyles.customLabel}>days</Text>
                </View>
              )}

              {/* Virtual balance — no upper cap; user can simulate any amount. */}
              <Text style={modalStyles.label}>VIRTUAL BALANCE</Text>
              <View style={modalStyles.balanceRow}>
                <Text style={modalStyles.dollarSign}>$</Text>
                <TextInput
                  style={modalStyles.balanceInput}
                  value={virtualBalance}
                  onChangeText={setVirtualBalance}
                  keyboardType="decimal-pad"
                />
              </View>

            </ScrollView>

            {/* Sticky footer — sits OUTSIDE the ScrollView so the keyboard can
                never hide it, and it never disappears when the keyboard closes. */}
            <View style={modalStyles.footer}>
              <TouchableOpacity style={modalStyles.confirmBtn} onPress={handleConfirmShadow} activeOpacity={0.85}>
                <Text style={modalStyles.confirmText}>Start Shadow Mode</Text>
              </TouchableOpacity>
              <Text style={modalStyles.disclaimer}>No real money will be used. You can pause or stop anytime.</Text>
            </View>
          </View>
        </KeyboardAvoidingView>
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
  headerTitle: {flex: 1, fontFamily: 'Inter-SemiBold', fontSize: 16, color: '#FFFFFF', textAlign: 'center', marginHorizontal: 8, display: 'none'},
  scroll: {paddingHorizontal: 20, paddingTop: 14},
  headerLiveFeedBtn: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(16,185,129,0.1)', gap: 5},
  headerLiveDot: {width: 6, height: 6, borderRadius: 3},
  headerLiveFeedText: {fontFamily: 'Inter-SemiBold', fontSize: 12},
  activeStatusBar: {flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginBottom: 4, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, borderWidth: 1, gap: 8},
  activeStatusDot: {width: 8, height: 8, borderRadius: 4},
  activeStatusText: {fontFamily: 'Inter-Medium', fontSize: 12, flex: 1},
  tabBarWrap: {flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)'},
  tabBarTab: {flex: 1, alignItems: 'center', paddingVertical: 12, position: 'relative'},
  tabBarUnderline: {position: 'absolute', bottom: 0, left: '20%', right: '20%', height: 2, borderRadius: 2},
  tabBarTrack: {flexDirection: 'row', gap: 8},
  tabBarPill: {flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: 'transparent'},
  tabBarSep: {width: 1, backgroundColor: 'rgba(255,255,255,0.08)', alignSelf: 'stretch'},
  tabBarBtn: {flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 7, borderRadius: 10},
  tabBarBtnLiveActive: {backgroundColor: 'rgba(16,185,129,0.12)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)'},
  tabBarBtnShadowActive: {backgroundColor: 'rgba(59,130,246,0.12)', borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)'},
  tabBarDot: {width: 7, height: 7, borderRadius: 3.5},
  tabBarBtnText: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.2},
  heroCard: {marginBottom: 0, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)'},
  heroRow: {flexDirection: 'row', alignItems: 'center', gap: 12},
  heroAvatarRing: {width: 52, height: 52, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden'},
  heroMeta: {flexShrink: 1, flexGrow: 0},
  heroCreatorRow: {flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2},
  heroCreatorDot: {width: 5, height: 5, borderRadius: 3, backgroundColor: '#10B981', marginTop: 1},
  heroInfo: {flex: 1},
  heroNameRow: {flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2},
  heroSection: {alignItems: 'center', paddingVertical: 16},
  botAvatar: {width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 12},
  botAvatarWrap: {marginBottom: 0},
  botAvatarText: {fontFamily: 'Inter-Bold', fontSize: 28, color: '#FFFFFF'},
  badgesRow: {flexDirection: 'row', gap: 6},
  botName: {fontFamily: 'Inter-Bold', fontSize: 15, color: '#FFFFFF', letterSpacing: -0.3, flexWrap: 'wrap'},
  botCreator: {fontFamily: 'Inter-SemiBold', fontSize: 10, color: 'rgba(255,255,255,0.45)', letterSpacing: 0.1},
  ratingRow: {flexDirection: 'row', alignItems: 'center'},
  ratingText: {fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.4)'},
  activeUsers: {fontFamily: 'Inter-Medium', fontSize: 10, color: 'rgba(255,255,255,0.4)'},
  statsGrid: {flexDirection: 'row', gap: 6, marginBottom: 14},
  statsGridInner: {flex: 1, flexDirection: 'row', gap: 6},
  statCellDivider: {width: 0},
  statCell: {
    flex: 1, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 6,
    backgroundColor: '#161B22', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  statCellLabel: {fontFamily: 'Inter-Medium', fontSize: 8.5, letterSpacing: 0.7, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 4, textAlign: 'center'},
  statCellValue: {fontFamily: 'Inter-Bold', fontSize: 15, letterSpacing: -0.5, textAlign: 'center'},
  chartSection: {marginBottom: 16},
  chartSectionLabel: {fontFamily: 'Inter-SemiBold', fontSize: 9, letterSpacing: 1.2, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' as const, marginBottom: 10},
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
    fontFamily: 'Inter-Medium', fontSize: 8, letterSpacing: 0.8,
    color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 4,
  },
  overviewValue: {fontFamily: 'Inter-Bold', fontSize: 13, color: '#FFFFFF'},

  // Key Metrics
  metricsCard: {
    backgroundColor: '#161B22', borderRadius: 16, paddingHorizontal: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  metricRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  metricLabel: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.5)'},
  metricValue: {fontFamily: 'Inter-SemiBold', fontSize: 12, color: '#FFFFFF'},

  // Creator
  creatorCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#161B22', borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  creatorAvatar: {
    width: 36, height: 36, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  creatorAvatarText: {fontFamily: 'Inter-Bold', fontSize: 15, color: '#FFFFFF'},
  creatorInfo: {flex: 1},
  creatorName: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#FFFFFF'},
  creatorSub: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2},

  section: {marginBottom: 20},
  sectionLabel: {fontFamily: 'Inter-Medium', fontSize: 9, letterSpacing: 1, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 8},
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
  strategyText: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 19},
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
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 26,
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
    paddingTop: 12,
    maxHeight: '88%',
    // sheet itself has no horizontal padding — body and footer apply their own
    // so the sticky footer can have a different paddingBottom on iOS for
    // home-indicator clearance without affecting the scrollable area.
  },
  handle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center', marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 24,
  },
  body: {flexGrow: 0},
  bodyContent: {paddingHorizontal: 24, paddingBottom: 8},
  bodyHint: {
    fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.4)',
    marginTop: -16, marginBottom: 16,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    backgroundColor: '#161B22',
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
