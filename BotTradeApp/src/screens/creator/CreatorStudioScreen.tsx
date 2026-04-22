import React, {useState, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from 'react-native';
import Svg, {Path, Circle} from 'react-native-svg';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../types';
import {useToast} from '../../context/ToastContext';
import {useIAP} from '../../context/IAPContext';
import {useAuth} from '../../context/AuthContext';
import {
  creatorApi,
  CreatorStats,
  CreatorBot,
  MonthlyRevenue,
  AiSuggestion,
  EarningsSummary,
  EarningsProjection,
  EngagementMetrics,
  UserProfitability,
  RevenueProjection,
  MarketingFunnel,
  Experiment,
  ExperimentResults,
  PatternAnalysis,
  UserBotBreakdown,
} from '../../services/creator';

type TabKey = 'overview' | 'earnings' | 'analytics' | 'abtests' | 'patterns';

function EditIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Path
        d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"
        stroke="#FFFFFF"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
        stroke="#FFFFFF"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function PublishIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Path
        d="M22 2L11 13M22 2L15 22 11 13 2 9l20-7z"
        stroke="#FFFFFF"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const {width} = Dimensions.get('window');
type Nav = NativeStackNavigationProp<RootStackParamList>;

// ─── Icons ──────────────────────────────────────────────────────────────────

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

function StarIcon({filled}: {filled: boolean}) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"
        fill={filled ? '#F59E0B' : 'rgba(255,255,255,0.15)'}
        stroke={filled ? '#F59E0B' : 'rgba(255,255,255,0.15)'}
        strokeWidth={1}
      />
    </Svg>
  );
}

function SparkleIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2L14.4 8.4 21 10 14.4 13.2 12 20 9.6 13.2 3 10 9.6 8.4 12 2z"
        fill="#10B981"
        stroke="#10B981"
        strokeWidth={1}
        strokeLinejoin="round"
      />
    </Svg>
  );
}


function DollarIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} stroke="#10B981" strokeWidth={1.5} />
      <Path d="M12 6v12M9 9.5a2.5 2.5 0 012.5-2.5h1a2.5 2.5 0 010 5h-1A2.5 2.5 0 009 14.5v0A2.5 2.5 0 0011.5 17h1A2.5 2.5 0 0015 14.5"
        stroke="#10B981" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function TrendUpIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d="M23 6l-9.5 9.5-5-5L1 18" stroke="#10B981" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M17 6h6v6" stroke="#10B981" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ─── Revenue Bar Chart ──────────────────────────────────────────────────────

