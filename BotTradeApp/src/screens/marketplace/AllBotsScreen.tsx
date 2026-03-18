import React, {useState, useCallback, useEffect, useRef} from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator, RefreshControl,
} from 'react-native';
import {useNavigation, useRoute, RouteProp} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import Svg, {Path, Circle, Rect, Ellipse} from 'react-native-svg';
import {RootStackParamList, Bot} from '../../types';
import {marketplaceApi} from '../../services/marketplace';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'AllBots'>;

// ─── Icons ──────────────────────────────────────────────────────────────────

function BackArrow() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M15 19l-7-7 7-7" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function SearchIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
      <Circle cx={6.5} cy={6.5} r={4.5} stroke="rgba(255,255,255,0.3)" strokeWidth={1.4} />
      <Path d="M10 10 L14 14" stroke="rgba(255,255,255,0.3)" strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  );
}

function BotAvatarSvg({size = 32}: {size?: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Rect x={14} y={18} width={36} height={30} rx={8} fill="#10B981" opacity={0.9} />
      <Ellipse cx={24} cy={31} rx={4} ry={4} fill="#0F1117" />
      <Ellipse cx={40} cy={31} rx={4} ry={4} fill="#0F1117" />
      <Ellipse cx={25} cy={30} rx={1.5} ry={1.5} fill="#FFFFFF" />
      <Ellipse cx={41} cy={30} rx={1.5} ry={1.5} fill="#FFFFFF" />
      <Rect x={23} y={38} width={18} height={3} rx={1.5} fill="#0F1117" />
      <Rect x={30} y={10} width={4} height={8} rx={2} fill="#10B981" opacity={0.9} />
      <Circle cx={32} cy={9} r={3} fill="#34D399" />
      <Rect x={8} y={27} width={6} height={10} rx={3} fill="#10B981" opacity={0.7} />
      <Rect x={50} y={27} width={6} height={10} rx={3} fill="#10B981" opacity={0.7} />
    </Svg>
  );
}

function StarIcon() {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"
        fill="#F59E0B" stroke="#F59E0B" strokeWidth={1}
      />
    </Svg>
  );
}

// ─── Constants ──────────────────────────────────────────────────────────────

const CATEGORIES = ['All', 'Crypto', 'Stocks', 'Forex', 'Multi'];
const RISK_LEVELS = ['All', 'Very Low', 'Low', 'Med', 'High', 'Very High'];
const SORT_OPTIONS = [
  {label: 'Newest', value: 'newest'},
  {label: 'Top Returns', value: 'return_30d'},
  {label: 'Most Popular', value: 'active_users'},
  {label: 'Highest Rated', value: 'avg_rating'},
];

const PAGE_SIZE = 20;

// ─── Bot List Item ──────────────────────────────────────────────────────────

