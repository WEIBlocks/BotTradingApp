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
  Alert,
} from 'react-native';
import Svg, {Path, Circle} from 'react-native-svg';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../types';
import {
  creatorApi,
  CreatorStats,
  CreatorBot,
  MonthlyRevenue,
  AiSuggestion,
  EarningsSummary,
  EarningsProjection,
} from '../../services/creator';

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

function UsersIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Path
        d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"
        stroke="rgba(255,255,255,0.5)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle
        cx={9}
        cy={7}
        r={4}
        stroke="rgba(255,255,255,0.5)"
        strokeWidth={2}
      />
      <Path
        d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
        stroke="rgba(255,255,255,0.5)"
        strokeWidth={2}
        strokeLinecap="round"
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
  const [stats, setStats] = useState<CreatorStats | null>(null);
  const [bots, setBots] = useState<CreatorBot[]>([]);
  const [monthlyRevenue, setMonthlyRevenue] = useState<MonthlyRevenue[]>([]);
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestion[]>([]);
  const [earnings, setEarnings] = useState<EarningsSummary | null>(null);
  const [projections, setProjections] = useState<EarningsProjection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeSection, setActiveSection] = useState<'overview' | 'earnings'>('overview');

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
      .catch(() => Alert.alert('Error', 'Failed to load creator data. Pull down to retry.'))
      .finally(() => { setLoading(false); setRefreshing(false); });
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
      <View style={styles.sectionTabs}>
        <TouchableOpacity
          style={[styles.sectionTab, activeSection === 'overview' && styles.sectionTabActive]}
          onPress={() => setActiveSection('overview')}>
          <Text style={[styles.sectionTabText, activeSection === 'overview' && styles.sectionTabTextActive]}>Overview</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sectionTab, activeSection === 'earnings' && styles.sectionTabActive]}
          onPress={() => setActiveSection('earnings')}>
          <Text style={[styles.sectionTabText, activeSection === 'earnings' && styles.sectionTabTextActive]}>Earnings</Text>
        </TouchableOpacity>
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

        {activeSection === 'overview' ? (
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

            {/* Your Bots */}
            <View style={styles.botsSectionHeader}>
              <Text style={styles.sectionTitle}>Your Bots</Text>
              <TouchableOpacity
                style={styles.newBotBtn}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('BotBuilder' as any)}>
                <Text style={styles.newBotBtnText}>+ New Bot</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.card}>
              {bots.length === 0 ? (
                <View style={{alignItems: 'center', paddingVertical: 24}}>
                  <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 14, color: 'rgba(255,255,255,0.4)', marginBottom: 4}}>No bots created yet</Text>
                  <TouchableOpacity onPress={() => navigation.navigate('BotBuilder' as any)} activeOpacity={0.7}>
                    <Text style={{fontFamily: 'Inter-Regular', fontSize: 12, color: '#10B981'}}>Build your first bot</Text>
                  </TouchableOpacity>
                </View>
              ) : bots.map((bot, index) => (
                <View key={bot.id}>
                  <View style={styles.botRow}>
                    <View style={styles.botInfo}>
                      <View style={styles.botNameRow}>
                        <Text style={styles.botName}>{bot.name}</Text>
                        <View style={[styles.statusBadge, bot.isPublished ? styles.statusPublished : styles.statusDraft]}>
                          <Text style={[styles.statusBadgeText, bot.isPublished ? styles.statusPublishedText : styles.statusDraftText]}>
                            {bot.isPublished ? 'PUBLISHED' : 'DRAFT'}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.botMeta}>
                        <UsersIcon />
                        <Text style={styles.botMetaText}>{bot.users} users</Text>
                        <Text style={styles.botFeeText}>{bot.creatorFeePercent}% fee</Text>
                      </View>
                    </View>
                    <View style={styles.botStats}>
                      <View style={styles.ratingRow}>
                        <StarIcon filled />
                        <Text style={styles.ratingText}>{bot.rating}</Text>
                      </View>
                      <Text style={styles.returnText}>
                        +{bot.returnPercent}%
                      </Text>
                      <Text style={styles.revenueText}>
                        ${bot.revenue.toLocaleString('en-US', {minimumFractionDigits: 2})}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.botActions}>
                    <TouchableOpacity
                      style={styles.editBtn}
                      activeOpacity={0.7}
                      onPress={() => navigation.navigate('BotBuilder', {editBotId: bot.id})}>
                      <EditIcon />
                      <Text style={styles.editBtnText}>Edit</Text>
                    </TouchableOpacity>
                    {!bot.isPublished && (
                      <TouchableOpacity
                        style={styles.publishBtn}
                        activeOpacity={0.7}
                        onPress={() => {
                          Alert.alert(
                            'Publish Bot',
                            `Are you sure you want to publish "${bot.name}" to the marketplace?`,
                            [
                              {text: 'Cancel', style: 'cancel'},
                              {text: 'Publish', onPress: async () => {
                                try {
                                  await creatorApi.publishBot(bot.id);
                                  Alert.alert('Published!', `${bot.name} is now live on the marketplace.`);
                                  fetchData();
                                } catch (e: any) {
                                  Alert.alert('Error', e?.message || 'Failed to publish bot.');
                                }
                              }},
                            ],
                          );
                        }}>
                        <PublishIcon />
                        <Text style={styles.publishBtnText}>Publish</Text>
                      </TouchableOpacity>
                    )}
                    {bot.isPublished && (
                      <TouchableOpacity
                        style={styles.viewBtn}
                        activeOpacity={0.7}
                        onPress={() => navigation.navigate('BotDetails', {botId: bot.id})}>
                        <Text style={styles.viewBtnText}>View</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {index < bots.length - 1 && (
                    <View style={styles.divider} />
                  )}
                </View>
              ))}
            </View>

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
        ) : (
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

        <View style={{height: 40}} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

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
  sectionTabs: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 14,
    gap: 0,
  },
  sectionTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  sectionTabActive: {
    borderBottomColor: '#10B981',
  },
  sectionTabText: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
  },
  sectionTabTextActive: {
    color: '#10B981',
    fontFamily: 'Inter-SemiBold',
  },
  scrollContent: {
    paddingHorizontal: 20,
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
  botRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  botInfo: {
    flex: 1,
  },
  botNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  botName: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusDraft: {
    backgroundColor: 'rgba(245,158,11,0.15)',
  },
  statusPublished: {
    backgroundColor: 'rgba(16,185,129,0.15)',
  },
  statusBadgeText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 9,
    letterSpacing: 0.5,
  },
  statusDraftText: {
    color: '#F59E0B',
  },
  statusPublishedText: {
    color: '#10B981',
  },
  botMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  botMetaText: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  botFeeText: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    color: '#10B981',
    marginLeft: 6,
    backgroundColor: 'rgba(16,185,129,0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  botStats: {
    alignItems: 'flex-end',
    gap: 2,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: '#F59E0B',
  },
  returnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    color: '#10B981',
  },
  revenueText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  botActions: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 12,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  editBtnText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: '#FFFFFF',
  },
  publishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#10B981',
  },
  publishBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: '#FFFFFF',
  },
  viewBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(16,185,129,0.12)',
  },
  viewBtnText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: '#10B981',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
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
});