function RevenueBarChart({data}: {data: MonthlyRevenue[]}) {
  const values = data.map(d => d.revenue);
  const labels = data.map(d => d.month);
  const maxVal = Math.max(...values, 1);
  const maxH = 100;
  const barCount = values.length;
  const chartWidth = width - 64;
  const barW = barCount > 0 ? (chartWidth - (barCount - 1) * 8) / barCount : 48;

  return (
    <View style={chartStyles.container}>
      <View style={chartStyles.barsRow}>
        {values.map((val, i) => {
          const h = (val / maxVal) * maxH;
          return (
            <View key={i} style={chartStyles.barCol}>
              <Text style={chartStyles.barValue}>${val}</Text>
              <View
                style={[
                  chartStyles.bar,
                  {height: h, width: barW, maxWidth: 48},
                ]}
              />
              <Text style={chartStyles.barLabel}>{labels[i]}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const chartStyles = StyleSheet.create({
  container: {marginTop: 12},
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  barCol: {alignItems: 'center', flex: 1},
  bar: {
    backgroundColor: '#10B981',
    borderRadius: 4,
    marginVertical: 4,
  },
  barValue: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
  },
  barLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
  },
});

// ─── Earnings Calculator ────────────────────────────────────────────────────

function EarningsCalculator({projections}: {projections: EarningsProjection[]}) {
  const [followers, setFollowers] = useState(1000);
  const [avgProfit, setAvgProfit] = useState(1000);
  const feePercent = projections.length > 0 ? projections[0].creatorFeePercent : 10;
  const platformPercent = projections.length > 0 ? projections[0].platformFeePercent : 3;

  const totalSubscriberProfit = followers * avgProfit;
  const creatorEarning = totalSubscriberProfit * (feePercent / 100);
  const platformFee = totalSubscriberProfit * (platformPercent / 100);

  const presets = [
    {label: '100', val: 100},
    {label: '500', val: 500},
    {label: '1K', val: 1000},
    {label: '5K', val: 5000},
  ];

  const profitPresets = [
    {label: '$500', val: 500},
    {label: '$1K', val: 1000},
    {label: '$5K', val: 5000},
    {label: '$10K', val: 10000},
  ];

  return (
    <View style={calcStyles.container}>
      <View style={calcStyles.header}>
        <DollarIcon />
        <Text style={calcStyles.title}>Earnings Calculator</Text>
      </View>

      {/* Fee Model */}
      <View style={calcStyles.feeModelCard}>
        <Text style={calcStyles.feeModelLabel}>YOUR FEE MODEL</Text>
        <Text style={calcStyles.feeModelValue}>
          Creator fee = <Text style={calcStyles.feeHighlight}>{feePercent}%</Text> of subscriber profits
        </Text>
        <Text style={calcStyles.feeModelSub}>
          Platform takes <Text style={{color: '#F59E0B'}}>{platformPercent}%</Text>
        </Text>
      </View>

      {/* Followers selector */}
      <Text style={calcStyles.paramLabel}>If followers:</Text>
      <View style={calcStyles.presetRow}>
        {presets.map(p => (
          <TouchableOpacity
            key={p.val}
            style={[calcStyles.presetChip, followers === p.val && calcStyles.presetChipActive]}
            onPress={() => setFollowers(p.val)}
            activeOpacity={0.7}>
            <Text style={[calcStyles.presetText, followers === p.val && calcStyles.presetTextActive]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Avg profit selector */}
      <Text style={calcStyles.paramLabel}>Each earns:</Text>
      <View style={calcStyles.presetRow}>
        {profitPresets.map(p => (
          <TouchableOpacity
            key={p.val}
            style={[calcStyles.presetChip, avgProfit === p.val && calcStyles.presetChipActive]}
            onPress={() => setAvgProfit(p.val)}
            activeOpacity={0.7}>
            <Text style={[calcStyles.presetText, avgProfit === p.val && calcStyles.presetTextActive]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Result */}
      <View style={calcStyles.resultCard}>
        <Text style={calcStyles.resultLabel}>Creator makes:</Text>
        <Text style={calcStyles.resultValue}>
          ${creatorEarning.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}
        </Text>
        <View style={calcStyles.resultDivider} />
        <View style={calcStyles.breakdownRow}>
          <Text style={calcStyles.breakdownLabel}>Total subscriber profits</Text>
          <Text style={calcStyles.breakdownValue}>
            ${totalSubscriberProfit.toLocaleString('en-US')}
          </Text>
        </View>
        <View style={calcStyles.breakdownRow}>
          <Text style={calcStyles.breakdownLabel}>Your {feePercent}% fee</Text>
          <Text style={[calcStyles.breakdownValue, {color: '#10B981'}]}>
            +${creatorEarning.toLocaleString('en-US')}
          </Text>
        </View>
        <View style={calcStyles.breakdownRow}>
          <Text style={calcStyles.breakdownLabel}>Platform {platformPercent}% fee</Text>
          <Text style={[calcStyles.breakdownValue, {color: '#F59E0B'}]}>
            -${platformFee.toLocaleString('en-US')}
          </Text>
        </View>
      </View>
    </View>
  );
}

const calcStyles = StyleSheet.create({
  container: {
    backgroundColor: '#161B22',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.2)',
    padding: 18,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  title: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  feeModelCard: {
    backgroundColor: 'rgba(16,185,129,0.06)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  feeModelLabel: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1,
    marginBottom: 6,
  },
  feeModelValue: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  feeHighlight: {
    color: '#10B981',
    fontFamily: 'Inter-Bold',
  },
  feeModelSub: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 4,
  },
  paramLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 8,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  presetChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  presetChipActive: {
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderColor: '#10B981',
  },
  presetText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  presetTextActive: {
    color: '#10B981',
  },
  resultCard: {
    backgroundColor: 'rgba(16,185,129,0.06)',
    borderRadius: 14,
    padding: 16,
    marginTop: 4,
  },
  resultLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 4,
  },
  resultValue: {
    fontFamily: 'Inter-Bold',
    fontSize: 32,
    color: '#10B981',
  },
  resultDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 12,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  breakdownLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  breakdownValue: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
});

// ─── Main Component ─────────────────────────────────────────────────────────

export default function CreatorStudioScreen() {
  const navigation = useNavigation<Nav>();
  const {alert: showAlert, showConfirm} = useToast();
  const {isPro, initialized: iapInitialized} = useIAP();
  const {user} = useAuth();

  // Pro gate — wait for IAP to finish initializing before redirecting
  React.useEffect(() => {
    if (!iapInitialized) return;
    if (!isPro && user?.role !== 'admin') {
      showAlert('Pro Required', 'Creator Studio requires an active Pro subscription.');
      navigation.replace('Subscription');
    }
  }, [iapInitialized, isPro, user?.role, navigation, showAlert]);
  const [stats, setStats] = useState<CreatorStats | null>(null);
  const [bots, setBots] = useState<CreatorBot[]>([]);
  const [monthlyRevenue, setMonthlyRevenue] = useState<MonthlyRevenue[]>([]);
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestion[]>([]);
  const [earnings, setEarnings] = useState<EarningsSummary | null>(null);
  const [projections, setProjections] = useState<EarningsProjection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeSection, setActiveSection] = useState<TabKey>('overview');

  // Analytics state
  const [engagement, setEngagement] = useState<EngagementMetrics | null>(null);
  const [profitability, setProfitability] = useState<UserProfitability | null>(null);
  const [revProjections, setRevProjections] = useState<RevenueProjection[]>([]);
  const [funnel, setFunnel] = useState<MarketingFunnel | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // A/B Tests state
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [experimentResults, setExperimentResults] = useState<ExperimentResults | null>(null);
  const [selectedExperiment, setSelectedExperiment] = useState<Experiment | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newExpName, setNewExpName] = useState('');
  const [newExpDesc, setNewExpDesc] = useState('');
  const [newExpBotId, setNewExpBotId] = useState('');
  const [experimentsLoading, setExperimentsLoading] = useState(false);

  // Patterns state
  const [selectedPatternBot, setSelectedPatternBot] = useState<string | null>(null);
  const [patternAnalysis, setPatternAnalysis] = useState<PatternAnalysis | null>(null);
  const [patternsLoading, setPatternsLoading] = useState(false);

  const fetchData = useCallback(() => {
    Promise.all([
      creatorApi.getStats(),
      creatorApi.getBots(),
      creatorApi.getMonthlyRevenue(),
      creatorApi.getAiSuggestions(),
      creatorApi.getEarnings(),
      creatorApi.getEarningsProjection(),
    ])
      .then(([s, b, mr, ai, e, p]) => {
        const latestMonthRev = mr.length > 0 ? mr[mr.length - 1].revenue : 0;
        setStats({...s, monthlyRevenue: latestMonthRev});
        setBots(b);
        setMonthlyRevenue(mr);
        setAiSuggestions(ai);
        setEarnings(e);
        setProjections(p);
      })
      .catch(() => showAlert('Error', 'Failed to load creator data. Pull down to retry.'))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, []);

  const fetchAnalytics = useCallback(() => {
    setAnalyticsLoading(true);
    Promise.all([
      creatorApi.getEngagement(),
      creatorApi.getUserProfitability(),
      creatorApi.getRevenueProjection(),
      creatorApi.getMarketingFunnel(),
    ])
      .then(([eng, prof, rev, fun]) => {
        setEngagement(eng);
        setProfitability(prof);
        setRevProjections(rev);
        setFunnel(fun);
      })
      .catch(() => showAlert('Error', 'Failed to load analytics.'))
      .finally(() => setAnalyticsLoading(false));
  }, []);

  const fetchExperiments = useCallback(() => {
    setExperimentsLoading(true);
    creatorApi.getExperiments()
      .then(setExperiments)
      .catch(() => showAlert('Error', 'Failed to load experiments.'))
      .finally(() => setExperimentsLoading(false));
  }, []);

  const fetchPatterns = useCallback((botId: string) => {
    setPatternsLoading(true);
    setPatternAnalysis(null);
    creatorApi.getBotPatterns(botId)
      .then(setPatternAnalysis)
      .catch(() => showAlert('Error', 'Failed to load pattern analysis.'))
      .finally(() => setPatternsLoading(false));
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const renderStars = (rating: number) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(<StarIcon key={i} filled={i <= Math.round(rating)} />);
    }
    return stars;
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
          onPress={() => navigation.goBack()}
          hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
          <BackArrow />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Creator Studio</Text>
        <View style={{width: 22}} />
      </View>

      {/* Section Tabs */}
      <View style={styles.tabBarContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sectionTabs}>
          {([
            {key: 'overview' as TabKey, label: 'Overview'},
            {key: 'earnings' as TabKey, label: 'Earnings'},
            {key: 'analytics' as TabKey, label: 'Analytics'},
            {key: 'abtests' as TabKey, label: 'A/B Tests'},
            {key: 'patterns' as TabKey, label: 'Patterns'},
          ]).map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.sectionTab, activeSection === tab.key && styles.sectionTabActive]}
              activeOpacity={0.7}
              onPress={() => {
                setActiveSection(tab.key);
                if (tab.key === 'analytics' && !engagement) fetchAnalytics();
                if (tab.key === 'abtests' && (!experiments || experiments.length === 0)) fetchExperiments();
              }}>
              <Text style={[styles.sectionTabText, activeSection === tab.key && styles.sectionTabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
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

        {activeSection === 'overview' && (
          <>
            {/* Revenue Metric Cards */}
            <View style={styles.metricsRow}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Total Revenue</Text>
                <Text style={styles.metricValue}>
                  ${(stats?.totalRevenue ?? 0).toLocaleString('en-US', {minimumFractionDigits: 2})}
                </Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Monthly</Text>
                <Text style={styles.metricValue}>
                  ${(stats?.monthlyRevenue ?? 0).toLocaleString('en-US', {minimumFractionDigits: 2})}
                </Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Followers</Text>
                <Text style={styles.metricValue}>
                  {stats?.totalUsers ?? 0}
                </Text>
              </View>
            </View>

            {/* Revenue Chart */}
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>MONTHLY REVENUE</Text>
              <RevenueBarChart data={monthlyRevenue} />
            </View>

            {/* Your Bots — Per-Bot Monitoring */}
            <View style={styles.botsSectionHeader}>
              <Text style={styles.sectionTitle}>Your Bots</Text>
              <TouchableOpacity
                style={styles.newBotBtn}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('BotBuilder' as any)}>
                <Text style={styles.newBotBtnText}>+ New Bot</Text>
              </TouchableOpacity>
            </View>
            {bots.length === 0 ? (
              <View style={[styles.card, {alignItems: 'center', paddingVertical: 24}]}>
                <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 14, color: 'rgba(255,255,255,0.4)', marginBottom: 4}}>No bots created yet</Text>
                <TouchableOpacity onPress={() => navigation.navigate('BotBuilder' as any)} activeOpacity={0.7}>
                  <Text style={{fontFamily: 'Inter-Regular', fontSize: 12, color: '#10B981'}}>Build your first bot</Text>
                </TouchableOpacity>
              </View>
            ) : bots.map((bot) => (
              <View key={bot.id} style={bm.card}>
                {/* Bot Header */}
                <View style={bm.header}>
                  <View style={[bm.avatar, {backgroundColor: bot.avatarColor || '#8B5CF6'}]}>
                    <Text style={bm.avatarText}>{bot.avatarLetter || bot.name.charAt(0)}</Text>
                  </View>
                  <View style={bm.headerInfo}>
                    <View style={bm.nameRow}>
                      <Text style={bm.name} numberOfLines={1}>{bot.name}</Text>
                      <View style={[bm.statusPill, bot.isPublished ? bm.statusLive : bm.statusDraft]}>
                        <Text style={[bm.statusText, bot.isPublished ? bm.statusLiveText : bm.statusDraftText]}>
                          {bot.isPublished ? 'LIVE' : 'DRAFT'}
                        </Text>
                      </View>
                    </View>
                    <Text style={bm.subtitle}>{bot.strategy} · {bot.category} · {bot.riskLevel} Risk</Text>
                  </View>
                </View>

                {/* Key Performance Row */}
                <View style={bm.perfRow}>
                  <View style={bm.perfItem}>
                    <Text style={[bm.perfValue, {color: bot.returnPercent >= 0 ? '#10B981' : '#EF4444'}]}>
                      {bot.returnPercent >= 0 ? '+' : ''}{bot.returnPercent.toFixed(1)}%
                    </Text>
                    <Text style={bm.perfLabel}>30d Return</Text>
                  </View>
                  <View style={bm.perfDivider} />
                  <View style={bm.perfItem}>
                    <Text style={bm.perfValue}>{bot.winRate.toFixed(0)}%</Text>
                    <Text style={bm.perfLabel}>Win Rate</Text>
                  </View>
                  <View style={bm.perfDivider} />
                  <View style={bm.perfItem}>
                    <Text style={[bm.perfValue, {color: '#F59E0B'}]}>
                      ${bot.totalEarnings.toFixed(2)}
                    </Text>
                    <Text style={bm.perfLabel}>Earnings</Text>
                  </View>
                  <View style={bm.perfDivider} />
                  <View style={bm.perfItem}>
                    <View style={{flexDirection: 'row', alignItems: 'center', gap: 3}}>
                      <StarIcon filled />
                      <Text style={bm.perfValue}>{bot.rating.toFixed(1)}</Text>
                    </View>
                    <Text style={bm.perfLabel}>{bot.reviewCount} reviews</Text>
                  </View>
                </View>

                {/* Trade & Decision Stats */}
                <View style={bm.statsGrid}>
                  <View style={bm.statBox}>
                    <Text style={bm.statNum}>{bot.totalSubscribers}</Text>
                    <Text style={bm.statLabel}>Subscribers</Text>
                  </View>
                  <View style={bm.statBox}>
                    <Text style={[bm.statNum, {color: '#3B82F6'}]}>{bot.totalUsers}</Text>
                    <Text style={bm.statLabel}>Active Users</Text>
                  </View>
                  <View style={bm.statBox}>
                    <Text style={bm.statNum}>{bot.totalDecisions}</Text>
                    <Text style={bm.statLabel}>Decisions</Text>
                  </View>
                  <View style={bm.statBox}>
                    <Text style={[bm.statNum, {color: '#10B981'}]}>{bot.totalBuys}</Text>
                    <Text style={bm.statLabel}>Buys</Text>
                  </View>
                  <View style={bm.statBox}>
                    <Text style={[bm.statNum, {color: '#EF4444'}]}>{bot.totalSells}</Text>
                    <Text style={bm.statLabel}>Sells</Text>
                  </View>
                  <View style={bm.statBox}>
                    <Text style={[bm.statNum, {color: '#6B7280'}]}>{bot.totalHolds}</Text>
                    <Text style={bm.statLabel}>Holds</Text>
                  </View>
                </View>

                {/* Positions & P&L */}
                <View style={bm.pnlRow}>
                  <View>
                    <Text style={bm.pnlLabel}>Positions</Text>
                    <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 1}}>
                      {bot.openPositions} open · {bot.closedPositions} closed
                    </Text>
                  </View>
                  <View style={{alignItems: 'flex-end'}}>
                    <Text style={[bm.pnlValue, {color: bot.totalPnl >= 0 ? '#10B981' : '#EF4444'}]}>
                      {bot.totalPnl >= 0 ? '+' : ''}${bot.totalPnl.toFixed(2)}
                    </Text>
                    <Text style={{fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.35)'}}>
                      Total P&L
                    </Text>
                  </View>
                </View>

                {/* Per-User Trade Analysis */}
                {bot.userBreakdown.length > 0 && (
                  <View style={bm.userSection}>
                    <Text style={bm.userSectionTitle}>USER ACTIVITY ({bot.userBreakdown.length})</Text>
                    {bot.userBreakdown.map((u: UserBotBreakdown) => (
                      <View key={u.userId} style={bm.userRow}>
                        <View style={bm.userAvatar}>
                          <Text style={bm.userAvatarText}>{(u.name || '?').charAt(0).toUpperCase()}</Text>
                        </View>
                        <View style={bm.userInfo}>
                          <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                            <Text style={bm.userName} numberOfLines={1}>{u.name || 'User'}</Text>
                            <View style={[bm.userModePill, {backgroundColor: u.mode === 'live' ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)'}]}>
                              <Text style={[bm.userModeText, {color: u.mode === 'live' ? '#EF4444' : '#10B981'}]}>
                                {u.mode === 'live' ? 'LIVE' : 'SHADOW'}
                              </Text>
                            </View>
                            <View style={[bm.userModePill, {backgroundColor: u.status === 'active' ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.06)'}]}>
                              <Text style={[bm.userModeText, {color: u.status === 'active' ? '#3B82F6' : 'rgba(255,255,255,0.3)'}]}>
                                {u.status.toUpperCase()}
                              </Text>
                            </View>
                          </View>
                          <View style={bm.userStatsRow}>
                            <Text style={bm.userStatText}>{u.decisions} decisions</Text>
                            <Text style={bm.userStatDot}>·</Text>
                            <Text style={[bm.userStatText, {color: '#10B981'}]}>{u.buys} buys</Text>
                            <Text style={bm.userStatDot}>·</Text>
                            <Text style={[bm.userStatText, {color: '#EF4444'}]}>{u.sells} sells</Text>
                            <Text style={bm.userStatDot}>·</Text>
                            <Text style={bm.userStatText}>{u.positions} pos</Text>
                          </View>
                        </View>
                        <View style={bm.userPnlCol}>
                          <Text style={[bm.userPnlText, {color: u.pnl >= 0 ? '#10B981' : '#EF4444'}]}>
                            {u.pnl >= 0 ? '+' : ''}${u.pnl.toFixed(2)}
                          </Text>
                          <Text style={bm.userTradesText}>{u.trades} trades</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* Trading Pairs */}
                {bot.pairs.length > 0 && (
                  <View style={bm.pairsRow}>
                    {bot.pairs.map((pair, pi) => (
                      <View key={pi} style={bm.pairChip}>
                        <Text style={bm.pairText}>{pair}</Text>
                      </View>
                    ))}
                    <Text style={bm.feeChip}>{bot.creatorFeePercent}% fee</Text>
                  </View>
                )}

                {/* Action Buttons */}
                <View style={bm.actions}>
                  <TouchableOpacity
                    style={bm.actionBtn}
                    activeOpacity={0.7}
                    onPress={() => navigation.navigate('BotDetails', {botId: bot.id})}>
                    <Text style={bm.actionBtnText}>View Details</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={bm.editActionBtn}
                    activeOpacity={0.7}
                    onPress={() => navigation.navigate('BotBuilder', {editBotId: bot.id})}>
                    <EditIcon />
                    <Text style={bm.editActionText}>Edit</Text>
                  </TouchableOpacity>
                  {!bot.isPublished && (
                    <TouchableOpacity
                      style={bm.publishActionBtn}
                      activeOpacity={0.7}
                      onPress={() => {
                        showConfirm({
                          title: 'Publish Bot',
                          message: `Publish "${bot.name}" to the marketplace?`,
                          confirmText: 'Publish',
                          onConfirm: async () => {
                            try {
                              await creatorApi.publishBot(bot.id);
                              showAlert('Published!', `${bot.name} is now live.`);
                              fetchData();
                            } catch (e: any) {
                              showAlert('Error', e?.message || 'Failed to publish.');
                            }
                          },
                        });
                      }}>
                      <PublishIcon />
                      <Text style={bm.publishActionText}>Publish</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}

            {/* AI Suggestions */}
            <View style={styles.aiCard}>
              <View style={styles.aiHeader}>
                <SparkleIcon />
                <Text style={styles.aiTitle}>AI Suggestions</Text>
              </View>
              {aiSuggestions.map((suggestion, i) => (
                <View key={suggestion.id || i} style={styles.suggestionRow}>
                  <View style={styles.bulletDot} />
                  <Text style={styles.suggestionText}>{suggestion.description}</Text>
                </View>
              ))}
            </View>

            {/* Reviews Summary */}
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>REVIEWS</Text>
              <View style={styles.reviewSummary}>
                <Text style={styles.avgRating}>
                  {stats?.avgRating ?? 0}
                </Text>
                <View style={styles.reviewRight}>
                  <View style={styles.starsRow}>
                    {renderStars(stats?.avgRating ?? 0)}
                  </View>
                  <Text style={styles.reviewCount}>
                    {stats?.reviewCount ?? 0} reviews
                  </Text>
                </View>
              </View>
            </View>
          </>
        )}

        {activeSection === 'earnings' && (
          <>
            {/* ─── EARNINGS TAB ─────────────────────────────────── */}

            {/* Earnings Overview Cards */}
            <View style={styles.metricsRow}>
              <View style={[styles.metricCard, {borderColor: 'rgba(16,185,129,0.2)'}]}>
                <Text style={styles.metricLabel}>Total Earned</Text>
                <Text style={[styles.metricValue, {color: '#10B981'}]}>
                  ${(earnings?.totalEarnings ?? 0).toLocaleString('en-US', {minimumFractionDigits: 2})}
                </Text>
              </View>
              <View style={[styles.metricCard, {borderColor: 'rgba(245,158,11,0.2)'}]}>
                <Text style={styles.metricLabel}>Pending</Text>
                <Text style={[styles.metricValue, {color: '#F59E0B'}]}>
                  ${(earnings?.pendingPayout ?? 0).toLocaleString('en-US', {minimumFractionDigits: 2})}
                </Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Followers</Text>
                <Text style={styles.metricValue}>{earnings?.activeSubscribers ?? 0}</Text>
              </View>
            </View>

            {/* How Creators Earn */}
            <View style={styles.howItWorksCard}>
              <Text style={styles.howItWorksTitle}>How Creators Earn Money</Text>

              <View style={styles.howStep}>
                <View style={styles.howStepNum}><Text style={styles.howStepNumText}>1</Text></View>
                <View style={{flex: 1}}>
                  <Text style={styles.howStepTitle}>Users follow your bot</Text>
                  <Text style={styles.howStepDesc}>Subscribers allocate capital and your bot trades for them</Text>
                </View>
              </View>

              <View style={styles.howStep}>
                <View style={styles.howStepNum}><Text style={styles.howStepNumText}>2</Text></View>
                <View style={{flex: 1}}>
                  <Text style={styles.howStepTitle}>They earn profits</Text>
                  <Text style={styles.howStepDesc}>When your bot makes profitable trades for subscribers</Text>
                </View>
              </View>

              <View style={styles.howStep}>
                <View style={styles.howStepNum}><Text style={styles.howStepNumText}>3</Text></View>
                <View style={{flex: 1}}>
                  <Text style={styles.howStepTitle}>You take your fee</Text>
                  <Text style={styles.howStepDesc}>You earn a % of their profits. Set your fee in Bot Builder.</Text>
                </View>
              </View>

              <View style={styles.howDivider} />

              <View style={styles.howFeeRow}>
                <Text style={styles.howFeeLabel}>Creator fee</Text>
                <Text style={styles.howFeeValue}>
                  <Text style={{color: '#10B981', fontFamily: 'Inter-Bold'}}>
                    {bots.length > 0 ? bots[0].creatorFeePercent : 10}%
                  </Text> of subscriber profits
                </Text>
              </View>
              <View style={styles.howFeeRow}>
                <Text style={styles.howFeeLabel}>Platform fee</Text>
                <Text style={styles.howFeeValue}>
                  <Text style={{color: '#F59E0B', fontFamily: 'Inter-Bold'}}>
                    {bots.length > 0 ? bots[0].platformFeePercent : 3}%
                  </Text>
                </Text>
              </View>
            </View>

            {/* Earnings Calculator */}
            <EarningsCalculator projections={projections} />

            {/* Per-Bot Earnings Breakdown */}
            {earnings && earnings.botEarnings.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, {marginBottom: 10, marginTop: 4}]}>
                  Earnings by Bot
                </Text>
                {earnings.botEarnings.map(be => (
                  <View key={be.botId} style={styles.botEarningCard}>
                    <View style={{flex: 1}}>
                      <Text style={styles.botEarningName}>{be.botName}</Text>
                      <Text style={styles.botEarningMeta}>
                        {be.transactions} transactions · ${be.totalSubscriberProfit.toLocaleString()} subscriber profits
                      </Text>
                    </View>
                    <Text style={styles.botEarningAmount}>
                      +${be.totalEarning.toLocaleString('en-US', {minimumFractionDigits: 2})}
                    </Text>
                  </View>
                ))}
              </>
            )}

            {/* Recent Earnings */}
            {earnings && earnings.recentEarnings.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, {marginBottom: 10, marginTop: 16}]}>
                  Recent Earnings
                </Text>
                <View style={styles.card}>
                  {earnings.recentEarnings.slice(0, 10).map((e, i) => (
                    <View key={e.id}>
                      <View style={styles.earningRow}>
                        <View style={{flex: 1}}>
                          <Text style={styles.earningBotName}>{e.botName}</Text>
                          <Text style={styles.earningMeta}>
                            {parseFloat(e.creatorFeePercent)}% of ${parseFloat(e.subscriberProfit).toLocaleString()} profit
                          </Text>
                        </View>
                        <View style={{alignItems: 'flex-end'}}>
                          <Text style={styles.earningAmount}>
                            +${parseFloat(e.creatorEarning).toLocaleString('en-US', {minimumFractionDigits: 2})}
                          </Text>
                          <View style={[
                            styles.earningStatusBadge,
                            {backgroundColor: e.status === 'paid' ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)'},
                          ]}>
                            <Text style={[
                              styles.earningStatusText,
                              {color: e.status === 'paid' ? '#10B981' : '#F59E0B'},
                            ]}>
                              {e.status === 'paid' ? 'Paid' : 'Pending'}
                            </Text>
                          </View>
                        </View>
                      </View>
                      {i < earnings.recentEarnings.length - 1 && i < 9 && (
                        <View style={styles.divider} />
                      )}
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* Empty state for earnings */}
            {(!earnings || (earnings.botEarnings.length === 0 && earnings.recentEarnings.length === 0)) && (
              <View style={styles.emptyEarnings}>
                <TrendUpIcon />
                <Text style={styles.emptyEarningsTitle}>No earnings yet</Text>
                <Text style={styles.emptyEarningsText}>
                  Publish your bot and attract followers. You'll earn {bots.length > 0 ? bots[0].creatorFeePercent : 10}% of every
                  profit your subscribers make.
                </Text>
              </View>
            )}
          </>
        )}

        {/* ─── ANALYTICS TAB ─────────────────────────────────── */}
        {activeSection === 'analytics' && (
          <>
            {analyticsLoading ? (
              <View style={{alignItems: 'center', paddingVertical: 40}}>
                <ActivityIndicator size="large" color="#10B981" />
                <Text style={{fontFamily: 'Inter-Medium', fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 12}}>Loading analytics...</Text>
              </View>
            ) : (
              <>
                {/* Engagement Summary */}
                <Text style={[styles.sectionTitle, {marginBottom: 10}]}>Engagement</Text>
                <View style={styles.metricsRow}>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricLabel}>Total Views</Text>
                    <Text style={styles.metricValue}>{(engagement?.totalViews ?? 0).toLocaleString()}</Text>
                  </View>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricLabel}>Purchases</Text>
                    <Text style={styles.metricValue}>{engagement?.totalPurchases ?? 0}</Text>
                  </View>
                </View>
                <View style={styles.metricsRow}>
                  <View style={[styles.metricCard, {borderColor: 'rgba(16,185,129,0.2)'}]}>
                    <Text style={styles.metricLabel}>Growth Rate</Text>
                    <Text style={[styles.metricValue, {color: '#10B981'}]}>
                      {(engagement?.subscriberGrowthRate ?? 0).toFixed(1)}%
                    </Text>
                  </View>
                  <View style={[styles.metricCard, {borderColor: 'rgba(239,68,68,0.2)'}]}>
                    <Text style={styles.metricLabel}>Churn Rate</Text>
                    <Text style={[styles.metricValue, {color: '#EF4444'}]}>
                      {(engagement?.churnRate ?? 0).toFixed(1)}%
                    </Text>
                  </View>
                </View>

                {/* User Profitability */}
                <Text style={[styles.sectionTitle, {marginBottom: 10, marginTop: 4}]}>User Profitability</Text>
                <View style={styles.card}>
                  {/* Profit Distribution Bar */}
                  <Text style={[styles.sectionLabel, {marginBottom: 10}]}>PROFIT DISTRIBUTION</Text>
                  {profitability && (() => {
                    const total = (profitability.profitDistribution.profitable + profitability.profitDistribution.breakeven + profitability.profitDistribution.losing) || 1;
                    const profPct = (profitability.profitDistribution.profitable / total) * 100;
                    const bePct = (profitability.profitDistribution.breakeven / total) * 100;
                    const lossPct = (profitability.profitDistribution.losing / total) * 100;
                    return (
                      <>
                        <View style={analyticsStyles.distBar}>
                          {profPct > 0 && <View style={[analyticsStyles.distSegment, {flex: profPct, backgroundColor: '#10B981'}]} />}
                          {bePct > 0 && <View style={[analyticsStyles.distSegment, {flex: bePct, backgroundColor: '#F59E0B'}]} />}
                          {lossPct > 0 && <View style={[analyticsStyles.distSegment, {flex: lossPct, backgroundColor: '#EF4444'}]} />}
                        </View>
                        <View style={analyticsStyles.distLegend}>
                          <View style={analyticsStyles.distLegendItem}>
                            <View style={[analyticsStyles.distDot, {backgroundColor: '#10B981'}]} />
                            <Text style={analyticsStyles.distLegendText}>Profitable ({profitability.profitDistribution.profitable})</Text>
                          </View>
                          <View style={analyticsStyles.distLegendItem}>
                            <View style={[analyticsStyles.distDot, {backgroundColor: '#F59E0B'}]} />
                            <Text style={analyticsStyles.distLegendText}>Breakeven ({profitability.profitDistribution.breakeven})</Text>
                          </View>
                          <View style={analyticsStyles.distLegendItem}>
                            <View style={[analyticsStyles.distDot, {backgroundColor: '#EF4444'}]} />
                            <Text style={analyticsStyles.distLegendText}>Losing ({profitability.profitDistribution.losing})</Text>
                          </View>
                        </View>
                      </>
                    );
                  })()}

                  {/* Top Earners */}
                  {profitability && profitability.topEarners.length > 0 && (
                    <>
                      <Text style={[styles.sectionLabel, {marginTop: 16, marginBottom: 8}]}>TOP EARNERS</Text>
                      {profitability.topEarners.slice(0, 5).map((earner, i) => (
                        <View key={earner.userId} style={analyticsStyles.earnerRow}>
                          <View style={analyticsStyles.earnerRank}>
                            <Text style={analyticsStyles.earnerRankText}>#{i + 1}</Text>
                          </View>
                          <View style={{flex: 1}}>
                            <Text style={analyticsStyles.earnerName}>{earner.username}</Text>
                            <Text style={analyticsStyles.earnerBot}>{earner.botName}</Text>
                          </View>
                          <Text style={analyticsStyles.earnerProfit}>
                            +${earner.totalProfit.toLocaleString('en-US', {minimumFractionDigits: 2})}
                          </Text>
                        </View>
                      ))}
                    </>
                  )}
                </View>

                {/* Revenue Projections */}
                <Text style={[styles.sectionTitle, {marginBottom: 10, marginTop: 4}]}>Revenue Projection (6 Months)</Text>
                {(() => {
                  const sixMonth = revProjections.find(p => p.months === 6);
                  if (!sixMonth) return (
                    <View style={styles.card}>
                      <Text style={{fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center'}}>No projection data available</Text>
                    </View>
                  );
                  return (
                    <View style={{gap: 8, marginBottom: 16}}>
                      <View style={[analyticsStyles.projCard, {borderColor: 'rgba(16,185,129,0.3)'}]}>
                        <Text style={analyticsStyles.projLabel}>Optimistic</Text>
                        <Text style={[analyticsStyles.projValue, {color: '#10B981'}]}>
                          ${sixMonth.optimistic.toLocaleString('en-US', {minimumFractionDigits: 0})}
                        </Text>
                      </View>
                      <View style={[analyticsStyles.projCard, {borderColor: 'rgba(96,165,250,0.3)'}]}>
                        <Text style={analyticsStyles.projLabel}>Realistic</Text>
                        <Text style={[analyticsStyles.projValue, {color: '#60A5FA'}]}>
                          ${sixMonth.realistic.toLocaleString('en-US', {minimumFractionDigits: 0})}
                        </Text>
                      </View>
                      <View style={[analyticsStyles.projCard, {borderColor: 'rgba(239,68,68,0.3)'}]}>
                        <Text style={analyticsStyles.projLabel}>Pessimistic</Text>
                        <Text style={[analyticsStyles.projValue, {color: '#EF4444'}]}>
                          ${sixMonth.pessimistic.toLocaleString('en-US', {minimumFractionDigits: 0})}
                        </Text>
                      </View>
                    </View>
                  );
                })()}

                {/* Marketing Funnel */}
                <Text style={[styles.sectionTitle, {marginBottom: 10, marginTop: 4}]}>Marketing Funnel</Text>
                {funnel && (
                  <View style={styles.card}>
                    <View style={analyticsStyles.funnelStep}>
                      <View style={[analyticsStyles.funnelBox, {backgroundColor: 'rgba(96,165,250,0.15)'}]}>
                        <Text style={[analyticsStyles.funnelBoxLabel, {color: '#60A5FA'}]}>Published</Text>
                        <Text style={[analyticsStyles.funnelBoxValue, {color: '#60A5FA'}]}>{funnel.published}</Text>
                      </View>
                      <Text style={analyticsStyles.funnelArrow}>{funnel.publishedToPurchased.toFixed(1)}%</Text>
                    </View>
                    <View style={analyticsStyles.funnelStep}>
                      <View style={[analyticsStyles.funnelBox, {backgroundColor: 'rgba(245,158,11,0.15)'}]}>
                        <Text style={[analyticsStyles.funnelBoxLabel, {color: '#F59E0B'}]}>Purchased</Text>
                        <Text style={[analyticsStyles.funnelBoxValue, {color: '#F59E0B'}]}>{funnel.purchased}</Text>
                      </View>
                      <Text style={analyticsStyles.funnelArrow}>{funnel.purchasedToActive.toFixed(1)}%</Text>
                    </View>
                    <View style={analyticsStyles.funnelStep}>
                      <View style={[analyticsStyles.funnelBox, {backgroundColor: 'rgba(16,185,129,0.15)'}]}>
                        <Text style={[analyticsStyles.funnelBoxLabel, {color: '#10B981'}]}>Active</Text>
                        <Text style={[analyticsStyles.funnelBoxValue, {color: '#10B981'}]}>{funnel.active}</Text>
                      </View>
                      <Text style={analyticsStyles.funnelArrow}>{funnel.activeToRetained.toFixed(1)}%</Text>
                    </View>
                    <View style={analyticsStyles.funnelStep}>
                      <View style={[analyticsStyles.funnelBox, {backgroundColor: 'rgba(139,92,246,0.15)'}]}>
                        <Text style={[analyticsStyles.funnelBoxLabel, {color: '#8B5CF6'}]}>Retained</Text>
                        <Text style={[analyticsStyles.funnelBoxValue, {color: '#8B5CF6'}]}>{funnel.retained}</Text>
                      </View>
                    </View>
                  </View>
                )}
              </>
            )}
          </>
        )}

        {/* ─── A/B TESTS TAB ─────────────────────────────────── */}
        {activeSection === 'abtests' && (
          <>
            {experimentsLoading ? (
              <View style={{alignItems: 'center', paddingVertical: 40}}>
                <ActivityIndicator size="large" color="#10B981" />
              </View>
            ) : selectedExperiment ? (
              <>
                {/* Experiment Results Detail */}
                <TouchableOpacity
                  onPress={() => { setSelectedExperiment(null); setExperimentResults(null); }}
                  style={{flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14}}>
                  <BackArrow />
                  <Text style={{fontFamily: 'Inter-Medium', fontSize: 14, color: 'rgba(255,255,255,0.7)'}}>Back to experiments</Text>
                </TouchableOpacity>
                <Text style={[styles.sectionTitle, {marginBottom: 6}]}>{selectedExperiment.name}</Text>
                <Text style={{fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 16}}>
                  {selectedExperiment.description}
                </Text>
                {!experimentResults ? (
                  <View style={{alignItems: 'center', paddingVertical: 30}}>
                    <ActivityIndicator size="small" color="#10B981" />
                    <Text style={{fontFamily: 'Inter-Medium', fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 10}}>Loading results...</Text>
                  </View>
                ) : (
                  <>
                    {/* Confidence Meter */}
                    <View style={[styles.card, {alignItems: 'center'}]}>
                      <Text style={styles.sectionLabel}>STATISTICAL CONFIDENCE</Text>
                      <View style={abStyles.confidenceBar}>
                        <View style={[abStyles.confidenceFill, {width: `${Math.min(experimentResults.confidence, 100)}%`}]} />
                      </View>
                      <Text style={abStyles.confidenceText}>{experimentResults.confidence.toFixed(1)}%</Text>
                      {experimentResults.winner !== 'none' && (
                        <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#10B981', marginTop: 8}}>
                          Variant {experimentResults.winner} is winning
                        </Text>
                      )}
                    </View>

                    {/* Variant Comparison */}
                    <View style={{flexDirection: 'row', gap: 10, marginBottom: 16}}>
                      <View style={[abStyles.variantCard, experimentResults.winner === 'A' && abStyles.variantWinner]}>
                        <Text style={abStyles.variantLabel}>Variant A</Text>
                        <Text style={abStyles.variantStat}>{experimentResults.variantA.users} users</Text>
                        <Text style={[abStyles.variantReturn, {color: '#10B981'}]}>
                          {experimentResults.variantA.avgReturn.toFixed(2)}% avg return
                        </Text>
                        <Text style={abStyles.variantProfit}>
                          ${experimentResults.variantA.avgProfit.toLocaleString('en-US', {minimumFractionDigits: 2})}
                        </Text>
                      </View>
                      <View style={[abStyles.variantCard, experimentResults.winner === 'B' && abStyles.variantWinner]}>
                        <Text style={abStyles.variantLabel}>Variant B</Text>
                        <Text style={abStyles.variantStat}>{experimentResults.variantB.users} users</Text>
                        <Text style={[abStyles.variantReturn, {color: '#60A5FA'}]}>
                          {experimentResults.variantB.avgReturn.toFixed(2)}% avg return
                        </Text>
                        <Text style={abStyles.variantProfit}>
                          ${experimentResults.variantB.avgProfit.toLocaleString('en-US', {minimumFractionDigits: 2})}
                        </Text>
                      </View>
                    </View>

                    {/* Stop button for running experiments */}
                    {selectedExperiment.status === 'running' && (
                      <TouchableOpacity
                        style={abStyles.stopBtn}
                        activeOpacity={0.7}
                        onPress={() => {
                          showConfirm({
                            title: 'Stop Experiment',
                            message: `Stop "${selectedExperiment.name}"? This cannot be undone.`,
                            confirmText: 'Stop',
                            onConfirm: async () => {
                              try {
                                await creatorApi.stopExperiment(selectedExperiment.id);
                                showAlert('Stopped', 'Experiment has been stopped.');
                                setSelectedExperiment(null);
                                setExperimentResults(null);
                                fetchExperiments();
                              } catch (e: any) {
                                showAlert('Error', e?.message || 'Failed to stop experiment.');
                              }
                            },
                          });
                        }}>
                        <Text style={abStyles.stopBtnText}>Stop Experiment</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                {/* Experiments List */}
                <View style={styles.botsSectionHeader}>
                  <Text style={styles.sectionTitle}>Experiments</Text>
                  <TouchableOpacity
                    style={styles.newBotBtn}
                    activeOpacity={0.7}
                    onPress={() => {
                      setShowCreateForm(true);
                      if (bots.length > 0 && !newExpBotId) setNewExpBotId(bots[0].id);
                    }}>
                    <Text style={styles.newBotBtnText}>+ New Test</Text>
                  </TouchableOpacity>
                </View>

                {/* Create Form */}
                {showCreateForm && (
                  <View style={[styles.card, {borderColor: 'rgba(16,185,129,0.3)'}]}>
                    <Text style={[styles.sectionLabel, {marginBottom: 12}]}>CREATE EXPERIMENT</Text>

                    {/* Bot Selector */}
                    <Text style={abStyles.formLabel}>Select Bot</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 12}}>
                      <View style={{flexDirection: 'row', gap: 8}}>
                        {bots.map(b => (
                          <TouchableOpacity
                            key={b.id}
                            style={[abStyles.botChip, newExpBotId === b.id && abStyles.botChipActive]}
                            onPress={() => setNewExpBotId(b.id)}>
                            <Text style={[abStyles.botChipText, newExpBotId === b.id && abStyles.botChipTextActive]}>{b.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>

                    <Text style={abStyles.formLabel}>Name</Text>
                    <TextInput
                      style={abStyles.input}
                      value={newExpName}
                      onChangeText={setNewExpName}
                      placeholder="e.g. Aggressive vs Conservative"
                      placeholderTextColor="rgba(255,255,255,0.25)"
                    />

                    <Text style={abStyles.formLabel}>Description</Text>
                    <TextInput
                      style={[abStyles.input, {height: 60, textAlignVertical: 'top'}]}
                      value={newExpDesc}
                      onChangeText={setNewExpDesc}
                      placeholder="What are you testing?"
                      placeholderTextColor="rgba(255,255,255,0.25)"
                      multiline
                    />

                    <View style={{flexDirection: 'row', gap: 10, marginTop: 4}}>
                      <TouchableOpacity
                        style={[abStyles.formBtn, {backgroundColor: 'rgba(255,255,255,0.08)'}]}
                        onPress={() => { setShowCreateForm(false); setNewExpName(''); setNewExpDesc(''); }}>
                        <Text style={{fontFamily: 'Inter-Medium', fontSize: 13, color: 'rgba(255,255,255,0.6)'}}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[abStyles.formBtn, {backgroundColor: '#10B981', flex: 2}]}
                        onPress={async () => {
                          if (!newExpName.trim() || !newExpBotId) {
                            showAlert('Required', 'Please select a bot and enter a name.');
                            return;
                          }
                          try {
                            await creatorApi.createExperiment({
                              botId: newExpBotId,
                              name: newExpName.trim(),
                              description: newExpDesc.trim(),
                              variantAConfig: {},
                              variantBConfig: {},
                            });
                            showAlert('Created', 'Experiment created successfully.');
                            setShowCreateForm(false);
                            setNewExpName('');
                            setNewExpDesc('');
                            fetchExperiments();
                          } catch (e: any) {
                            showAlert('Error', e?.message || 'Failed to create experiment.');
                          }
                        }}>
                        <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#FFFFFF'}}>Create</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {experiments.length === 0 && !showCreateForm ? (
                  <View style={styles.emptyEarnings}>
                    <SparkleIcon />
                    <Text style={styles.emptyEarningsTitle}>No experiments yet</Text>
                    <Text style={styles.emptyEarningsText}>
                      Create an A/B test to compare different bot configurations and find what works best.
                    </Text>
                  </View>
                ) : (
                  experiments.map(exp => (
                    <TouchableOpacity
                      key={exp.id}
                      style={abStyles.expCard}
                      activeOpacity={0.7}
                      onPress={() => {
                        setSelectedExperiment(exp);
                        creatorApi.getExperimentResults(exp.id)
                          .then(setExperimentResults)
                          .catch(() => showAlert('Error', 'Failed to load results.'));
                      }}>
                      <View style={{flex: 1}}>
                        <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4}}>
                          <Text style={abStyles.expName}>{exp.name}</Text>
                          <View style={[
                            abStyles.expStatusBadge,
                            {backgroundColor: exp.status === 'running' ? 'rgba(16,185,129,0.15)' :
                              exp.status === 'completed' ? 'rgba(96,165,250,0.15)' : 'rgba(245,158,11,0.15)'},
                          ]}>
                            <Text style={[
                              abStyles.expStatusText,
                              {color: exp.status === 'running' ? '#10B981' :
                                exp.status === 'completed' ? '#60A5FA' : '#F59E0B'},
                            ]}>
                              {exp.status.toUpperCase()}
                            </Text>
                          </View>
                        </View>
                        <Text style={abStyles.expDesc}>{exp.description}</Text>
                      </View>
                      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                        <Path d="M9 5l7 7-7 7" stroke="rgba(255,255,255,0.3)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                      </Svg>
                    </TouchableOpacity>
                  ))
                )}
              </>
            )}
          </>
        )}

        {/* ─── PATTERNS TAB ─────────────────────────────────── */}
        {activeSection === 'patterns' && (
          <>
            {selectedPatternBot && patternAnalysis ? (
              <>
                <TouchableOpacity
                  onPress={() => { setSelectedPatternBot(null); setPatternAnalysis(null); }}
                  style={{flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14}}>
                  <BackArrow />
                  <Text style={{fontFamily: 'Inter-Medium', fontSize: 14, color: 'rgba(255,255,255,0.7)'}}>Back to bots</Text>
                </TouchableOpacity>

                <Text style={[styles.sectionTitle, {marginBottom: 14}]}>{patternAnalysis.botName}</Text>

                {/* Score Cards */}
                <View style={styles.metricsRow}>
                  <View style={[styles.metricCard, {borderColor: 'rgba(16,185,129,0.2)'}]}>
                    <Text style={styles.metricLabel}>Risk Score</Text>
                    <Text style={[styles.metricValue, {color: patternAnalysis.riskScore > 70 ? '#EF4444' : patternAnalysis.riskScore > 40 ? '#F59E0B' : '#10B981'}]}>
                      {patternAnalysis.riskScore}/100
                    </Text>
                  </View>
                  <View style={[styles.metricCard, {borderColor: 'rgba(96,165,250,0.2)'}]}>
                    <Text style={styles.metricLabel}>Consistency</Text>
                    <Text style={[styles.metricValue, {color: '#60A5FA'}]}>
                      {patternAnalysis.consistencyScore}/100
                    </Text>
                  </View>
                </View>

                {/* Detected Patterns */}
                <View style={styles.card}>
                  <Text style={[styles.sectionLabel, {marginBottom: 10}]}>DETECTED PATTERNS</Text>
                  {patternAnalysis.patterns.length === 0 ? (
                    <Text style={{fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.4)'}}>No patterns detected yet.</Text>
                  ) : (
                    patternAnalysis.patterns.map((p, i) => (
                      <View key={i} style={patternStyles.patternRow}>
                        <View style={patternStyles.patternDot} />
                        <View style={{flex: 1}}>
                          <Text style={patternStyles.patternName}>{p.name}</Text>
                          <Text style={patternStyles.patternDesc}>{p.description}</Text>
                          <Text style={patternStyles.patternFreq}>{p.frequency}</Text>
                        </View>
                      </View>
                    ))
                  )}
                </View>

                {/* Market Correlations */}
                {patternAnalysis.marketCorrelations.length > 0 && (
                  <View style={styles.card}>
                    <Text style={[styles.sectionLabel, {marginBottom: 10}]}>MARKET CORRELATIONS</Text>
                    {patternAnalysis.marketCorrelations.map((mc, i) => (
                      <View key={i} style={patternStyles.corrRow}>
                        <Text style={patternStyles.corrMarket}>{mc.market}</Text>
                        <View style={patternStyles.corrBarBg}>
                          <View style={[patternStyles.corrBarFill, {
                            width: `${Math.abs(mc.correlation) * 100}%`,
                            backgroundColor: mc.correlation >= 0 ? '#10B981' : '#EF4444',
                          }]} />
                        </View>
                        <Text style={[patternStyles.corrValue, {color: mc.correlation >= 0 ? '#10B981' : '#EF4444'}]}>
                          {mc.correlation > 0 ? '+' : ''}{mc.correlation.toFixed(2)}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Suggested Improvements */}
                {patternAnalysis.suggestedImprovements.length > 0 && (
                  <View style={[styles.aiCard]}>
                    <View style={styles.aiHeader}>
                      <SparkleIcon />
                      <Text style={styles.aiTitle}>Suggested Improvements</Text>
                    </View>
                    {patternAnalysis.suggestedImprovements.map((s, i) => (
                      <View key={i} style={styles.suggestionRow}>
                        <View style={styles.bulletDot} />
                        <Text style={styles.suggestionText}>{s}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </>
            ) : patternsLoading ? (
              <View style={{alignItems: 'center', paddingVertical: 40}}>
                <ActivityIndicator size="large" color="#10B981" />
                <Text style={{fontFamily: 'Inter-Medium', fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 12}}>
                  AI is analyzing patterns...
                </Text>
              </View>
            ) : (
              <>
                <Text style={[styles.sectionTitle, {marginBottom: 10}]}>Select a Bot</Text>
                <Text style={{fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 16}}>
                  Tap a bot to run AI pattern detection and analysis.
                </Text>
                {bots.length === 0 ? (
                  <View style={styles.emptyEarnings}>
                    <Text style={styles.emptyEarningsTitle}>No bots yet</Text>
                    <Text style={styles.emptyEarningsText}>Create a bot first to analyze its trading patterns.</Text>
                  </View>
                ) : (
                  bots.map(bot => (
                    <TouchableOpacity
                      key={bot.id}
                      style={patternStyles.botSelectCard}
                      activeOpacity={0.7}
                      onPress={() => {
                        setSelectedPatternBot(bot.id);
                        fetchPatterns(bot.id);
                      }}>
                      <View style={{flex: 1}}>
                        <Text style={patternStyles.botSelectName}>{bot.name}</Text>
                        <Text style={patternStyles.botSelectMeta}>
                          {bot.users} users · +{bot.returnPercent}% return
                        </Text>
                      </View>
                      <View style={patternStyles.analyzeBtn}>
                        <SparkleIcon />
                        <Text style={patternStyles.analyzeBtnText}>Analyze</Text>
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </>
            )}
          </>
        )}

        <View style={{height: 40}} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

// ─── Per-Bot Monitoring Card Styles ──────────────────────────────────────────

const bm = StyleSheet.create({
  card: {
    backgroundColor: '#161B22',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 16,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: 'Inter-Bold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  headerInfo: {flex: 1},
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: '#FFFFFF',
    flex: 1,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusLive: {backgroundColor: 'rgba(16,185,129,0.15)'},
  statusDraft: {backgroundColor: 'rgba(255,255,255,0.08)'},
  statusText: {fontFamily: 'Inter-Bold', fontSize: 9, letterSpacing: 0.8},
  statusLiveText: {color: '#10B981'},
  statusDraftText: {color: 'rgba(255,255,255,0.4)'},
  subtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  perfRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginBottom: 12,
  },
  perfItem: {flex: 1, alignItems: 'center'},
  perfDivider: {width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.06)'},
  perfValue: {
    fontFamily: 'Inter-Bold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  perfLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  statBox: {
    width: (width - 80) / 3,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  statNum: {
    fontFamily: 'Inter-Bold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  statLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  pnlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  pnlLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  pnlValue: {
    fontFamily: 'Inter-Bold',
    fontSize: 16,
  },
  pairsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
    alignItems: 'center',
  },
  pairChip: {
    backgroundColor: 'rgba(59,130,246,0.12)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.2)',
  },
  pairText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    color: '#3B82F6',
  },
  feeChip: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    marginLeft: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.25)',
  },
  actionBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    color: '#10B981',
  },
  editActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  editActionText: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
  publishActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
  },
  publishActionText: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: '#8B5CF6',
  },
  // Per-user breakdown
  userSection: {
    marginBottom: 14,
  },
  userSectionTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 1,
    marginBottom: 10,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    gap: 10,
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(139,92,246,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: {
    fontFamily: 'Inter-Bold',
    fontSize: 13,
    color: '#8B5CF6',
  },
  userInfo: {flex: 1, gap: 3},
  userName: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    color: '#FFFFFF',
    maxWidth: 100,
  },
  userModePill: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  userModeText: {
    fontFamily: 'Inter-Bold',
    fontSize: 8,
    letterSpacing: 0.5,
  },
  userStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexWrap: 'wrap',
  },
  userStatText: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
  },
  userStatDot: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.2)',
  },
  userPnlCol: {
    alignItems: 'flex-end',
  },
  userPnlText: {
    fontFamily: 'Inter-Bold',
    fontSize: 13,
  },
  userTradesText: {
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E14',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 54,
    paddingBottom: 10,
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 18,
    color: '#FFFFFF',
  },
  tabBarContainer: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  sectionTabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
  },
  sectionTab: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center' as const,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  sectionTabActive: {
    borderBottomColor: '#10B981',
  },
  sectionTabText: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: 'rgba(255,255,255,0.35)',
  },
  sectionTabTextActive: {
    color: '#10B981',
    fontFamily: 'Inter-SemiBold',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#161B22',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  metricLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 6,
  },
  metricValue: {
    fontFamily: 'Inter-Bold',
    fontSize: 15,
    color: '#FFFFFF',
  },
  card: {
    backgroundColor: '#161B22',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 16,
    marginBottom: 16,
  },
  sectionLabel: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1,
    marginBottom: 4,
  },
  sectionTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  botsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 4,
  },
  newBotBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(16,185,129,0.15)',
  },
  newBotBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: '#10B981',
  },
  aiCard: {
    backgroundColor: '#161B22',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
    padding: 16,
    marginBottom: 16,
  },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  aiTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
    color: '#FFFFFF',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 10,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginTop: 6,
  },
  suggestionText: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    flex: 1,
    lineHeight: 19,
  },
  reviewSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 16,
  },
  avgRating: {
    fontFamily: 'Inter-Bold',
    fontSize: 36,
    color: '#FFFFFF',
  },
  reviewRight: {
    gap: 4,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 3,
  },
  reviewCount: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },

  // ─── Earnings Tab ──────────────────────────────────
  howItWorksCard: {
    backgroundColor: '#161B22',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 18,
    marginBottom: 16,
  },
  howItWorksTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: 17,
    color: '#FFFFFF',
    marginBottom: 18,
  },
  howStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  howStepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(16,185,129,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  howStepNumText: {
    fontFamily: 'Inter-Bold',
    fontSize: 13,
    color: '#10B981',
  },
  howStepTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  howStepDesc: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 18,
  },
  howDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 14,
  },
  howFeeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  howFeeLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  howFeeValue: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
  },

  // Bot Earnings
  botEarningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161B22',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 14,
    marginBottom: 8,
  },
  botEarningName: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  botEarningMeta: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
  },
  botEarningAmount: {
    fontFamily: 'Inter-Bold',
    fontSize: 16,
    color: '#10B981',
  },

  // Recent Earnings
  earningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  earningBotName: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  earningMeta: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
  },
  earningAmount: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: '#10B981',
    marginBottom: 4,
  },
  earningStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  earningStatusText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 10,
  },

  // Empty
  emptyEarnings: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyEarningsTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
  },
  emptyEarningsText: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 30,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 4,
  },
});

// ─── Analytics Styles ────────────────────────────────────────────────────────

const analyticsStyles = StyleSheet.create({
  distBar: {
    flexDirection: 'row',
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 12,
  },
  distSegment: {
    height: '100%',
  },
  distLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  distLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  distDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  distLegendText: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  earnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  earnerRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(16,185,129,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  earnerRankText: {
    fontFamily: 'Inter-Bold',
    fontSize: 11,
    color: '#10B981',
  },
  earnerName: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: '#FFFFFF',
  },
  earnerBot: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
  },
  earnerProfit: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: '#10B981',
  },
  projCard: {
    backgroundColor: '#161B22',
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  projLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
  },
  projValue: {
    fontFamily: 'Inter-Bold',
    fontSize: 20,
  },
  funnelStep: {
    alignItems: 'center',
    marginBottom: 4,
  },
  funnelBox: {
    width: '100%',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  funnelBoxLabel: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
  },
  funnelBoxValue: {
    fontFamily: 'Inter-Bold',
    fontSize: 18,
  },
  funnelArrow: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    paddingVertical: 6,
  },
});

