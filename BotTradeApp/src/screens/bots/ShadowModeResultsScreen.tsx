import React, {useState, useEffect, useCallback, useRef} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, ActivityIndicator, AppState, TextInput, Alert} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import Animated, {useSharedValue, useAnimatedStyle, withDelay, withSpring, withTiming} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import {RootStackParamList} from '../../types';
import type {Bot} from '../../types';
import {marketplaceApi} from '../../services/marketplace';
import {botsService} from '../../services/bots';
import InteractiveChart from '../../components/charts/InteractiveChart';
import CheckCircleIcon from '../../components/icons/CheckCircleIcon';
import XIcon from '../../components/icons/XIcon';
import StarIcon from '../../components/icons/StarIcon';

const {width} = Dimensions.get('window');
type Props = NativeStackScreenProps<RootStackParamList, 'ShadowModeResults'>;

interface ShadowResultData {
  dailyPerformance: number[];
  equityCurve: number[];
  outperformance: number;
  allocatedCapital: number;
  durationDays: number;
}

export default function ShadowModeResultsScreen({navigation, route}: Props) {
  const {botId, profit, winRate, sessionId} = route.params;
  const [bot, setBot] = useState<Bot | null>(null);
  const [shadowData, setShadowData] = useState<ShadowResultData | null>(null);
  const [loading, setLoading] = useState(true);

  const [isRunning, setIsRunning] = useState(false);
  const [latestProfit, setLatestProfit] = useState(profit ?? 0);
  const [latestWinRate, setLatestWinRate] = useState(winRate ?? 0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Review state
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const fetchData = useCallback(async (initial = false) => {
    try {
      const promises: Promise<any>[] = [
        initial ? marketplaceApi.getBotDetails(botId).catch(() => null) : Promise.resolve(null),
      ];

      if (sessionId) {
        promises.push(
          botsService.getShadowResults(sessionId)
            .then((res: any) => res?.data ?? res)
            .catch(() => null),
        );
      }

      const [botData, results] = await Promise.all(promises);
      if (botData) setBot(botData);
      if (results) {
        const sessionStatus = results.session?.status ?? '';
        setIsRunning(sessionStatus === 'running');

        const totalReturnVal = Number(results.session?.totalReturn) || 0;
        const allocCap = Number(results.allocatedCapital) || 0;
        const computedProfit = allocCap > 0 ? Math.round(allocCap * totalReturnVal) / 100 : (profit ?? 0);
        const computedWinRate = Number(results.session?.winRate) || (winRate ?? 0);
        setLatestProfit(computedProfit);
        setLatestWinRate(Math.round(computedWinRate));

        setShadowData({
          dailyPerformance: Array.isArray(results.dailyPerformance) ? results.dailyPerformance : [],
          equityCurve: Array.isArray(results.equityCurve) ? results.equityCurve : [],
          outperformance: Number(results.outperformance) || 0,
          allocatedCapital: allocCap,
          durationDays: Number(results.session?.durationDays) || 14,
        });
      }
    } finally {
      if (initial) setLoading(false);
    }
  }, [botId, sessionId, profit, winRate]);

  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  // Poll for updates if session is running
  useEffect(() => {
    if (!isRunning || !sessionId) return;
    pollRef.current = setInterval(() => fetchData(false), 20000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isRunning, sessionId, fetchData]);

  // Pause polling when app is backgrounded
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active' && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      } else if (state === 'active' && isRunning && sessionId && !pollRef.current) {
        fetchData(false);
        pollRef.current = setInterval(() => fetchData(false), 20000);
      }
    });
    return () => sub.remove();
  }, [isRunning, sessionId, fetchData]);

  const checkScale = useSharedValue(0);
  const contentOpacity = useSharedValue(0);

  useEffect(() => {
    checkScale.value = withDelay(200, withSpring(1, {damping: 12}));
    contentOpacity.value = withDelay(500, withTiming(1, {duration: 400}));
  }, [checkScale, contentOpacity]);

  const checkStyle = useAnimatedStyle(() => ({transform: [{scale: checkScale.value}]}));
  const contentStyle = useAnimatedStyle(() => ({opacity: contentOpacity.value}));

  const handleSubmitReview = useCallback(async () => {
    if (reviewRating === 0) {
      Alert.alert('Rating Required', 'Please tap a star to rate this bot.');
      return;
    }
    setReviewSubmitting(true);
    try {
      await botsService.addReview(botId, {rating: reviewRating, text: reviewText.trim()});
      setReviewSubmitted(true);
    } catch {
      Alert.alert('Error', 'Failed to submit review. Please try again.');
    } finally {
      setReviewSubmitting(false);
    }
  }, [botId, reviewRating, reviewText]);

  const botName = bot?.name ?? 'Bot';
  const equityData = shadowData?.equityCurve ?? bot?.equityData ?? [];
  const dailyPerf = shadowData?.dailyPerformance ?? [];
  const outperformance = shadowData?.outperformance ?? 0;
  const allocatedCapital = shadowData?.allocatedCapital ?? 0;
  const durationDays = shadowData?.durationDays ?? 14;

  if (loading) {
    return (
      <View style={[styles.container, {alignItems: 'center', justifyContent: 'center'}]}>
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <XIcon size={20} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Shadow Results</Text>
        <View style={{width: 40}} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Success badge */}
        <View style={styles.heroSection}>
          <Animated.View style={[styles.checkCircle, checkStyle]}>
            <View style={styles.checkInner}>
              <CheckCircleIcon size={56} color="#10B981" />
            </View>
          </Animated.View>
          <Text style={styles.heroTitle}>
            {isRunning ? 'Shadow Mode Running' : 'Shadow Period Complete!'}
          </Text>
          <Text style={styles.heroSubtitle}>
            {isRunning
              ? `${botName} is running with virtual funds. Stats update in real-time.`
              : `${botName} ran for ${durationDays} days with virtual funds. Here are your results:`}
          </Text>
        </View>

        <Animated.View style={contentStyle}>
          {/* Metrics */}
          <View style={styles.metricsRow}>
            <View style={[styles.metricCard, {borderColor: latestProfit >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}]}>
              <Text style={styles.metricLabel}>TOTAL PROFIT</Text>
              <Text style={[styles.metricValue, {color: latestProfit >= 0 ? '#10B981' : '#EF4444'}]}>
                {latestProfit >= 0 ? '+' : ''}${Math.abs(latestProfit).toFixed(2)}
              </Text>
              <Text style={styles.metricSub}>Virtual earnings</Text>
            </View>
            <View style={[styles.metricCard, {borderColor: 'rgba(13,127,242,0.3)'}]}>
              <Text style={styles.metricLabel}>WIN RATE</Text>
              <Text style={[styles.metricValue, {color: '#0D7FF2'}]}>{latestWinRate}%</Text>
              <Text style={styles.metricSub}>Of all trades</Text>
            </View>
          </View>

          {/* Performance chart */}
          <View style={styles.chartSection}>
            <InteractiveChart
              data={equityData}
              width={width - 40}
              height={180}
              label="PORTFOLIO GROWTH"
              timeframes={['1D', '1W', '2W', 'ALL']}
              showGrid
              showCrosshair
              showYLabels
              showXLabels
            />
          </View>

          {/* Daily performance grid */}
          {dailyPerf.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>DAILY PERFORMANCE</Text>
              <View style={styles.performanceGrid}>
                {dailyPerf.map((rawDay, i) => {
                  const day = Number(rawDay) || 0;
                  return (
                    <View
                      key={i}
                      style={[
                        styles.dayBox,
                        {backgroundColor: day >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.2)'},
                      ]}>
                      <Text style={[styles.dayText, {color: day >= 0 ? '#10B981' : '#EF4444'}]}>
                        {day >= 0 ? '+' : ''}{day.toFixed(1)}%
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Outperformance */}
          <View style={styles.outperformCard}>
            <Text style={styles.outperformTitle}>
              {outperformance >= 0 ? 'Outperformed' : 'Underperformed'} your live portfolio
            </Text>
            <Text style={[styles.outperformValue, outperformance < 0 && {color: '#EF4444'}]}>
              {outperformance >= 0 ? '+' : ''}{outperformance.toFixed(1)}%
            </Text>
          </View>

          {/* Review section — only when session is complete */}
          {!isRunning && (
            <View style={styles.reviewSection}>
              {reviewSubmitted ? (
                <View style={styles.reviewDone}>
                  <CheckCircleIcon size={24} color="#10B981" />
                  <Text style={styles.reviewDoneText}>Thanks for your review!</Text>
                </View>
              ) : (
                <>
                  <Text style={styles.reviewTitle}>Rate {botName}</Text>
                  <Text style={styles.reviewSubtitle}>Help other traders by sharing your experience</Text>
                  <View style={styles.starsRow}>
                    {[1, 2, 3, 4, 5].map(i => (
                      <TouchableOpacity key={i} onPress={() => setReviewRating(i)} activeOpacity={0.7}>
                        <StarIcon size={32} filled={i <= reviewRating} color="#EAB308" />
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput
                    style={styles.reviewInput}
                    value={reviewText}
                    onChangeText={setReviewText}
                    placeholder="Share your thoughts (optional)..."
                    placeholderTextColor="rgba(255,255,255,0.2)"
                    multiline
                    numberOfLines={3}
                    maxLength={500}
                    textAlignVertical="top"
                  />
                  <TouchableOpacity
                    style={[styles.submitReviewBtn, reviewRating === 0 && {opacity: 0.4}]}
                    onPress={handleSubmitReview}
                    disabled={reviewRating === 0 || reviewSubmitting}
                    activeOpacity={0.8}>
                    {reviewSubmitting ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.submitReviewText}>Submit Review</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          {/* CTA */}
          <View style={styles.ctaSection}>
            <Text style={styles.ctaCaption}>CAPITAL TO ALLOCATE</Text>
            <Text style={styles.ctaAmount}>
              ${allocatedCapital > 0 ? allocatedCapital.toLocaleString() : '—'}
            </Text>
            <TouchableOpacity style={styles.goLiveBtn} onPress={() => navigation.navigate('BotPurchase', {botId})} activeOpacity={0.85}>
              <LinearGradient colors={['#10B981', '#059669']} style={styles.goLiveGradient} start={{x: 0, y: 0}} end={{x: 1, y: 0}}>
                <Text style={styles.goLiveText}>Go Live Now</Text>
              </LinearGradient>
            </TouchableOpacity>
            <Text style={styles.noLockText}>INSTANT ACTIVATION • NO LOCK-UP PERIOD</Text>
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0F1117'},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12},
  iconBtn: {width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center'},
  headerTitle: {fontFamily: 'Inter-SemiBold', fontSize: 17, color: '#FFFFFF'},
  scroll: {paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40},
  heroSection: {alignItems: 'center', paddingVertical: 24},
  checkCircle: {marginBottom: 16},
  checkInner: {},
  heroTitle: {fontFamily: 'Inter-Bold', fontSize: 24, color: '#FFFFFF', marginBottom: 8, textAlign: 'center', letterSpacing: -0.3},
  heroSubtitle: {fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 20},
  metricsRow: {flexDirection: 'row', gap: 10, marginBottom: 20},
  metricCard: {flex: 1, backgroundColor: '#161B22', borderRadius: 16, padding: 16, borderWidth: 1},
  metricLabel: {fontFamily: 'Inter-Medium', fontSize: 9, letterSpacing: 0.8, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 6},
  metricValue: {fontFamily: 'Inter-Bold', fontSize: 26, letterSpacing: -0.5},
  metricSub: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2},
  chartSection: {marginBottom: 20},
  sectionLabel: {fontFamily: 'Inter-Medium', fontSize: 10, letterSpacing: 1, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 10},
  section: {marginBottom: 20},
  performanceGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 6},
  dayBox: {paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8},
  dayText: {fontFamily: 'Inter-SemiBold', fontSize: 11},
  outperformCard: {
    backgroundColor: 'rgba(16,185,129,0.08)', borderRadius: 14, padding: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)', marginBottom: 24,
  },
  outperformTitle: {fontFamily: 'Inter-Medium', fontSize: 13, color: 'rgba(255,255,255,0.6)'},
  outperformValue: {fontFamily: 'Inter-Bold', fontSize: 18, color: '#10B981'},
  ctaSection: {alignItems: 'center'},
  ctaCaption: {fontFamily: 'Inter-Medium', fontSize: 10, letterSpacing: 1, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 4},
  ctaAmount: {fontFamily: 'Inter-Bold', fontSize: 32, color: '#FFFFFF', marginBottom: 16, letterSpacing: -1},
  goLiveBtn: {width: '100%', height: 56, borderRadius: 14, overflow: 'hidden', marginBottom: 10},
  goLiveGradient: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  goLiveText: {fontFamily: 'Inter-SemiBold', fontSize: 17, color: '#FFFFFF'},
  noLockText: {fontFamily: 'Inter-Medium', fontSize: 10, letterSpacing: 0.8, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase'},

  // Review section
  reviewSection: {
    backgroundColor: '#161B22', borderRadius: 16, padding: 20, marginBottom: 24,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  reviewDone: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 8,
  },
  reviewDoneText: {fontFamily: 'Inter-SemiBold', fontSize: 15, color: '#10B981'},
  reviewTitle: {fontFamily: 'Inter-Bold', fontSize: 17, color: '#FFFFFF', marginBottom: 4, textAlign: 'center'},
  reviewSubtitle: {fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginBottom: 16},
  starsRow: {flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 16},
  reviewInput: {
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 14,
    fontFamily: 'Inter-Regular', fontSize: 14, color: '#FFFFFF', minHeight: 80,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 14,
  },
  submitReviewBtn: {
    height: 46, borderRadius: 12, backgroundColor: '#0D7FF2',
    alignItems: 'center', justifyContent: 'center',
  },
  submitReviewText: {fontFamily: 'Inter-SemiBold', fontSize: 15, color: '#FFFFFF'},
});
