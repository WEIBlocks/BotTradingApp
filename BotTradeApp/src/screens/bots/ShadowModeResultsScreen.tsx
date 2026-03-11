import React, {useEffect} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import Animated, {useSharedValue, useAnimatedStyle, withDelay, withSpring, withTiming} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import {RootStackParamList} from '../../types';
import {mockBots} from '../../data/mockBots';
import EquityChart from '../../components/charts/EquityChart';
import CheckCircleIcon from '../../components/icons/CheckCircleIcon';
import XIcon from '../../components/icons/XIcon';

const {width} = Dimensions.get('window');
type Props = NativeStackScreenProps<RootStackParamList, 'ShadowModeResults'>;

export default function ShadowModeResultsScreen({navigation, route}: Props) {
  const {botId, profit, winRate} = route.params;
  const bot = mockBots.find(b => b.id === botId) || mockBots[0];

  const checkScale = useSharedValue(0);
  const contentOpacity = useSharedValue(0);

  useEffect(() => {
    checkScale.value = withDelay(200, withSpring(1, {damping: 12}));
    contentOpacity.value = withDelay(500, withTiming(1, {duration: 400}));
  }, [checkScale, contentOpacity]);

  const checkStyle = useAnimatedStyle(() => ({transform: [{scale: checkScale.value}]}));
  const contentStyle = useAnimatedStyle(() => ({opacity: contentOpacity.value}));

  const PERFORMANCE_DAYS = [1.2, 0.8, 2.1, -0.3, 1.5, 0.9, 1.8, 2.3, -0.5, 1.4, 2.0, 1.6, 0.7, 2.4];

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
          <Text style={styles.heroTitle}>Shadow Period Complete!</Text>
          <Text style={styles.heroSubtitle}>{bot.name} ran for 14 days with virtual funds. Here are your results:</Text>
        </View>

        <Animated.View style={contentStyle}>
          {/* Metrics */}
          <View style={styles.metricsRow}>
            <View style={[styles.metricCard, {borderColor: 'rgba(16,185,129,0.3)'}]}>
              <Text style={styles.metricLabel}>TOTAL PROFIT</Text>
              <Text style={[styles.metricValue, {color: '#10B981'}]}>+${profit}</Text>
              <Text style={styles.metricSub}>Virtual earnings</Text>
            </View>
            <View style={[styles.metricCard, {borderColor: 'rgba(13,127,242,0.3)'}]}>
              <Text style={styles.metricLabel}>WIN RATE</Text>
              <Text style={[styles.metricValue, {color: '#0D7FF2'}]}>{winRate}%</Text>
              <Text style={styles.metricSub}>Of all trades</Text>
            </View>
          </View>

          {/* Performance chart */}
          <View style={styles.chartSection}>
            <Text style={styles.sectionLabel}>PORTFOLIO GROWTH</Text>
            <EquityChart data={bot.equityData} width={width - 40} height={120} />
          </View>

          {/* Daily performance grid */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>DAILY PERFORMANCE</Text>
            <View style={styles.performanceGrid}>
              {PERFORMANCE_DAYS.map((day, i) => (
                <View
                  key={i}
                  style={[
                    styles.dayBox,
                    {backgroundColor: day >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.2)'}
                  ]}>
                  <Text style={[styles.dayText, {color: day >= 0 ? '#10B981' : '#EF4444'}]}>
                    {day >= 0 ? '+' : ''}{day.toFixed(1)}%
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Outperformance */}
          <View style={styles.outperformCard}>
            <Text style={styles.outperformTitle}>Outperformed your live portfolio</Text>
            <Text style={styles.outperformValue}>+1.2%</Text>
          </View>

          {/* CTA */}
          <View style={styles.ctaSection}>
            <Text style={styles.ctaCaption}>CAPITAL TO ALLOCATE</Text>
            <Text style={styles.ctaAmount}>$2,500</Text>
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
});