function BotListItem({bot, onPress}: {bot: Bot; onPress: () => void}) {
  const returnColor = bot.returnPercent >= 0 ? '#10B981' : '#EF4444';
  const returnSign = bot.returnPercent >= 0 ? '+' : '';
  const riskColor =
    bot.risk === 'Very Low' || bot.risk === 'Low' ? '#10B981'
    : bot.risk === 'High' || bot.risk === 'Very High' ? '#EF4444'
    : '#F59E0B';

  return (
    <TouchableOpacity style={itemStyles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={itemStyles.leftSection}>
        <View style={itemStyles.avatarWrap}>
          <BotAvatarSvg size={28} />
        </View>
        <View style={itemStyles.info}>
          <Text style={itemStyles.name} numberOfLines={1}>{bot.name}</Text>
          <Text style={itemStyles.strategy} numberOfLines={1}>{bot.strategy}</Text>
          <View style={itemStyles.metaRow}>
            <View style={[itemStyles.riskBadge, {backgroundColor: riskColor + '20'}]}>
              <Text style={[itemStyles.riskText, {color: riskColor}]}>{bot.risk}</Text>
            </View>
            <Text style={itemStyles.category}>{bot.category}</Text>
            {bot.rating > 0 && (
              <View style={itemStyles.ratingRow}>
                <StarIcon />
                <Text style={itemStyles.ratingText}>{bot.rating.toFixed(1)}</Text>
              </View>
            )}
          </View>
        </View>
      </View>
      <View style={itemStyles.rightSection}>
        <Text style={[itemStyles.returnPct, {color: returnColor}]}>
          {returnSign}{bot.returnPercent.toFixed(1)}%
        </Text>
        <Text style={itemStyles.returnLabel}>30D</Text>
        <Text style={itemStyles.users}>{bot.activeUsers} users</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main Screen ────────────────────────────────────────────────────────────

export default function AllBotsScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();

  const initialCategory = route.params?.initialCategory || 'All';
  const initialSort = route.params?.initialSort || 'newest';

  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const [activeRisk, setActiveRisk] = useState('All');
  const [activeSort, setActiveSort] = useState(initialSort);
  const [showSortPicker, setShowSortPicker] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  const fetchBots = useCallback(async (pageNum: number, append = false) => {
    try {
      const query: Record<string, any> = {
        page: pageNum,
        limit: PAGE_SIZE,
      };
      if (activeCategory !== 'All') query.category = activeCategory;
      if (activeRisk !== 'All') query.risk = activeRisk;
      if (searchQuery.trim()) query.search = searchQuery.trim();
      if (activeSort !== 'newest') query.sort = activeSort;

      const res = await marketplaceApi.getBots(query);
      if (append) {
        setBots(prev => [...prev, ...res.bots]);
      } else {
        setBots(res.bots);
      }
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch {
      // silently fail, user can pull to refresh
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [activeCategory, activeRisk, searchQuery, activeSort]);

  // Initial load + filter changes
  useEffect(() => {
    setLoading(true);
    setPage(1);
    fetchBots(1);
  }, [fetchBots]);

  // Debounced search
  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setLoading(true);
      setPage(1);
    }, 400);
  };

  const handleLoadMore = () => {
    if (loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    setPage(nextPage);
    fetchBots(nextPage, true);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    setPage(1);
    fetchBots(1);
  };

  const sortLabel = SORT_OPTIONS.find(s => s.value === activeSort)?.label || 'Newest';

  const renderItem = ({item}: {item: Bot}) => (
    <BotListItem
      bot={item}
      onPress={() => navigation.navigate('BotDetails', {botId: item.id})}
    />
  );

  const renderHeader = () => (
    <>
      {/* Search */}
      <View style={styles.searchRow}>
        <SearchIcon />
        <TextInput
          style={styles.searchInput}
          placeholder="Search bots by name or strategy..."
          placeholderTextColor="rgba(255,255,255,0.25)"
          value={searchQuery}
          onChangeText={handleSearchChange}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => { setSearchQuery(''); }}>
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Category filter */}
      <FlatList
        horizontal
        data={CATEGORIES}
        keyExtractor={item => item}
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterContent}
        renderItem={({item}) => (
          <TouchableOpacity
            style={[styles.chip, activeCategory === item && styles.chipActive]}
            onPress={() => setActiveCategory(item)}
            activeOpacity={0.7}>
            <Text style={[styles.chipText, activeCategory === item && styles.chipTextActive]}>
              {item}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* Risk level filter */}
      <FlatList
        horizontal
        data={RISK_LEVELS}
        keyExtractor={item => item}
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterContent}
        renderItem={({item}) => (
          <TouchableOpacity
            style={[styles.riskChip, activeRisk === item && styles.riskChipActive]}
            onPress={() => setActiveRisk(item)}
            activeOpacity={0.7}>
            <Text style={[styles.riskChipText, activeRisk === item && styles.riskChipTextActive]}>
              {item === 'All' ? 'Any Risk' : item}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* Sort + results count */}
      <View style={styles.sortBar}>
        <Text style={styles.resultsCount}>{total} bot{total !== 1 ? 's' : ''} found</Text>
        <TouchableOpacity
          style={styles.sortBtn}
          onPress={() => setShowSortPicker(v => !v)}
          activeOpacity={0.7}>
          <Text style={styles.sortBtnText}>Sort: {sortLabel}</Text>
          <Text style={styles.sortArrow}>{showSortPicker ? '▲' : '▼'}</Text>
        </TouchableOpacity>
      </View>

      {/* Sort picker dropdown */}
      {showSortPicker && (
        <View style={styles.sortPicker}>
          {SORT_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.sortOption, activeSort === opt.value && styles.sortOptionActive]}
              onPress={() => { setActiveSort(opt.value); setShowSortPicker(false); }}
              activeOpacity={0.7}>
              <Text style={[styles.sortOptionText, activeSort === opt.value && styles.sortOptionTextActive]}>
                {opt.label}
              </Text>
              {activeSort === opt.value && <Text style={styles.checkMark}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </>
  );

  const renderFooter = () => {
    if (loadingMore) {
      return (
        <View style={styles.footerLoader}>
          <ActivityIndicator size="small" color="#10B981" />
        </View>
      );
    }
    if (bots.length > 0 && page >= totalPages) {
      return (
        <Text style={styles.endText}>You've seen all bots</Text>
      );
    }
    return null;
  };

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyContainer}>
        <BotAvatarSvg size={64} />
        <Text style={styles.emptyTitle}>No bots found</Text>
        <Text style={styles.emptySubtitle}>
          Try adjusting your filters or search query
        </Text>
        <TouchableOpacity
          style={styles.resetBtn}
          onPress={() => {
            setSearchQuery('');
            setActiveCategory('All');
            setActiveRisk('All');
            setActiveSort('newest');
          }}
          activeOpacity={0.7}>
          <Text style={styles.resetBtnText}>Reset Filters</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
          <BackArrow />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>All Bots</Text>
        <View style={{width: 22}} />
      </View>

      {loading && bots.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#10B981" />
        </View>
      ) : (
        <FlatList
          data={bots}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          ListHeaderComponent={renderHeader}
          ListFooterComponent={renderFooter}
          ListEmptyComponent={renderEmpty}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
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

// ─── Item Styles ────────────────────────────────────────────────────────────

const itemStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#161B22',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 14,
    marginBottom: 10,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  avatarWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  info: {flex: 1},
  name: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF', marginBottom: 2},
  strategy: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 6},
  metaRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  riskBadge: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  riskText: {fontFamily: 'Inter-SemiBold', fontSize: 9, letterSpacing: 0.3},
  category: {fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.35)'},
  ratingRow: {flexDirection: 'row', alignItems: 'center', gap: 3},
  ratingText: {fontFamily: 'Inter-Medium', fontSize: 10, color: '#F59E0B'},
  rightSection: {alignItems: 'flex-end'},
  returnPct: {fontFamily: 'Inter-Bold', fontSize: 16, letterSpacing: -0.3},
  returnLabel: {fontFamily: 'Inter-Medium', fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: 0.5, marginBottom: 4},
  users: {fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.4)'},
});

// ─── Screen Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0A0E14'},
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 54, paddingBottom: 14, paddingHorizontal: 20,
  },
  headerTitle: {fontFamily: 'Inter-SemiBold', fontSize: 18, color: '#FFFFFF'},
  loadingContainer: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  listContent: {paddingHorizontal: 20, paddingBottom: 32},

  // Search
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#1A1F2E', borderRadius: 12, paddingHorizontal: 14,
    height: 44, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 12,
  },
  searchInput: {flex: 1, fontFamily: 'Inter-Regular', fontSize: 13, color: '#FFFFFF'},
  clearText: {fontFamily: 'Inter-Medium', fontSize: 12, color: '#10B981'},

  // Category chips
  filterRow: {marginBottom: 10, marginHorizontal: -20},
  filterContent: {paddingHorizontal: 20, gap: 8},
  chip: {
    paddingHorizontal: 16, paddingVertical: 7, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  chipActive: {backgroundColor: '#10B981', borderColor: '#10B981'},
  chipText: {fontFamily: 'Inter-Medium', fontSize: 13, color: 'rgba(255,255,255,0.5)'},
  chipTextActive: {color: '#FFFFFF', fontFamily: 'Inter-SemiBold'},

  // Risk level chips
  riskChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  riskChipActive: {backgroundColor: 'rgba(245,158,11,0.15)', borderColor: 'rgba(245,158,11,0.3)'},
  riskChipText: {fontFamily: 'Inter-Medium', fontSize: 11, color: 'rgba(255,255,255,0.4)'},
  riskChipTextActive: {color: '#F59E0B', fontFamily: 'Inter-SemiBold'},

  // Sort bar
  sortBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12, marginTop: 4,
  },
  resultsCount: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.4)'},
  sortBtn: {flexDirection: 'row', alignItems: 'center', gap: 4},
  sortBtnText: {fontFamily: 'Inter-Medium', fontSize: 12, color: '#10B981'},
  sortArrow: {fontFamily: 'Inter-Medium', fontSize: 10, color: '#10B981'},

  // Sort picker
  sortPicker: {
    backgroundColor: '#1A1F2E', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 12, overflow: 'hidden',
  },
  sortOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  sortOptionActive: {backgroundColor: 'rgba(16,185,129,0.08)'},
  sortOptionText: {fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.6)'},
  sortOptionTextActive: {color: '#10B981', fontFamily: 'Inter-SemiBold'},
  checkMark: {fontFamily: 'Inter-Bold', fontSize: 14, color: '#10B981'},

  // Footer
  footerLoader: {paddingVertical: 20, alignItems: 'center'},
  endText: {
    fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.25)',
    textAlign: 'center', paddingVertical: 20,
  },

  // Empty state
  emptyContainer: {alignItems: 'center', paddingVertical: 48},
  emptyTitle: {fontFamily: 'Inter-SemiBold', fontSize: 16, color: '#FFFFFF', marginTop: 16, marginBottom: 4},
  emptySubtitle: {fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 20},
  resetBtn: {
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10,
    backgroundColor: 'rgba(16,185,129,0.15)',
  },
  resetBtnText: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#10B981'},
});
