import React, {useState, useCallback} from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, RefreshControl,
} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import Svg, {Path, Circle, Rect, Ellipse} from 'react-native-svg';
import {RootStackParamList, Bot} from '../../types';
import {marketplaceApi} from '../../services/marketplace';
import {useToast} from '../../context/ToastContext';
import {configApi} from '../../services/config';
import Badge from '../../components/common/Badge';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

// ─── Icons ────────────────────────────────────────────────────────────────────

function BotCircleIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Rect x={7} y={8} width={10} height={9} rx={2.5} stroke="#FFFFFF" strokeWidth={1.6} />
      <Path d="M10 8 L10 6 M14 8 L14 6" stroke="#FFFFFF" strokeWidth={1.6} strokeLinecap="round" />
      <Circle cx={10} cy={12} r={1.1} fill="#FFFFFF" />
      <Circle cx={14} cy={12} r={1.1} fill="#FFFFFF" />
      <Path d="M10 15.5 L14 15.5" stroke="#FFFFFF" strokeWidth={1.3} strokeLinecap="round" />
      <Path d="M4 12 L7 12 M17 12 L20 12" stroke="#FFFFFF" strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

// Inline SVG bot avatar — replaces bot.png entirely (no file dependency)
function BotAvatarSvg({size = 32}: {size?: number}) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      {/* Head */}
      <Rect x={14} y={18} width={36} height={30} rx={8} fill="#10B981" opacity={0.9} />
      {/* Eyes */}
      <Ellipse cx={24} cy={31} rx={4} ry={4} fill="#0F1117" />
      <Ellipse cx={40} cy={31} rx={4} ry={4} fill="#0F1117" />
      <Ellipse cx={25} cy={30} rx={1.5} ry={1.5} fill="#FFFFFF" />
      <Ellipse cx={41} cy={30} rx={1.5} ry={1.5} fill="#FFFFFF" />
      {/* Mouth */}
      <Rect x={23} y={38} width={18} height={3} rx={1.5} fill="#0F1117" />
      {/* Antenna */}
      <Rect x={30} y={10} width={4} height={8} rx={2} fill="#10B981" opacity={0.9} />
      <Circle cx={32} cy={9} r={3} fill="#34D399" />
      {/* Ears / side bolts */}
      <Rect x={8} y={27} width={6} height={10} rx={3} fill="#10B981" opacity={0.7} />
      <Rect x={50} y={27} width={6} height={10} rx={3} fill="#10B981" opacity={0.7} />
    </Svg>
  );
}

function BellSvg() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 17C6 17 6 15.8 6 13.5C6 9.91 8.69 7 12 7C15.31 7 18 9.91 18 13.5C18 15.8 18 17 18 17C18 17 20 17.6 20 19H4C4 17.6 6 17 6 17Z"
        stroke="rgba(255,255,255,0.65)" strokeWidth={1.5} strokeLinejoin="round"
      />
      <Path d="M10 19C10 20.1 10.9 21 12 21C13.1 21 14 20.1 14 19" stroke="rgba(255,255,255,0.65)" strokeWidth={1.5} />
      <Circle cx={17.5} cy={6.5} r={3} fill="#EF4444" />
    </Svg>
  );
}

// Proper gear/settings icon — two overlapping circles with outer teeth
function GearIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z"
        stroke="rgba(255,255,255,0.65)" strokeWidth={1.5}
      />
      <Path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
        stroke="rgba(255,255,255,0.65)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

function SearchSvg() {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
      <Circle cx={6.5} cy={6.5} r={4.5} stroke="rgba(255,255,255,0.3)" strokeWidth={1.4} />
      <Path d="M10 10 L14 14" stroke="rgba(255,255,255,0.3)" strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  );
}

function FilterLinesIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
      <Path d="M2 4 L14 4 M4 8 L12 8 M6 12 L10 12" stroke="rgba(255,255,255,0.35)" strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  );
}

