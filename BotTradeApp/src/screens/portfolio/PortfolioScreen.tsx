import React, {useState, useCallback, useMemo} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, TextInput} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import Svg, {Path, Rect, Circle} from 'react-native-svg';
import {RootStackParamList} from '../../types';
import {portfolioApi, PortfolioSummary, PortfolioAsset, AllocationItem, PortfolioMode} from '../../services/portfolio';
import {dashboardApi, ActiveBot as DashActiveBot} from '../../services/dashboard';
import {botsService} from '../../services/bots';
import {api} from '../../services/api';
import AllocationBar from '../../components/charts/AllocationBar';

// ─── Shadow session type (for cross-referencing status) ─────────────────────
interface ShadowSessionInfo {
  id: string;
  botId: string;
  status: string;
}

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

// ─── Coin Icon ───────────────────────────────────────────────────────────────

function CoinIcon({symbol, color, size = 40}: {symbol: string; color: string; size?: number}) {
  return (
    <View style={{width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center'}}>
      <Text style={{fontFamily: 'Inter-Bold', fontSize: size * 0.38, color: '#FFFFFF'}}>{symbol.charAt(0)}</Text>
    </View>
  );
}

// ─── Search Icon ────────────────────────────────────────────────────────────

function SearchIcon({size = 16, color = 'rgba(255,255,255,0.35)'}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={7} stroke={color} strokeWidth={2} />
      <Path d="M16.5 16.5L21 21" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

// ─── Sync Icon ───────────────────────────────────────────────────────────────

function SyncIcon({size = 20, color = 'rgba(255,255,255,0.75)'}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 12C4 7.58 7.58 4 12 4C14.3 4 16.4 4.93 17.95 6.46L20 8.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M20 4V8.5H15.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M20 12C20 16.42 16.42 20 12 20C9.7 20 7.6 19.07 6.05 17.54L4 15.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M4 20V15.5H8.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ─── Connect Exchange Icon ──────────────────────────────────────────────────

function LinkIcon({size = 18}: {size?: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path d="M7.5 10.5L10.5 7.5" stroke="#10B981" strokeWidth={1.5} strokeLinecap="round" />
      <Path d="M6 12L4.5 13.5C3.67 14.33 3.67 15.67 4.5 16.5C5.33 17.33 6.67 17.33 7.5 16.5L9 15" stroke="#10B981" strokeWidth={1.5} strokeLinecap="round" />
      <Path d="M12 6L13.5 4.5C14.33 3.67 14.33 2.33 13.5 1.5C12.67 0.67 11.33 0.67 10.5 1.5L9 3" stroke="#10B981" strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PortfolioScreen() {
  const navigation = useNavigation<NavProp>();

  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [assets, setAssets] = useState<PortfolioAsset[]>([]);
  const [allocation, setAllocation] = useState<AllocationItem[]>([]);
  const [activeBots, setActiveBots] = useState<DashActiveBot[]>([]);
  const [shadowSessions, setShadowSessions] = useState<ShadowSessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [assetSearch, setAssetSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState('all'); // 'all' | 'binance' | 'alpaca' | etc.
  const [portfolioMode, setPortfolioMode] = useState<PortfolioMode | undefined>(undefined);
  const [hasLive, setHasLive] = useState(false);
  const [hasTestnet, setHasTestnet] = useState(false);

  const fetchData = useCallback(async (mode?: PortfolioMode) => {
    const activeMode = mode ?? portfolioMode;
    try {
      const [s, a, alloc, bots, shadowRes] = await Promise.all([
        portfolioApi.getSummary(activeMode).catch(() => ({totalValue: 0, totalChange24h: 0, totalChangePercent24h: 0, totalRealizedPnl: 0, closedPositions: 0, openPositions: 0}) as PortfolioSummary),
        portfolioApi.getAssets(activeMode).catch(() => [] as PortfolioAsset[]),
        portfolioApi.getAllocation(activeMode).catch(() => [] as AllocationItem[]),
        dashboardApi.getActiveBots().catch(() => [] as DashActiveBot[]),
        botsService.getShadowSessions().then((res: any) => {
          const items = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
          return items.map((s: any) => ({id: s.id, botId: s.botId, status: s.status})) as ShadowSessionInfo[];
        }).catch(() => [] as ShadowSessionInfo[]),
      ]);
      setSummary(s);
      setAssets(a);
      setAllocation(alloc);
      setActiveBots(bots);
      setShadowSessions(shadowRes);
    } catch {
      // Individual fetches have fallbacks; outer catch is a safety net
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    portfolioApi.getModes().then(({hasLive: hl, hasTestnet: ht}) => {
      setHasLive(hl);
      setHasTestnet(ht);
      const autoMode: PortfolioMode | undefined = hl ? 'live' : ht ? 'testnet' : undefined;
      setPortfolioMode(m => {
        const resolved = m ?? autoMode;
        fetchData(resolved);
        return resolved;
      });
    }).catch(() => fetchData(undefined));
  }, [fetchData]));

  const handleResync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      // Resync all connected exchanges then refresh UI
      const res = await api.get<{data: {id: string}[]}>('/exchange/user/connections').catch(() => ({data: []}));
      const connections: {id: string}[] = Array.isArray((res as any)?.data) ? (res as any).data : Array.isArray(res) ? (res as any) : [];
      await Promise.allSettled(connections.map((c: {id: string}) => api.post(`/exchange/${c.id}/resync`, {})));
      await fetchData(portfolioMode);
    } catch {
      // Best-effort
    } finally {
      setSyncing(false);
    }
  }, [syncing, fetchData]);

  // Unique providers for filter chips
  const providers = useMemo(() => {
    const set = new Map<string, string>(); // provider -> label
    for (const a of assets) {
      if (a.provider && !set.has(a.provider.toLowerCase())) {
        set.set(a.provider.toLowerCase(), a.provider.charAt(0).toUpperCase() + a.provider.slice(1));
      }
    }
    return Array.from(set.entries()).map(([key, label]) => ({key, label}));
  }, [assets]);

  // Filter by provider, then by search
  const providerFilteredAssets = useMemo(() => {
    if (providerFilter === 'all') return assets;
    return assets.filter(a => a.provider.toLowerCase() === providerFilter);
  }, [assets, providerFilter]);

  const filteredAssets = useMemo(() => {
    if (!assetSearch.trim()) return providerFilteredAssets;
    const q = assetSearch.toLowerCase();
    return providerFilteredAssets.filter(a => a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q));
  }, [providerFilteredAssets, assetSearch]);

  const totalAssetsValue = useMemo(() => providerFilteredAssets.reduce((sum, a) => sum + a.valueUsd, 0), [providerFilteredAssets]);

  // Filtered allocation
  const filteredAllocation = useMemo(() => {
    if (providerFilter === 'all') return allocation;
    const filteredSymbols = new Set(providerFilteredAssets.map(a => a.symbol));
    const filtered = allocation.filter(a => filteredSymbols.has(a.label));
    // Recalculate percentages
    const total = filtered.reduce((s, a) => s + a.value, 0);
    return filtered.map(a => ({...a, percent: total > 0 ? Number(((a.value / total) * 100).toFixed(2)) : 0}));
  }, [allocation, providerFilter, providerFilteredAssets]);

  // Filtered change24h
  const filteredChange = useMemo(() => {
    const val = providerFilteredAssets.reduce((s, a) => s + (a.valueUsd * a.change24h / 100), 0);
    const total = totalAssetsValue;
    const pct = total > 0 ? (val / total) * 100 : 0;
    return {change24h: val, changePercent: pct};
  }, [providerFilteredAssets, totalAssetsValue]);

  // Use filtered values when a provider is selected, otherwise full summary
  const totalValue = providerFilter === 'all' ? (summary?.totalValue ?? 0) : totalAssetsValue;
  const totalChange24h = providerFilter === 'all' ? (summary?.totalChange24h ?? 0) : filteredChange.change24h;
  const totalChangePercent24h = providerFilter === 'all' ? (summary?.totalChangePercent24h ?? 0) : filteredChange.changePercent;

  // Sort bots: live → paper → shadow → paused → shadow paused → done
  const sortedBots = useMemo(() => {
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
    return [...activeBots].sort((a, b) => priority(a) - priority(b));
  }, [activeBots, shadowSessions]);
  const BOTS_LIMIT = 7;
  const visibleBots = sortedBots.slice(0, BOTS_LIMIT);
  const hasMoreBots = sortedBots.length > BOTS_LIMIT;

  const isPositive = totalChangePercent24h >= 0;
  const profitColor = isPositive ? '#10B981' : '#EF4444';
  const profitSign = isPositive ? '+' : '';

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
        <View style={styles.avatarRow}>
          <View style={styles.avatarWrap}>
            <WalletIcon size={20} />
          </View>
          <View>
            <Text style={styles.appLabel}>TRADINGAPP</Text>
            <Text style={styles.screenTitle}>Portfolio</Text>
          </View>
        </View>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
          <TouchableOpacity
            style={[styles.iconBtn, syncing && {opacity: 0.5}]}
            onPress={handleResync}
            disabled={syncing}>
            {syncing
              ? <ActivityIndicator size="small" color="rgba(255,255,255,0.75)" />
              : <SyncIcon size={22} />}
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
            onRefresh={() => { setRefreshing(true); fetchData(portfolioMode); }}
            tintColor="#10B981"
            colors={['#10B981']}
            progressBackgroundColor="#161B22"
          />
        }>
        {/* Balance Section */}
        {/* Live / Testnet mode tabs — only shown when both are connected */}
        {hasLive && hasTestnet && (
          <View style={styles.modeTabs}>
            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.modeTab, portfolioMode === 'live' && styles.modeTabActive]}
              onPress={() => { setPortfolioMode('live'); fetchData('live'); }}>
              <View style={[styles.modeDot, {backgroundColor: '#10B981'}]} />
              <Text style={[styles.modeTabText, portfolioMode === 'live' && styles.modeTabTextActive]}>LIVE</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.modeTab, portfolioMode === 'testnet' && styles.modeTabActive]}
              onPress={() => { setPortfolioMode('testnet'); fetchData('testnet'); }}>
              <View style={[styles.modeDot, {backgroundColor: '#F59E0B'}]} />
              <Text style={[styles.modeTabText, portfolioMode === 'testnet' && styles.modeTabTextActive]}>TESTNET</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Testnet badge when only testnet connected */}
        {!hasLive && hasTestnet && (
          <View style={styles.testnetBanner}>
            <View style={[styles.modeDot, {backgroundColor: '#F59E0B'}]} />
            <Text style={styles.testnetBannerText}>TESTNET MODE — Test exchange balances</Text>
          </View>
        )}

        <View style={styles.balanceSection}>
          <Text style={styles.balanceLabel}>
            {providerFilter === 'all' ? 'Total Portfolio Value' : `${providers.find(p => p.key === providerFilter)?.label ?? providerFilter} Portfolio`}
          </Text>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceValue}>
              ${totalValue.toLocaleString('en-US', {minimumFractionDigits: 2})}
            </Text>
            <View style={styles.pctBadge}>
              <Text style={styles.pctBadgeText}>
                {profitSign}{totalChangePercent24h.toFixed(1)}%
              </Text>
            </View>
          </View>
          <Text style={[styles.todayProfit, {color: profitColor}]}>
            {profitSign}${totalChange24h.toFixed(2)} today
          </Text>
        </View>

        {/* Provider Filter */}
        {providers.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            <TouchableOpacity
              activeOpacity={0.7}
              style={[styles.filterChip, providerFilter === 'all' && styles.filterChipActive]}
              onPress={() => setProviderFilter('all')}>
              <Text style={[styles.filterChipText, providerFilter === 'all' && styles.filterChipTextActive]}>All</Text>
            </TouchableOpacity>
            {providers.map(p => {
              const isStock = p.key === 'alpaca';
              const activeColor = isStock ? '#3B82F6' : '#F0B90B';
              const isActive = providerFilter === p.key;
              return (
                <TouchableOpacity
                  key={p.key}
                  activeOpacity={0.7}
                  style={[styles.filterChip, isActive && {backgroundColor: `${activeColor}18`, borderColor: activeColor}]}
                  onPress={() => setProviderFilter(p.key)}>
                  <View style={[styles.filterDot, {backgroundColor: isActive ? activeColor : 'rgba(255,255,255,0.2)'}]} />
                  <Text style={[styles.filterChipText, isActive && {color: activeColor}]}>
                    {p.label}
                  </Text>
                  {isStock && <Text style={[styles.filterTag, {color: activeColor}]}>Stocks</Text>}
                  {!isStock && p.key !== 'alpaca' && <Text style={[styles.filterTag, {color: activeColor}]}>Crypto</Text>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Allocation Bar */}
        <View style={styles.allocationCard}>
          {filteredAllocation.length > 0 ? (
            <>
              <AllocationBar data={filteredAllocation} height={10} />
              <View style={styles.allocationLegend}>
                {filteredAllocation.map(item => (
                  <View key={item.label} style={styles.legendItem}>
                    <View style={[styles.legendDot, {backgroundColor: item.color}]} />
                    <Text style={styles.legendLabel}>{item.label}</Text>
                    <Text style={styles.legendPercent}>{item.percent}%</Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <View style={{paddingVertical: 16, alignItems: 'center'}}>
              <Text style={{fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.35)'}}>No allocation data</Text>
            </View>
          )}
        </View>

        {/* Assets Section */}
        <View style={styles.section}>
          {/* Header with count + total value */}
          <View style={styles.assetsHeaderRow}>
            <View style={styles.assetsHeaderLeft}>
              <Text style={styles.sectionTitle}>YOUR ASSETS</Text>
              <View style={styles.assetCountBadge}>
                <Text style={styles.assetCountText}>{assets.length}</Text>
              </View>
            </View>
            <Text style={styles.assetsTotalValue}>
              ${totalAssetsValue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            </Text>
          </View>

          {/* Search Box */}
          <View style={styles.searchContainer}>
            <SearchIcon size={16} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search assets..."
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={assetSearch}
              onChangeText={setAssetSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {assetSearch.length > 0 && (
              <TouchableOpacity onPress={() => setAssetSearch('')} activeOpacity={0.6}>
                <Text style={styles.searchClear}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Asset List */}
          <View style={styles.assetsCard}>
            {assets.length === 0 ? (
              <View style={{paddingVertical: 24, alignItems: 'center'}}>
                <Text style={{fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.35)'}}>No assets yet</Text>
              </View>
            ) : filteredAssets.length === 0 ? (
              <View style={{paddingVertical: 24, alignItems: 'center'}}>
                <Text style={{fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.35)'}}>No assets match "{assetSearch}"</Text>
              </View>
            ) : (
              <ScrollView
                style={styles.assetsScroll}
                nestedScrollEnabled
                showsVerticalScrollIndicator={filteredAssets.length > 6}>
                {filteredAssets.map((asset, idx) => {
                  const changeColor = asset.change24h >= 0 ? '#10B981' : '#EF4444';
                  const changeSign = asset.change24h >= 0 ? '+' : '';
                  const isLast = idx === filteredAssets.length - 1;
                  // Format quantity: stocks use up to 6 decimals (fractional shares),
                  // crypto uses up to 8 but trims trailing zeros
                  const isStock = asset.provider?.toLowerCase() === 'alpaca';
                  const qty = asset.amount;
                  const qtyStr = isStock
                    ? (qty % 1 === 0 ? qty.toFixed(0) : qty.toFixed(4).replace(/\.?0+$/, ''))
                    : qty >= 1
                      ? qty.toLocaleString('en-US', {maximumFractionDigits: 4})
                      : qty.toFixed(6).replace(/\.?0+$/, '');
                  const qtyLabel = isStock ? `${qtyStr} shares` : qtyStr + ' ' + asset.symbol;
                  return (
                    <View key={asset.symbol + asset.provider} style={[styles.assetRow, !isLast && styles.assetRowBorder]}>
                      <CoinIcon symbol={asset.symbol} color={asset.iconColor} size={40} />
                      <View style={styles.assetInfo}>
                        <Text style={styles.assetSymbol}>{asset.symbol}</Text>
                        <Text style={styles.assetName}>{qtyLabel}</Text>
                      </View>
                      <View style={styles.assetRight}>
                        <Text style={styles.assetValue}>
                          ${asset.valueUsd.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                        </Text>
                        <Text style={[styles.assetChange, {color: changeColor}]}>
                          {changeSign}{asset.change24h.toFixed(1)}%
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>

        {/* Active Bots Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
              <Text style={styles.sectionTitle}>ACTIVE BOTS</Text>
              {sortedBots.length > 0 && (
                <View style={{backgroundColor: 'rgba(16,185,129,0.15)', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, marginBottom: 10}}>
                  <Text style={{fontFamily: 'Inter-Bold', fontSize: 11, color: '#10B981'}}>{sortedBots.length}</Text>
                </View>
              )}
            </View>
            {sortedBots.length > 0 && (
              <TouchableOpacity onPress={() => navigation.navigate('ActiveBots')}>
                <Text style={styles.sectionAction}>View All</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.botList}>
            {sortedBots.length === 0 && (
              <View style={{paddingVertical: 24, alignItems: 'center'}}>
                <Text style={{fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.35)'}}>No active bots</Text>
              </View>
            )}
            {visibleBots.map((bot: DashActiveBot) => {
              const returnColor = bot.totalReturn >= 0 ? '#10B981' : '#EF4444';
              const returnSign = bot.totalReturn >= 0 ? '+' : '';
              const display = resolveBotDisplayStatus(bot, shadowSessions);
              return (
                <TouchableOpacity
                  key={`${bot.id}-${bot.subscriptionId}`}
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
                  {display.label === 'LIVE' && (
                    <TouchableOpacity
                      style={{backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: 8, padding: 7, borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)'}}
                      onPress={() => navigation.navigate('BotLiveFeed', {botId: bot.id, botName: bot.name, mode: 'live'})}
                      activeOpacity={0.7}>
                      <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                        <Path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" fill="#10B981" />
                      </Svg>
                    </TouchableOpacity>
                  )}
                  {display.label === 'SHADOW' && display.icon === 'running' && (
                    <TouchableOpacity
                      style={{backgroundColor: 'rgba(59,130,246,0.1)', borderRadius: 8, padding: 7, borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)'}}
                      onPress={() => navigation.navigate('BotLiveFeed', {botId: bot.id, botName: bot.name, mode: 'paper'})}
                      activeOpacity={0.7}>
                      <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                        <Path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" fill="#3B82F6" />
                      </Svg>
                    </TouchableOpacity>
                  )}
                  {display.icon === 'completed' && (
                    <TouchableOpacity
                      style={{backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)'}}
                      onPress={() => navigation.navigate('BotPurchase', {botId: bot.id})}
                      activeOpacity={0.7}>
                      <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 11, color: '#10B981'}}>Go Live</Text>
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

        {/* Connect Exchange Banner */}
        <TouchableOpacity
          style={styles.connectBanner}
          onPress={() => navigation.navigate('ExchangeConnect')}
          activeOpacity={0.8}>
          <View style={styles.connectLeft}>
            <View style={styles.connectIconWrap}>
              <LinkIcon size={18} />
            </View>
            <View style={styles.connectTextWrap}>
              <Text style={styles.connectTitle}>Connect more exchanges</Text>
              <Text style={styles.connectSubtitle}>Sync your full portfolio across platforms</Text>
            </View>
          </View>
          <View style={styles.connectBtn}>
            <Text style={styles.connectBtnText}>Connect</Text>
          </View>
        </TouchableOpacity>

        <View style={{height: 24}} />
      </ScrollView>
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
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#10B981',
    alignItems: 'center', justifyContent: 'center',
  },
  appLabel: {
    fontFamily: 'Inter-Medium', fontSize: 10, letterSpacing: 1.2,
    color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase',
  },
  screenTitle: {fontFamily: 'Inter-Bold', fontSize: 18, color: '#FFFFFF', letterSpacing: -0.3},
  iconBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  scrollContent: {paddingHorizontal: 20},

  // Balance
  balanceSection: {marginBottom: 20},
  balanceLabel: {fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 6},
  balanceRow: {flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4},
  balanceValue: {fontFamily: 'Inter-Bold', fontSize: 36, color: '#FFFFFF', letterSpacing: -1.2},
  pctBadge: {backgroundColor: 'rgba(16,185,129,0.18)', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4},
  pctBadgeText: {fontFamily: 'Inter-SemiBold', fontSize: 12, color: '#10B981'},
  todayProfit: {fontFamily: 'Inter-Medium', fontSize: 13},

  // Allocation
  modeTabs: {flexDirection: 'row', marginHorizontal: 20, marginBottom: 12, gap: 8},
  modeTab: {flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)'},
  modeTabActive: {backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.25)'},
  modeTabText: {fontFamily: 'Inter-SemiBold', fontSize: 12, color: 'rgba(255,255,255,0.45)', letterSpacing: 0.5},
  modeTabTextActive: {color: '#FFFFFF'},
  modeDot: {width: 7, height: 7, borderRadius: 4},
  testnetBanner: {flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, marginBottom: 12, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(245,158,11,0.1)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)'},
  testnetBannerText: {fontFamily: 'Inter-Medium', fontSize: 12, color: '#F59E0B'},
  filterRow: {flexDirection: 'row', gap: 8, marginBottom: 14, paddingRight: 8},
  filterChip: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', gap: 6},
  filterChipActive: {backgroundColor: 'rgba(16,185,129,0.12)', borderColor: '#10B981'},
  filterChipText: {fontFamily: 'Inter-SemiBold', fontSize: 12, color: 'rgba(255,255,255,0.4)'},
  filterChipTextActive: {color: '#10B981'},
  filterDot: {width: 6, height: 6, borderRadius: 3},
  filterTag: {fontFamily: 'Inter-Regular', fontSize: 10, opacity: 0.7},
  allocationCard: {
    backgroundColor: '#161B22', borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    padding: 16, marginBottom: 20,
  },
  allocationLegend: {flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, gap: 4},
  legendItem: {flexDirection: 'row', alignItems: 'center', marginRight: 12, marginBottom: 4},
  legendDot: {width: 8, height: 8, borderRadius: 4, marginRight: 6},
  legendLabel: {fontFamily: 'Inter-Medium', fontSize: 12, color: 'rgba(255,255,255,0.6)', marginRight: 3},
  legendPercent: {fontFamily: 'Inter-SemiBold', fontSize: 12, color: '#FFFFFF'},

  // Sections
  section: {marginBottom: 20},
  sectionHeaderRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10},
  sectionTitle: {fontFamily: 'Inter-Bold', fontSize: 13, color: 'rgba(255,255,255,0.5)', letterSpacing: 1, marginBottom: 10},
  sectionAction: {fontFamily: 'Inter-Medium', fontSize: 13, color: '#10B981'},

  // Assets header
  assetsHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10,
  },
  assetsHeaderLeft: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  assetCountBadge: {
    backgroundColor: 'rgba(16,185,129,0.15)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 2, marginBottom: 10,
  },
  assetCountText: {
    fontFamily: 'Inter-Bold', fontSize: 11, color: '#10B981',
  },
  assetsTotalValue: {
    fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#10B981', marginBottom: 10,
  },

  // Search
  searchContainer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#161B22', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 14, marginBottom: 10, gap: 10,
  },
  searchInput: {
    flex: 1, fontFamily: 'Inter-Regular', fontSize: 14,
    color: '#FFFFFF', paddingVertical: 12,
  },
  searchClear: {
    fontFamily: 'Inter-Medium', fontSize: 14, color: 'rgba(255,255,255,0.4)',
    padding: 4,
  },

  // Assets
  assetsScroll: {
    maxHeight: 420,
  },
  assetsCard: {
    backgroundColor: '#161B22', borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 16,
  },
  assetRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 14},
  assetRowBorder: {borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)'},
  assetInfo: {flex: 1, marginLeft: 12},
  assetSymbol: {fontFamily: 'Inter-SemiBold', fontSize: 15, color: '#FFFFFF', marginBottom: 2},
  assetName: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.4)'},
  assetRight: {alignItems: 'flex-end'},
  assetValue: {fontFamily: 'Inter-SemiBold', fontSize: 15, color: '#FFFFFF', marginBottom: 2},
  assetChange: {fontFamily: 'Inter-Medium', fontSize: 12},

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
  botInfo: {flex: 1},
  botNameRow: {flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3},
  botName: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF', flexShrink: 1},
  liveDot: {width: 7, height: 7, borderRadius: 4}, // kept for compat
  botAvatarText: {fontFamily: 'Inter-Bold', fontSize: 16, color: '#FFFFFF'},
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
    flexShrink: 0,
  },
  statusBadgeDot: {width: 5, height: 5, borderRadius: 3},
  statusBadgeText: {fontFamily: 'Inter-Bold', fontSize: 9, letterSpacing: 0.5},
  botPair: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.4)'},

  // Connect Exchange Banner
  connectBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(16,185,129,0.06)',
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)',
    padding: 16,
  },
  connectLeft: {flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12},
  connectIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(16,185,129,0.15)',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  connectTextWrap: {flex: 1},
  connectTitle: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#FFFFFF', marginBottom: 2},
  connectSubtitle: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.4)'},
  connectBtn: {
    backgroundColor: '#10B981', borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  connectBtnText: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#FFFFFF'},
});
