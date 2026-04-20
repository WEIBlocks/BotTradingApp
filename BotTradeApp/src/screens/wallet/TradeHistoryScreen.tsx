import React, {useState, useCallback, useRef} from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';
import {useToast} from '../../context/ToastContext';
import {RootStackParamList} from '../../types';
import type {Trade} from '../../types';
import {tradesApi} from '../../services/trades';
import TradeRow from '../../components/common/TradeRow';
import ChevronLeftIcon from '../../components/icons/ChevronLeftIcon';

type Props = NativeStackScreenProps<RootStackParamList, 'TradeHistory'>;

type TabKey = 'live' | 'shadow' | 'arena' | 'all';

interface ModeSummary {
  totalPnl: number;
  totalTrades: number;
  winRate: number;
}

interface SummaryByMode {
  live: ModeSummary;
  shadow: ModeSummary;
  arena: ModeSummary;
  all: ModeSummary;
}

const TABS: {key: TabKey; label: string; color: string}[] = [
  {key: 'live',   label: 'Live',   color: '#10B981'},
  {key: 'shadow', label: 'Shadow', color: '#3B82F6'},
  {key: 'arena',  label: 'Arena',  color: '#8B5CF6'},
  {key: 'all',    label: 'All',    color: 'rgba(255,255,255,0.7)'},
];

const PAGE_SIZE = 50;