// Mini bar chart — uses bot's equity data or monthly returns
function MiniBarChart({data}: {data?: number[]}) {
  const bars = data && data.length >= 2
    ? data.slice(-10) // last 10 points
    : [4, 6, 5, 8, 10, 9, 12, 14, 13, 16]; // fallback only if no data
  const max = Math.max(...bars, 1);
  const min = Math.min(...bars, 0);
  const range = max - min || 1;
  return (
    <View style={{flexDirection: 'row', alignItems: 'flex-end', gap: 3}}>
      {bars.map((val, i) => (
        <View key={i} style={{
          width: 6, height: Math.max(4, ((val - min) / range) * 44),
          backgroundColor: '#10B981', borderRadius: 2,
          opacity: 0.35 + (i / bars.length) * 0.65,
        }} />
      ))}
    </View>
  );
}

// ─── Bot grid card with bot.png ───────────────────────────────────────────────

function BotGridCard({
  bot,
  onPress,
  onPaperPress,
}: {
  bot: Bot;
  onPress: () => void;
  onPaperPress: () => void;
}) {
  const returnColor = bot.returnPercent >= 0 ? '#10B981' : '#EF4444';
  const returnSign = bot.returnPercent >= 0 ? '+' : '';
  const riskColor =
    bot.risk === 'Very Low' || bot.risk === 'Low' ? '#10B981'
    : bot.risk === 'High' || bot.risk === 'Very High' ? '#EF4444'
    : '#F59E0B';

  // Strategy tag color per design
  const tagColors: Record<string, string> = {
    'Scalping': '#A855F7',
    'High Frequency': '#EC4899',
    'HFT': '#EC4899',
    'Trend Following': '#10B981',
    'AI Momentum': '#3B82F6',
    'Arbitrage': '#06B6D4',
    'DCA': '#06B6D4',
    'Conservative': '#22D3EE',
  };
  const tagBg = tagColors[bot.strategy] || '#10B981';

  return (
    <TouchableOpacity style={gridStyles.card} onPress={onPress} activeOpacity={0.85}>
      {/* Top row: bot SVG avatar + strategy tag */}
      <View style={gridStyles.topRow}>
        <View style={gridStyles.avatarWrap}>
          <BotAvatarSvg size={32} />
        </View>
        <View style={[gridStyles.strategyTag, {backgroundColor: tagBg + '33', borderColor: tagBg + '66'}]}>
          <Text style={[gridStyles.strategyText, {color: tagBg}]} numberOfLines={1}>
            {bot.strategy}
          </Text>
        </View>
      </View>

      {/* Name + creator */}
      <Text style={gridStyles.botName} numberOfLines={1}>{bot.name}</Text>
      <Text style={gridStyles.creator} numberOfLines={1}>by {bot.creatorName}</Text>

      {/* Stats — each on its own row */}
      <View style={gridStyles.statsBlock}>
        <View style={gridStyles.statRow}>
          <Text style={gridStyles.statLabel}>30D</Text>
          <Text style={[gridStyles.statValue, {color: returnColor}]}>
            {returnSign}{bot.returnPercent.toFixed(1)}%
          </Text>
        </View>
        <View style={gridStyles.statRow}>
          <Text style={gridStyles.statLabel}>Win Rate</Text>
          <Text style={gridStyles.statValueWhite}>{bot.winRate}%</Text>
        </View>
        <View style={gridStyles.statRow}>
          <Text style={gridStyles.statLabel}>Risk</Text>
          <Text style={[gridStyles.statValue, {color: riskColor}]}>{bot.risk}</Text>
        </View>
      </View>

      {/* Divider */}
      <View style={gridStyles.divider} />

      {/* Buttons */}
      <View style={gridStyles.btnRow}>
        <TouchableOpacity
          style={gridStyles.paperBtn}
          onPress={onPaperPress}
          activeOpacity={0.7}>
          <Text style={gridStyles.paperBtnText}>Shadow</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={gridStyles.liveBtn}
          onPress={onPress}
          activeOpacity={0.7}>
          <Text style={gridStyles.liveBtnText}>Live</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

// ─── Trending card with bot.png ───────────────────────────────────────────────

function TrendingCard({bot, onPress}: {bot: Bot; onPress: () => void}) {
  const returnColor = bot.returnPercent >= 0 ? '#10B981' : '#EF4444';
  const returnSign = bot.returnPercent >= 0 ? '+' : '';
  return (
    <TouchableOpacity style={trendStyles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={trendStyles.topRow}>
        <View style={trendStyles.avatarWrap}>
          <BotAvatarSvg size={22} />
        </View>
        <Text style={trendStyles.name} numberOfLines={1}>{bot.name}</Text>
      </View>
      <Text style={[trendStyles.pct, {color: returnColor}]}>
        {returnSign}{bot.returnPercent.toFixed(1)}%
      </Text>
      <Text style={trendStyles.label}>WEEKLY</Text>
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MarketplaceScreen() {
  const navigation = useNavigation<NavProp>();
  const {alert: showAlert} = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [sortDesc, setSortDesc] = useState(true);

  const [allBots, setAllBots] = useState<Bot[]>([]);
  const [featuredBot, setFeaturedBot] = useState<Bot | null>(null);
  const [trendingBots, setTrendingBots] = useState<Bot[]>([]);
  const [categories, setCategories] = useState<string[]>(['All', 'Crypto', 'Stocks', 'Top Performers']);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [botsRes, featured, trending, config] = await Promise.all([
        marketplaceApi.getBots({limit: 50}),
        marketplaceApi.getFeaturedBot().catch(() => null),
        marketplaceApi.getTrendingBots().catch(() => []),
        configApi.getPlatformConfig().catch(() => null),
      ]);
      setAllBots(botsRes.bots);
      setFeaturedBot(featured || botsRes.bots[0] || null);
      setTrendingBots(trending.length > 0 ? trending.slice(0, 2) : botsRes.bots.slice(0, 2));
      if (config?.categories?.length) setCategories(config.categories);
    } catch {
      showAlert('Error', 'Failed to load marketplace data. Pull down to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const filteredBots = allBots
    .filter(b => {
      const matchSearch =
        b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.strategy.toLowerCase().includes(searchQuery.toLowerCase());
      const matchFilter =
        activeFilter === 'All' ||
        (activeFilter === 'Crypto' && b.category === 'Crypto') ||
        (activeFilter === 'Stocks' && b.category === 'Stocks') ||
        (activeFilter === 'Top Performers' && b.returnPercent > 20);
      return matchSearch && matchFilter;
    })
    .sort((a, b) => sortDesc
      ? b.returnPercent - a.returnPercent
      : a.returnPercent - b.returnPercent,
    );

  const isFiltering = searchQuery.length > 0 || activeFilter !== 'All';
  const displayBots = filteredBots.slice(0, isFiltering ? undefined : 6);

  const handlePaperPress = (_bot: Bot) => {
    navigation.navigate('PaperTradingSetup');
  };

  const handleSettingsPress = () => {
    navigation.navigate('NotificationSettings');
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
        <View style={styles.headerLeft}>
          <View style={styles.avatarWrap}>
            <BotCircleIcon />
          </View>
          <View>
            <Text style={styles.headerTitle}>Marketplace</Text>
            <Text style={styles.headerSub}>Discover AI Strategies</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Notifications')}>
            <BellSvg />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={handleSettingsPress}>
            <GearIcon />
          </TouchableOpacity>
        </View>
      </View>

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
        {/* Search */}
        <View style={styles.searchRow}>
          <SearchSvg />
          <TextInput
            style={styles.searchInput}
            placeholder="Search AI trading bots..."
            placeholderTextColor="rgba(255,255,255,0.25)"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <FilterLinesIcon />
        </View>

        {/* Filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filtersScroll}
          contentContainerStyle={styles.filtersContent}>
          {categories.map((f: string) => (
            <TouchableOpacity
              key={f}
              style={[styles.chip, activeFilter === f && styles.chipActive]}
              onPress={() => setActiveFilter(f)}
              activeOpacity={0.7}>
              <Text style={[styles.chipText, activeFilter === f && styles.chipTextActive]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* BOT DISCOVERY + sort */}
        <View style={styles.sectionLabelRow}>
          <Text style={styles.sectionLabel}>BOT DISCOVERY</Text>
          <TouchableOpacity
            style={styles.sortRow}
            onPress={() => setSortDesc(v => !v)}
            activeOpacity={0.7}>
            <Text style={styles.sortText}>Sort by: Returns </Text>
            <Text style={styles.sortArrow}>{sortDesc ? '↓' : '↑'}</Text>
          </TouchableOpacity>
        </View>

        {/* Featured card */}
        {featuredBot && (
        <TouchableOpacity
          style={styles.featuredCard}
          onPress={() => navigation.navigate('BotDetails', {botId: featuredBot.id})}
          activeOpacity={0.9}>
          <View style={styles.featuredTopRow}>
            <View style={{flex: 1, marginRight: 10}}>
              <Text style={styles.featuredName}>{featuredBot.name}</Text>
              <Text style={styles.featuredStrategyLabel}>{featuredBot.strategy} strategy</Text>
            </View>
            <Badge label="EDITORS CHOICE" variant="green" size="sm" />
          </View>
          <View style={styles.featuredReturnRow}>
            <View>
              <Text style={styles.featuredReturnLabel}>30D RETURNS</Text>
              <Text style={styles.featuredReturn}>+{featuredBot.returnPercent.toFixed(1)}%</Text>
            </View>
            <MiniBarChart data={featuredBot.equityData} />
          </View>
          <TouchableOpacity
            style={styles.activateNowBtn}
            onPress={() => navigation.navigate('BotDetails', {botId: featuredBot.id})}
            activeOpacity={0.85}>
            <Text style={styles.activateNowText}>Activate Now</Text>
          </TouchableOpacity>
        </TouchableOpacity>
        )}

        {/* Trending */}
        {!isFiltering && (
          <>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Trending</Text>
              <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.navigate('AllBots', {initialSort: 'return_30d'})}>
                <Text style={styles.viewAll}>View All</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.trendingRow}>
              {trendingBots.map(bot => (
                <TrendingCard
                  key={bot.id}
                  bot={bot}
                  onPress={() => navigation.navigate('BotDetails', {botId: bot.id})}
                />
              ))}
            </View>
          </>
        )}

        {/* Low Risk Picks / search results */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>
            {isFiltering ? 'Results' : 'Low Risk Picks'}
          </Text>
          {!isFiltering && (
            <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.navigate('AllBots', {})}>
              <Text style={styles.viewAll}>View All</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.gridRow}>
          {displayBots.map(bot => (
            <BotGridCard
              key={bot.id}
              bot={bot}
              onPress={() => navigation.navigate('BotDetails', {botId: bot.id})}
              onPaperPress={() => handlePaperPress(bot)}
            />
          ))}
          {displayBots.length === 0 && (
            <Text style={styles.emptyText}>No bots found matching your search.</Text>
          )}
        </View>

        {/* Browse All Button */}
        {!isFiltering && allBots.length > 4 && (
          <TouchableOpacity
            style={styles.browseAllBtn}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('AllBots', {})}>
            <Text style={styles.browseAllText}>Browse All Bots</Text>
          </TouchableOpacity>
        )}

        <View style={{height: 32}} />
      </ScrollView>
    </View>
  );
}

// ─── Grid card styles ─────────────────────────────────────────────────────────

const gridStyles = StyleSheet.create({
  card: {
    width: '48%',
    backgroundColor: '#161B22',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 12,
  },
  topRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 10,
  },
  avatarWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    padding: 4,
  },
  strategyTag: {
    borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 7, paddingVertical: 3,
    maxWidth: 82,
  },
  strategyText: {fontFamily: 'Inter-SemiBold', fontSize: 9},
  botName: {fontFamily: 'Inter-Bold', fontSize: 13, color: '#FFFFFF', marginBottom: 2},
  creator: {fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 12},
  statsBlock: {marginBottom: 12},
  statRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 5,
  },
  statLabel: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.4)'},
  statValue: {fontFamily: 'Inter-SemiBold', fontSize: 12},
  statValueWhite: {fontFamily: 'Inter-SemiBold', fontSize: 12, color: '#FFFFFF'},
  divider: {height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginBottom: 10},
  btnRow: {flexDirection: 'row', gap: 6},
  paperBtn: {
    flex: 1, height: 30, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  paperBtnText: {fontFamily: 'Inter-SemiBold', fontSize: 12, color: 'rgba(255,255,255,0.7)'},
  liveBtn: {
    flex: 1, height: 30, borderRadius: 8,
    backgroundColor: '#10B981',
    alignItems: 'center', justifyContent: 'center',
  },
  liveBtnText: {fontFamily: 'Inter-SemiBold', fontSize: 12, color: '#FFFFFF'},
});

// ─── Trending card styles ─────────────────────────────────────────────────────

const trendStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: '#161B22',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 14,
  },
  topRow: {flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10},
  avatarWrap: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    padding: 3,
  },
  name: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#FFFFFF', flex: 1},
  pct: {fontFamily: 'Inter-Bold', fontSize: 22, letterSpacing: -0.5, marginBottom: 2},
  label: {fontFamily: 'Inter-Medium', fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: 0.8},
});