// ─── A/B Test Styles ─────────────────────────────────────────────────────────

const abStyles = StyleSheet.create({
  confidenceBar: {
    width: '100%',
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginTop: 12,
    overflow: 'hidden',
  },
  confidenceFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 5,
  },
  confidenceText: {
    fontFamily: 'Inter-Bold',
    fontSize: 24,
    color: '#FFFFFF',
    marginTop: 8,
  },
  variantCard: {
    flex: 1,
    backgroundColor: '#161B22',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 14,
    alignItems: 'center',
    gap: 4,
  },
  variantWinner: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16,185,129,0.06)',
  },
  variantLabel: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  variantStat: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  variantReturn: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
  },
  variantProfit: {
    fontFamily: 'Inter-Bold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  stopBtn: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  stopBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: '#EF4444',
  },
  expCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161B22',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 14,
    marginBottom: 8,
  },
  expName: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  expStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  expStatusText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 9,
    letterSpacing: 0.5,
  },
  expDesc: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  formLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 6,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 12,
  },
  botChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  botChipActive: {
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderColor: '#10B981',
  },
  botChipText: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  botChipTextActive: {
    color: '#10B981',
  },
  formBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
});

// ─── Pattern Styles ──────────────────────────────────────────────────────────

const patternStyles = StyleSheet.create({
  patternRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  patternDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#60A5FA',
    marginTop: 5,
  },
  patternName: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  patternDesc: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 18,
    marginBottom: 2,
  },
  patternFreq: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
  },
  corrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  corrMarket: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    width: 60,
  },
  corrBarBg: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  corrBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  corrValue: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    width: 42,
    textAlign: 'right',
  },
  botSelectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161B22',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 16,
    marginBottom: 8,
  },
  botSelectName: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  botSelectMeta: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  analyzeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(16,185,129,0.15)',
  },
  analyzeBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: '#10B981',
  },
});