export default function TradeHistoryScreen({navigation}: Props) {
  const {alert: showAlert} = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>('live');
  const [tradesByMode, setTradesByMode] = useState<Record<TabKey, Trade[]>>({live: [], shadow: [], arena: [], all: []});
  const [pageByMode, setPageByMode] = useState<Record<TabKey, number>>({live: 1, shadow: 1, arena: 1, all: 1});
  const [hasMoreByMode, setHasMoreByMode] = useState<Record<TabKey, boolean>>({live: true, shadow: true, arena: true, all: true});
  const [totalByMode, setTotalByMode] = useState<Record<TabKey, number>>({live: 0, shadow: 0, arena: 0, all: 0});
  const [summary, setSummary] = useState<SummaryByMode | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const loadingMoreRef = useRef(false);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await tradesApi.getSummary();
      setSummary(res as SummaryByMode);
      // Seed server-side totals from summary so badge counts are correct immediately
      setTotalByMode(prev => ({
        ...prev,
        live:   res.live.totalTrades,
        shadow: res.shadow.totalTrades,
        arena:  res.arena.totalTrades,
        all:    res.all.totalTrades,
      }));
    } catch {}
  }, []);

  const fetchTab = useCallback(async (tab: TabKey, page: number, append = false) => {
    try {
      const res = await tradesApi.getHistory({mode: tab === 'all' ? 'all' : tab, page, limit: PAGE_SIZE});
      setTradesByMode(prev => ({
        ...prev,
        [tab]: append ? [...prev[tab], ...res.trades] : res.trades,
      }));
      setPageByMode(prev => ({...prev, [tab]: page}));
      setHasMoreByMode(prev => ({...prev, [tab]: page < res.totalPages}));
      // Update server total from pagination response
      if (res.total > 0) {
        setTotalByMode(prev => ({...prev, [tab]: res.total}));
      }
    } catch {
      if (!append) showAlert('Error', 'Failed to load trades. Pull down to retry.');
    }
  }, [showAlert]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      fetchSummary(),
      fetchTab('live', 1),
      fetchTab('shadow', 1),
      fetchTab('arena', 1),
      fetchTab('all', 1),
    ]);
    setLoading(false);
    setRefreshing(false);
  }, [fetchSummary, fetchTab]);

  useFocusEffect(useCallback(() => { fetchAll(); }, [fetchAll]));

  const handleLoadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreByMode[activeTab]) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const nextPage = pageByMode[activeTab] + 1;
    await fetchTab(activeTab, nextPage, true);
    setLoadingMore(false);
    loadingMoreRef.current = false;
  }, [activeTab, hasMoreByMode, pageByMode, fetchTab]);

  const activeSummary = summary?.[activeTab];
  const activeTrades = tradesByMode[activeTab];
  const activeColor = TABS.find(t => t.key === activeTab)?.color ?? '#FFFFFF';

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
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <ChevronLeftIcon size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trade History</Text>
        <View style={{width: 40}} />
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          // Use server total (from summary/pagination) — never the locally-loaded page count
          const total = totalByMode[tab.key];
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, isActive && {borderBottomColor: tab.color, borderBottomWidth: 2}]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}>
              <Text style={[styles.tabLabel, isActive && {color: tab.color}]}>{tab.label}</Text>
              {total > 0 && (
                <View style={[styles.tabBadge, {backgroundColor: isActive ? tab.color : 'rgba(255,255,255,0.08)'}]}>
                  <Text style={[styles.tabBadgeText, isActive && {color: '#FFF'}]}>{total}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Per-mode summary card */}
      {activeSummary && (
        <View style={[styles.summaryCard, {borderLeftColor: activeColor}]}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, {color: activeSummary.totalPnl >= 0 ? '#10B981' : '#EF4444'}]}>
              {activeSummary.totalPnl >= 0 ? '+' : ''}{activeSummary.totalPnl.toFixed(2)}
            </Text>
            <Text style={styles.summaryLabel}>P&L ($)</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{activeSummary.totalTrades}</Text>
            <Text style={styles.summaryLabel}>Trades</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{Math.round(activeSummary.winRate)}%</Text>
            <Text style={styles.summaryLabel}>Win Rate</Text>
          </View>
        </View>
      )}

      {/* Trade list */}
      {activeTrades.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>📊</Text>
          <Text style={styles.emptyTitle}>No {activeTab === 'all' ? '' : activeTab + ' '}trades yet</Text>
          <Text style={styles.emptyDesc}>
            {activeTab === 'live'
              ? 'Connect an exchange and activate live trading to see real trades here.'
              : activeTab === 'shadow'
              ? 'Start a shadow session on any bot to paper-trade and see results here.'
              : activeTab === 'arena'
              ? 'Run an arena battle to see bot vs. bot trade decisions here.'
              : 'No trades recorded yet. Start trading to see your history.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={activeTrades}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({item}) => <TradeRow trade={item} />}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.loadingMore}>
                <ActivityIndicator size="small" color="#10B981" />
                <Text style={styles.loadingMoreText}>Loading more...</Text>
              </View>
            ) : !hasMoreByMode[activeTab] && activeTrades.length > 0 ? (
              <Text style={styles.endText}>All {totalByMode[activeTab] || activeTrades.length} trades loaded</Text>
            ) : null
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchAll(); }}
              tintColor="#10B981"
              colors={['#10B981']}
              progressBackgroundColor="#161B22"
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0F1117'},
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {fontFamily: 'Inter-Bold', fontSize: 20, color: '#FFFFFF'},

  // Tabs
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
    backgroundColor: '#0F1117',
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, gap: 6,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabLabel: {fontFamily: 'Inter-SemiBold', fontSize: 12, color: 'rgba(255,255,255,0.35)'},
  tabBadge: {
    paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  tabBadgeText: {fontFamily: 'Inter-Bold', fontSize: 9, color: 'rgba(255,255,255,0.4)'},

  // Summary card
  summaryCard: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    backgroundColor: '#161B22', borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 16,
    borderLeftWidth: 3,
  },
  summaryItem: {flex: 1, alignItems: 'center'},
  summaryValue: {fontFamily: 'Inter-Bold', fontSize: 17, color: '#FFFFFF', marginBottom: 2},
  summaryLabel: {fontFamily: 'Inter-Regular', fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 0.5},
  summaryDivider: {width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.07)', marginHorizontal: 4},

  // List
  listContent: {paddingHorizontal: 16, paddingTop: 10, paddingBottom: 32},
  loadingMore: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8},
  loadingMoreText: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.3)'},
  endText: {
    fontFamily: 'Inter-Regular', fontSize: 11,
    color: 'rgba(255,255,255,0.2)', textAlign: 'center',
    paddingVertical: 16,
  },

  // Empty
  emptyContainer: {flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingTop: 40},
  emptyEmoji: {fontSize: 48, marginBottom: 16},
  emptyTitle: {fontFamily: 'Inter-SemiBold', fontSize: 18, color: 'rgba(255,255,255,0.6)', marginBottom: 8},
  emptyDesc: {fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.3)', textAlign: 'center', lineHeight: 19},
});
