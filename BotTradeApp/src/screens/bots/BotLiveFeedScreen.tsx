import React, {useState, useCallback, useRef, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  AppState,
  Animated,
} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';
import {RootStackParamList} from '../../types';
import {botsService} from '../../services/bots';
import {marketplaceApi} from '../../services/marketplace';
import {API_BASE_URL} from '../../config/api';
import {storage} from '../../services/storage';
import ChevronLeftIcon from '../../components/icons/ChevronLeftIcon';

type Props = NativeStackScreenProps<RootStackParamList, 'BotLiveFeed'>;

interface BotDecision {
  id: string;
  botId: string;
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reasoning: string;
  indicators: Record<string, number | string | null>;
  price: string;
  aiCalled: boolean;
  tokensCost: number;
  mode: 'paper' | 'live';
  createdAt: string;
  timestamp?: string;
}

const POLL_INTERVAL = 15000; // 15 seconds

/** Countdown to next US market open */
function MarketCountdown() {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const calc = () => {
      const now = new Date();
      const month = now.getUTCMonth();
      const isDST = month >= 2 && month <= 9;
      const OPEN_H = isDST ? 13 : 14; // 9:30 AM ET in UTC
      const OPEN_M = 30;

      // Next market open
      const nextOpen = new Date(now);
      nextOpen.setUTCHours(OPEN_H, OPEN_M, 0, 0);

      // If past today's open, move to tomorrow
      if (now.getTime() >= nextOpen.getTime()) {
        nextOpen.setUTCDate(nextOpen.getUTCDate() + 1);
      }

      // Skip weekends
      while (nextOpen.getUTCDay() === 0 || nextOpen.getUTCDay() === 6) {
        nextOpen.setUTCDate(nextOpen.getUTCDate() + 1);
      }

      const diffMs = nextOpen.getTime() - now.getTime();
      if (diffMs <= 0) { setTimeLeft('Opening soon...'); return; }

      const hours = Math.floor(diffMs / 3600000);
      const mins = Math.floor((diffMs % 3600000) / 60000);

      // Convert to local time for display
      const localH = nextOpen.getHours();
      const localM = nextOpen.getMinutes();
      const ampm = localH >= 12 ? 'PM' : 'AM';
      const h12 = localH % 12 || 12;
      const localStr = `${h12}:${localM.toString().padStart(2, '0')} ${ampm}`;

      setTimeLeft(`Opens in ${hours}h ${mins}m (${localStr} your time)`);
    };

    calc();
    const interval = setInterval(calc, 60000);
    return () => clearInterval(interval);
  }, []);

  if (!timeLeft) return null;
  return <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(239,68,68,0.7)', marginTop: 2}}>{timeLeft}</Text>;
}

