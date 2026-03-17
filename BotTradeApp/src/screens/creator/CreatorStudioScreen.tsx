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
import Svg, {Path, Circle, Rect} from 'react-native-svg';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../types';
import {creatorApi, CreatorStats, CreatorBot, MonthlyRevenue, AiSuggestion} from '../../services/creator';

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

// ─── Main Component ─────────────────────────────────────────────────────────

export default function CreatorStudioScreen() {
  const navigation = useNavigation<Nav>();
  const [stats, setStats] = useState<CreatorStats | null>(null);
  const [bots, setBots] = useState<CreatorBot[]>([]);
  const [monthlyRevenue, setMonthlyRevenue] = useState<MonthlyRevenue[]>([]);
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(() => {
    Promise.all([
      creatorApi.getStats(),
      creatorApi.getBots(),
      creatorApi.getMonthlyRevenue(),
      creatorApi.getAiSuggestions(),
    ])
      .then(([s, b, mr, ai]) => {
        const latestMonthRev = mr.length > 0 ? mr[mr.length - 1].revenue : 0;
        setStats({...s, monthlyRevenue: latestMonthRev});
        setBots(b);
        setMonthlyRevenue(mr);
        setAiSuggestions(ai);
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
            <Text style={styles.metricLabel}>Total Users</Text>
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
        <Text style={styles.sectionTitle}>Your Bots</Text>
        <View style={styles.card}>
          {bots.length === 0 ? (
            <View style={{alignItems: 'center', paddingVertical: 24}}>
              <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 14, color: 'rgba(255,255,255,0.4)', marginBottom: 4}}>No bots created yet</Text>
              <TouchableOpacity onPress={() => navigation.navigate('BotBuilder' as any)} activeOpacity={0.7}>
                <Text style={{fontFamily: 'Inter-Regular', fontSize: 12, color: '#10B981'}}>Build your first bot</Text>
              </TouchableOpacity>
            </View>
          ) : bots.map((bot, index) => (
            <TouchableOpacity key={bot.id} activeOpacity={0.7} onPress={() => navigation.navigate('BotDetails', {botId: bot.id})}>
              <View style={styles.botRow}>
                <View style={styles.botInfo}>
                  <Text style={styles.botName}>{bot.name}</Text>
                  <View style={styles.botMeta}>
                    <UsersIcon />
                    <Text style={styles.botMetaText}>{bot.users} users</Text>
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
              {index < bots.length - 1 && (
                <View style={styles.divider} />
              )}
            </TouchableOpacity>
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
    paddingBottom: 14,
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 18,
    color: '#FFFFFF',
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
    marginBottom: 10,
    marginTop: 4,
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
  botName: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 4,
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
});
