import React, {useState, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList, LiveTrade} from '../../types';
import {tradesApi} from '../../services/trades';
import Svg, {Path, Circle} from 'react-native-svg';

type Nav = NativeStackNavigationProp<RootStackParamList>;

// ─── Icons ──────────────────────────────────────────────────────────────────────

function BackArrow() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 19l-7-7 7-7"
        stroke="#FFFFFF"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function LightbulbIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 21h6M12 3a6 6 0 014 10.47V17a1 1 0 01-1 1H9a1 1 0 01-1-1v-3.53A6 6 0 0112 3z"
        stroke="#F59E0B"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function formatTimeAgo(date: Date): string {
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

function formatUSD(value: number): string {
  return '$' + value.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

// ─── Filter Tabs ────────────────────────────────────────────────────────────────

const FILTERS = ['All', 'My Bots', 'Community'] as const;
type FilterType = (typeof FILTERS)[number];

// ─── Screen ─────────────────────────────────────────────────────────────────────

export default function LiveTradesScreen() {
  const navigation = useNavigation<Nav>();
  const [activeFilter, setActiveFilter] = useState<FilterType>('All');
  const [liveTrades, setLiveTrades] = useState<LiveTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(() => {
    tradesApi
      .getLiveFeed(20)
      .then(setLiveTrades)
      .catch(() => setLiveTrades([]))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const filteredTrades = activeFilter === 'All'
    ? liveTrades
    : activeFilter === 'My Bots'
      ? liveTrades.filter(t => t.isOwned)
      : liveTrades.filter(t => !t.isOwned);

  const renderSeparator = useCallback(
    () => <View style={styles.separator} />,
    [],
  );

  const renderTrade = useCallback(({item}: {item: LiveTrade}) => {
    const isBuy = item.side === 'BUY';
    const tradeValue = item.amount * item.price;

    return (
      <View style={styles.tradeCard}>
        <View style={styles.tradeRow}>
          {/* Left: side badge */}
          <View
            style={[
              styles.sideBadge,
              {backgroundColor: isBuy ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'},
            ]}>
            <Text
              style={[
                styles.sideText,
                {color: isBuy ? '#10B981' : '#EF4444'},
              ]}>
              {item.side}
            </Text>
          </View>

          {/* Middle: symbol + bot name + time */}
          <View style={styles.tradeMiddle}>
            <Text style={styles.symbolText}>{item.symbol}</Text>
            <View style={styles.tradeSubRow}>
              <Text style={styles.botNameText}>{item.botName}</Text>
              <Text style={styles.dotSep}>{' \u00B7 '}</Text>
              <Text style={styles.timeText}>{formatTimeAgo(item.timestamp)}</Text>
            </View>
          </View>

          {/* Right: amount + P&L */}
          <View style={styles.tradeRight}>
            <Text style={styles.amountText}>{formatUSD(tradeValue)}</Text>
            {item.pnl !== undefined && item.pnlPercent !== undefined && (
              <Text
                style={[
                  styles.pnlText,
                  {color: item.pnl >= 0 ? '#10B981' : '#EF4444'},
                ]}>
                {item.pnl >= 0 ? '+' : ''}
                {formatUSD(item.pnl)} ({item.pnlPercent > 0 ? '+' : ''}
                {item.pnlPercent}%)
              </Text>
            )}
          </View>
        </View>

        {/* Reasoning card */}
        {item.reasoning ? (
          <View style={styles.reasoningCard}>
            <LightbulbIcon />
            <Text style={styles.reasoningText}>{item.reasoning}</Text>
          </View>
        ) : null}
      </View>
    );
  }, []);

  const uniqueBots = new Set(liveTrades.map(t => t.botName)).size;

  const ListHeader = useCallback(
    () => (
      <View style={styles.liveBanner}>
        <View style={styles.liveBannerDot} />
        <Text style={styles.liveBannerText}>
          {liveTrades.length} trades today {'\u00B7'} {uniqueBots} active bot{uniqueBots !== 1 ? 's' : ''}
        </Text>
      </View>
    ),
    [liveTrades.length, uniqueBots],
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}>
          <BackArrow />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Live Trades</Text>
        <View style={styles.pulsingDot} />
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {FILTERS.map(f => {
          const active = f === activeFilter;
          return (
            <TouchableOpacity
              key={f}
              onPress={() => setActiveFilter(f)}
              style={[
                styles.filterTab,
                active && styles.filterTabActive,
              ]}
              activeOpacity={0.7}>
              <Text
                style={[
                  styles.filterText,
                  active && styles.filterTextActive,
                ]}>
                {f}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Trade Feed */}
      {loading ? (
        <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
          <ActivityIndicator size="large" color="#10B981" />
        </View>
      ) : filteredTrades.length === 0 ? (
        <View style={{flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32}}>
          <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 16, color: 'rgba(255,255,255,0.5)', marginBottom: 6}}>No live trades yet</Text>
          <Text style={{fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.3)', textAlign: 'center', lineHeight: 19}}>
            When your bots execute trades, they'll appear here in real-time.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredTrades}
          keyExtractor={item => item.id}
          renderItem={renderTrade}
          ListHeaderComponent={ListHeader}
          ItemSeparatorComponent={renderSeparator}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchData(); }}
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

// ─── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E14',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 54,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Inter-Bold',
    fontSize: 17,
    color: '#FFFFFF',
  },
  pulsingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
    marginRight: 8,
  },

  // Filters
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  filterTabActive: {
    backgroundColor: 'rgba(16,185,129,0.12)',
  },
  filterText: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
  },
  filterTextActive: {
    color: '#10B981',
    fontFamily: 'Inter-SemiBold',
  },

  // Live banner
  liveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  liveBannerDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#10B981',
    marginRight: 8,
  },
  liveBannerText: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: '#10B981',
  },

  // List
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 32,
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 2,
  },

  // Trade card
  tradeCard: {
    paddingVertical: 14,
  },
  tradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sideBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    marginRight: 12,
  },
  sideText: {
    fontFamily: 'Inter-Bold',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  tradeMiddle: {
    flex: 1,
  },
  symbolText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
    color: '#FFFFFF',
    marginBottom: 3,
  },
  tradeSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  botNameText: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
  dotSep: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.2)',
  },
  timeText: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
  },
  tradeRight: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  pnlText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
  },

  // Reasoning
  reasoningCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(245,158,11,0.06)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
    marginLeft: 54,
    gap: 8,
  },
  reasoningText: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 18,
  },
});