export default function BotLiveFeedScreen({navigation, route}: Props) {
  const {botId, botName, mode} = route.params as {botId: string; botName: string; mode: string};

  const [decisions, setDecisions] = useState<BotDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [isStockBot, setIsStockBot] = useState(false);
  const [marketOpen, setMarketOpen] = useState<boolean | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [connected, setConnected] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [apiStats, setApiStats] = useState<{totalBuys: number; totalSells: number; totalHolds: number; totalAiCalls: number; totalTokens: number} | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const lastFetchRef = useRef<string>('');

  // Pulse animation for live indicator
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {toValue: 0.3, duration: 1000, useNativeDriver: true}),
        Animated.timing(pulseAnim, {toValue: 1, duration: 1000, useNativeDriver: true}),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  // Detect bot category and check market status via time calculation
  useEffect(() => {
    marketplaceApi.getBotDetails(botId).then((bot: any) => {
      if (bot?.category === 'Stocks') {
        setIsStockBot(true);
      }
    }).catch(() => {});
  }, [botId]);

  // Market hours check (pure time-based, no API needed)
  useEffect(() => {
    if (!isStockBot) return;
    const checkMarket = () => {
      const now = new Date();
      const utcH = now.getUTCHours();
      const utcM = now.getUTCMinutes();
      const utcDay = now.getUTCDay();
      if (utcDay === 0 || utcDay === 6) { setMarketOpen(false); return; }
      const currentMin = utcH * 60 + utcM;
      const month = now.getUTCMonth();
      const isDST = month >= 2 && month <= 9;
      const openMin = isDST ? 13 * 60 + 30 : 14 * 60 + 30;
      const closeMin = isDST ? 20 * 60 : 21 * 60;
      setMarketOpen(currentMin >= openMin && currentMin < closeMin);
    };
    checkMarket();
    const interval = setInterval(checkMarket, 30000);
    return () => clearInterval(interval);
  }, [isStockBot]);

  // Fetch decisions via REST (primary data source)
  // Strategy: try mode-specific first; if empty, fall back to all decisions so
  // shadow users who navigate via a "live feed" button still see their data.
  const fetchDecisions = useCallback(async () => {
    try {
      const feedMode = mode === 'live' ? 'live' : 'paper';
      let res: any = await botsService.getDecisions(botId, 50, 0, feedMode as 'paper' | 'live');
      let items: BotDecision[] = Array.isArray(res?.data?.decisions) ? res.data.decisions
        : Array.isArray(res?.data) ? res.data : [];

      // If mode-filtered query returned nothing, retry without mode filter so
      // shadow decisions show even when the screen was opened in "live" context.
      if (items.length === 0) {
        res = await botsService.getDecisions(botId, 50, 0, undefined);
        items = Array.isArray(res?.data?.decisions) ? res.data.decisions
          : Array.isArray(res?.data) ? res.data : [];
      }

      const pagination = res?.data?.pagination;

      const key = items.map((d: BotDecision) => d.id || d.createdAt).join(',');
      if (key !== lastFetchRef.current) {
        lastFetchRef.current = key;
        setDecisions(items);
      }
      if (pagination) {
        setTotalCount(pagination.total);
        setHasMore(pagination.hasMore);
      }
      // Use server-side stats for accurate counts across ALL decisions
      const stats = res?.data?.stats;
      if (stats) {
        setApiStats(stats);
      }
      setConnected(true);
    } catch (err) {
      console.warn('Failed to fetch decisions:', err);
    } finally {
      setLoading(false);
    }
  }, [botId, mode]);

  // Load more decisions (pagination)
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      // No mode filter on paginated loads — show all decisions regardless of mode
      const res: any = await botsService.getDecisions(botId, 50, decisions.length, undefined);
      const items: BotDecision[] = Array.isArray(res?.data?.decisions) ? res.data.decisions
        : Array.isArray(res?.data) ? res.data : [];
      const pagination = res?.data?.pagination;
      if (items.length > 0) {
        setDecisions(prev => [...prev, ...items]);
      }
      if (pagination) {
        setHasMore(pagination.hasMore);
        setTotalCount(pagination.total);
      } else {
        setHasMore(items.length >= 50);
      }
    } catch {}
    setLoadingMore(false);
  }, [botId, decisions.length, loadingMore, hasMore]);

  // Connect WebSocket for real-time push updates (enhancement, not required)
  const connectWs = useCallback(async () => {
    try {
      const token = await storage.getAccessToken();
      if (!token) return;

      const wsUrl = API_BASE_URL.replace('http', 'ws');
      const ws = new WebSocket(`${wsUrl}/ws/bot/${botId}/decisions?token=${token}`);

      ws.onopen = () => {
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(typeof event.data === 'string' ? event.data : '');

          if (msg.type === 'initial_decisions' && Array.isArray(msg.data) && msg.data.length > 0) {
            setDecisions(msg.data);
            setLoading(false);
            setConnected(true);
          } else if (msg.type === 'bot_decision' && msg.data) {
            // Add new real-time decision to the top
            setDecisions(prev => {
              const newItem = msg.data;
              // Deduplicate by id or timestamp
              const exists = prev.some(d => d.id === newItem.id || (d.timestamp && d.timestamp === newItem.timestamp));
              if (exists) return prev;
              return [newItem, ...prev].slice(0, 100);
            });
          } else if (msg.type === 'connected') {
            setWsConnected(true);
          }
        } catch {}
      };

      ws.onclose = () => setWsConnected(false);
      ws.onerror = () => setWsConnected(false);

      wsRef.current = ws;
    } catch {
      // WS failed — REST polling will handle it
    }
  }, [botId]);

  // Setup: fetch data + try WS + start polling
  useFocusEffect(
    useCallback(() => {
      fetchDecisions();
      connectWs();
      pollRef.current = setInterval(fetchDecisions, POLL_INTERVAL);

      return () => {
        if (wsRef.current) {
          wsRef.current.close();
          wsRef.current = null;
        }
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      };
    }, [fetchDecisions, connectWs]),
  );

  // Handle app state changes
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        if (pollRef.current) clearInterval(pollRef.current);
        if (wsRef.current) wsRef.current.close();
      } else if (state === 'active') {
        fetchDecisions();
        connectWs();
        pollRef.current = setInterval(fetchDecisions, POLL_INTERVAL);
      }
    });
    return () => sub.remove();
  }, []);

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'BUY': return '🟢';
      case 'SELL': return '🔴';
      default: return '⏸';
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'BUY': return '#00C851';
      case 'SELL': return '#FF4444';
      default: return '#6B7280';
    }
  };

  const formatTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false});
    } catch {
      return '--:--:--';
    }
  };

  const formatPrice = (price: string | number) => {
    const p = typeof price === 'string' ? parseFloat(price) : price;
    if (isNaN(p)) return '$0.00';
    if (p >= 1000) return '$' + p.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    return '$' + p.toFixed(4);
  };

  // Stats — use server-side counts (accurate across ALL decisions, not just loaded page)
  const totalBuys = apiStats?.totalBuys ?? decisions.filter(d => d.action === 'BUY').length;
  const totalSells = apiStats?.totalSells ?? decisions.filter(d => d.action === 'SELL').length;
  const totalHolds = apiStats?.totalHolds ?? decisions.filter(d => d.action === 'HOLD').length;
  const aiCalls = apiStats?.totalAiCalls ?? decisions.filter(d => d.aiCalled).length;
  const totalTokens = apiStats?.totalTokens ?? decisions.reduce((sum, d) => sum + (d.tokensCost || 0), 0);

  const renderDecision = ({item}: {item: BotDecision}) => (
    <View style={styles.decisionCard}>
      <View style={styles.decisionHeader}>
        <View style={styles.decisionAction}>
          <Text style={styles.actionIcon}>{getActionIcon(item.action)}</Text>
          <Text style={[styles.actionText, {color: getActionColor(item.action)}]}>
            {item.action}
          </Text>
          {item.action !== 'HOLD' && item.confidence > 0 && (
            <View style={styles.confidenceContainer}>
              <Text style={styles.confidenceBadge}>{item.confidence}%</Text>
            </View>
          )}
        </View>
        <View style={styles.decisionMeta}>
          <Text style={styles.decisionTime}>{formatTime(item.createdAt || item.timestamp || '')}</Text>
          {item.aiCalled && (
            <View style={styles.aiBadge}>
              <Text style={styles.aiBadgeText}>AI</Text>
            </View>
          )}
        </View>
      </View>

      <Text style={styles.decisionSymbol}>{item.symbol} @ {formatPrice(item.price)}</Text>
      <Text style={styles.decisionReasoning}>{item.reasoning}</Text>

      {/* Indicators row */}
      {item.indicators && (
        <View style={styles.indicatorsRow}>
          {item.indicators.rsi != null && (
            <View style={styles.indicatorChip}>
              <Text style={styles.indicatorLabel}>RSI</Text>
              <Text style={[
                styles.indicatorValue,
                {color: Number(item.indicators.rsi) < 30 ? '#00C851' : Number(item.indicators.rsi) > 70 ? '#FF4444' : '#9CA3AF'},
              ]}>{Number(item.indicators.rsi).toFixed(1)}</Text>
            </View>
          )}
          {item.indicators.macd != null && (
            <View style={styles.indicatorChip}>
              <Text style={styles.indicatorLabel}>MACD</Text>
              <Text style={[
                styles.indicatorValue,
                {color: Number(item.indicators.macd) > 0 ? '#00C851' : '#FF4444'},
              ]}>{Number(item.indicators.macd) > 0 ? '+' : ''}{Number(item.indicators.macd).toFixed(4)}</Text>
            </View>
          )}
          {item.indicators.price_change != null && (
            <View style={styles.indicatorChip}>
              <Text style={styles.indicatorLabel}>Chg</Text>
              <Text style={[
                styles.indicatorValue,
                {color: Number(item.indicators.price_change) > 0 ? '#00C851' : '#FF4444'},
              ]}>{Number(item.indicators.price_change) > 0 ? '+' : ''}{Number(item.indicators.price_change).toFixed(2)}%</Text>
            </View>
          )}
          {item.indicators.ema20 != null && (
            <View style={styles.indicatorChip}>
              <Text style={styles.indicatorLabel}>EMA20</Text>
              <Text style={styles.indicatorValue}>{formatPrice(item.indicators.ema20)}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );

  // Status text
  const statusText = wsConnected ? 'LIVE' : connected ? 'ACTIVE' : 'CONNECTING';
  const statusColor = wsConnected ? '#00C851' : connected ? '#3B82F6' : '#FF4444';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeftIcon size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{botName || 'Bot'}</Text>
          <View style={styles.liveIndicator}>
            <Animated.View style={[styles.liveDot, {opacity: pulseAnim, backgroundColor: statusColor}]} />
            <Text style={[styles.liveText, {color: statusColor}]}>{statusText}</Text>
            <View style={[styles.modeBadge, {backgroundColor: mode === 'live' ? '#FF6B0020' : '#00C85120'}]}>
              <Text style={[styles.modeBadgeText, {color: mode === 'live' ? '#FF6B00' : '#00C851'}]}>
                {mode === 'live' ? 'LIVE TRADING' : 'SHADOW'}
              </Text>
            </View>
          </View>
        </View>
        <View style={{width: 40}} />
      </View>

      {/* Stats Bar */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{totalBuys}</Text>
          <Text style={[styles.statLabel, {color: '#00C851'}]}>Buys</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{totalSells}</Text>
          <Text style={[styles.statLabel, {color: '#FF4444'}]}>Sells</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{totalHolds}</Text>
          <Text style={[styles.statLabel, {color: '#6B7280'}]}>Holds</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{aiCalls}</Text>
          <Text style={[styles.statLabel, {color: '#8B5CF6'}]}>AI Calls</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{totalTokens}</Text>
          <Text style={[styles.statLabel, {color: '#F59E0B'}]}>Tokens</Text>
        </View>
      </View>

      {/* Market Status Banner (stock bots only) */}
      {isStockBot && marketOpen !== null && (
        <View style={[styles.marketBanner, {backgroundColor: marketOpen ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', borderColor: marketOpen ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}]}>
          <View style={[styles.marketDot, {backgroundColor: marketOpen ? '#10B981' : '#EF4444'}]} />
          <View style={{flex: 1}}>
            <Text style={[styles.marketText, {color: marketOpen ? '#10B981' : '#EF4444'}]}>
              {marketOpen ? 'US Market Open — Bot is actively trading' : 'US Market Closed'}
            </Text>
            {!marketOpen && (
              <MarketCountdown />
            )}
          </View>
        </View>
      )}

      {/* Decision Feed */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00C851" />
          <Text style={styles.loadingText}>Connecting to bot engine...</Text>
        </View>
      ) : decisions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🤖</Text>
          <Text style={styles.emptyTitle}>Waiting for Decisions</Text>
          <Text style={styles.emptySubtitle}>
            {isStockBot && marketOpen === false
              ? 'US stock market is closed. The bot will start\nmaking decisions when market opens (9:30 AM ET).'
              : mode === 'live'
                ? 'The bot engine analyzes markets every 2 minutes.\nLive decisions will appear here once the bot acts.'
                : 'The bot engine analyzes markets every 2 minutes.\nMake sure you have an active shadow session running.'}
          </Text>
          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={fetchDecisions}
            activeOpacity={0.7}>
            <Text style={styles.refreshBtnText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={decisions}
          renderItem={renderDecision}
          keyExtractor={(item, index) => item.id || `${item.createdAt}-${index}`}
          contentContainerStyle={styles.feedContainer}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListHeaderComponent={totalCount > 0 ? (
            <Text style={{color: '#6B7280', fontSize: 11, fontFamily: 'Inter-Regular', textAlign: 'center', marginBottom: 8}}>
              Showing {decisions.length} of {totalCount} decisions
            </Text>
          ) : null}
          ListFooterComponent={loadingMore ? (
            <ActivityIndicator size="small" color="#00C851" style={{marginVertical: 16}} />
          ) : hasMore && decisions.length > 0 ? (
            <TouchableOpacity onPress={loadMore} style={{alignItems: 'center', paddingVertical: 16}}>
              <Text style={{color: '#3B82F6', fontSize: 13, fontFamily: 'Inter-Medium'}}>Load More</Text>
            </TouchableOpacity>
          ) : decisions.length > 0 ? (
            <Text style={{color: '#4B5563', fontSize: 11, fontFamily: 'Inter-Regular', textAlign: 'center', paddingVertical: 12}}>All decisions loaded</Text>
          ) : null}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0A0E14'},

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1F2E',
  },
  backBtn: {width: 40, height: 40, justifyContent: 'center'},
  headerCenter: {flex: 1, alignItems: 'center'},
  headerTitle: {color: '#FFFFFF', fontSize: 17, fontFamily: 'Inter-SemiBold'},
  liveIndicator: {flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6},
  liveDot: {width: 8, height: 8, borderRadius: 4},
  liveText: {fontSize: 11, fontFamily: 'Inter-Bold', letterSpacing: 1},
  modeBadge: {paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4},
  modeBadgeText: {fontSize: 9, fontFamily: 'Inter-Bold', letterSpacing: 0.5},

  marketBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  marketDot: {width: 8, height: 16, borderRadius: 4},
  marketText: {fontFamily: 'Inter-Medium', fontSize: 12, flex: 1},
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#111827',
    borderBottomWidth: 1,
    borderBottomColor: '#1A1F2E',
  },
  statItem: {flex: 1, alignItems: 'center'},
  statValue: {color: '#FFFFFF', fontSize: 16, fontFamily: 'Inter-Bold'},
  statLabel: {fontSize: 10, fontFamily: 'Inter-Medium', marginTop: 2},
  statDivider: {width: 1, height: 24, backgroundColor: '#1F2937'},

  loadingContainer: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  loadingText: {color: '#6B7280', fontSize: 14, fontFamily: 'Inter-Regular', marginTop: 12},

  emptyContainer: {flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40},
  emptyIcon: {fontSize: 48, marginBottom: 16},
  emptyTitle: {color: '#FFFFFF', fontSize: 18, fontFamily: 'Inter-SemiBold', marginBottom: 8},
  emptySubtitle: {color: '#6B7280', fontSize: 14, fontFamily: 'Inter-Regular', textAlign: 'center', lineHeight: 20},
  refreshBtn: {
    marginTop: 20,
    backgroundColor: '#1F2937',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  refreshBtnText: {color: '#FFFFFF', fontSize: 14, fontFamily: 'Inter-SemiBold'},

  feedContainer: {padding: 16, gap: 10},

  decisionCard: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  decisionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  decisionAction: {flexDirection: 'row', alignItems: 'center', gap: 6},
  actionIcon: {fontSize: 14},
  actionText: {fontSize: 14, fontFamily: 'Inter-Bold', letterSpacing: 0.5},
  confidenceContainer: {
    backgroundColor: '#1F2937',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  confidenceBadge: {
    color: '#9CA3AF',
    fontSize: 11,
    fontFamily: 'Inter-Medium',
  },
  decisionMeta: {flexDirection: 'row', alignItems: 'center', gap: 6},
  decisionTime: {color: '#6B7280', fontSize: 12, fontFamily: 'Inter-Regular'},
  aiBadge: {
    backgroundColor: '#8B5CF620',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  aiBadgeText: {color: '#8B5CF6', fontSize: 9, fontFamily: 'Inter-Bold'},

  decisionSymbol: {color: '#D1D5DB', fontSize: 13, fontFamily: 'Inter-Medium', marginBottom: 4},
  decisionReasoning: {color: '#9CA3AF', fontSize: 13, fontFamily: 'Inter-Regular', lineHeight: 18, marginBottom: 8},

  indicatorsRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 6},
  indicatorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D1117',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  indicatorLabel: {color: '#6B7280', fontSize: 10, fontFamily: 'Inter-Medium'},
  indicatorValue: {fontSize: 11, fontFamily: 'Inter-SemiBold'},
});