// ─── Screen styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0F1117'},

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14,
  },
  headerLeft: {flexDirection: 'row', alignItems: 'center', gap: 10},
  avatarWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#10B981',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {fontFamily: 'Inter-Bold', fontSize: 16, color: '#FFFFFF'},
  headerSub: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.4)'},
  headerRight: {flexDirection: 'row', gap: 8},
  iconBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },

  scroll: {paddingHorizontal: 20},

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#1A1F2E', borderRadius: 12, paddingHorizontal: 14,
    height: 44, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 14,
  },
  searchInput: {flex: 1, fontFamily: 'Inter-Regular', fontSize: 13, color: '#FFFFFF'},

  filtersScroll: {marginBottom: 16, marginHorizontal: -20},
  filtersContent: {paddingHorizontal: 20, gap: 8},
  chip: {
    paddingHorizontal: 16, paddingVertical: 7, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  chipActive: {backgroundColor: '#10B981', borderColor: '#10B981'},
  chipText: {fontFamily: 'Inter-Medium', fontSize: 13, color: 'rgba(255,255,255,0.5)'},
  chipTextActive: {color: '#FFFFFF', fontFamily: 'Inter-SemiBold'},

  sectionLabelRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 10,
  },
  sectionLabel: {
    fontFamily: 'Inter-SemiBold', fontSize: 11, letterSpacing: 1.2,
    color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase',
  },
  sortRow: {flexDirection: 'row', alignItems: 'center'},
  sortText: {fontFamily: 'Inter-Medium', fontSize: 12, color: '#10B981'},
  sortArrow: {fontFamily: 'Inter-Medium', fontSize: 12, color: '#10B981'},

  featuredCard: {
    backgroundColor: '#161B22', borderRadius: 18,
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)',
    padding: 18, marginBottom: 24,
  },
  featuredTopRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: 14,
  },
  featuredName: {fontFamily: 'Inter-Bold', fontSize: 19, color: '#FFFFFF', marginBottom: 3},
  featuredStrategyLabel: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.4)'},
  featuredReturnRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    justifyContent: 'space-between', marginBottom: 16,
  },
  featuredReturnLabel: {
    fontFamily: 'Inter-Medium', fontSize: 10, letterSpacing: 0.8,
    color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 4,
  },
  featuredReturn: {fontFamily: 'Inter-Bold', fontSize: 34, color: '#10B981', letterSpacing: -1.2},
  activateNowBtn: {
    height: 44, backgroundColor: '#10B981', borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  activateNowText: {fontFamily: 'Inter-SemiBold', fontSize: 15, color: '#FFFFFF'},

  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 10,
  },
  sectionTitle: {fontFamily: 'Inter-Bold', fontSize: 16, color: '#FFFFFF'},
  viewAll: {fontFamily: 'Inter-Medium', fontSize: 13, color: '#10B981'},

  trendingRow: {flexDirection: 'row', gap: 10, marginBottom: 24},
  gridRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 10},
  browseAllBtn: {
    marginTop: 16, height: 48, borderRadius: 12,
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  browseAllText: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#10B981'},
  emptyText: {
    fontFamily: 'Inter-Regular', fontSize: 13,
    color: 'rgba(255,255,255,0.35)', textAlign: 'center', paddingVertical: 24, width: '100%',
  },
});
