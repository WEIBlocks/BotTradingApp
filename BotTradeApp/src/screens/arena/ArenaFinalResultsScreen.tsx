import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList, Gladiator} from '../../types';
import {arenaApi} from '../../services/arena';
import MiniLineChart from '../../components/charts/MiniLineChart';
import TrophyIcon from '../../components/icons/TrophyIcon';
import ChevronLeftIcon from '../../components/icons/ChevronLeftIcon';

const {width} = Dimensions.get('window');

type Props = NativeStackScreenProps<RootStackParamList, 'ArenaResults'>;

const LINE_COLORS = ['#39FF14', '#A855F7', '#EC4899', '#22D3EE', '#EAB308'];
const PODIUM_MEDALS = ['#EAB308', '#C0C0C0', '#CD7F32'];
const PODIUM_LABELS = ['1ST', '2ND', '3RD'];

export default function ArenaFinalResultsScreen({navigation, route}: Props) {
  const {winnerId} = route.params;
  const [allGladiators, setAllGladiators] = useState<Gladiator[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    arenaApi.getAvailableBots()
      .then(bots => {
        const sorted = [...bots].sort(
          (a, b) => (b.currentReturn || 0) - (a.currentReturn || 0),
        );
        setAllGladiators(sorted);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const winner = allGladiators[0];
  const podiumThree = allGladiators.slice(0, 3);
  const restRanked = allGladiators.slice(3);

  // Entrance animations
  const trophyScale = useSharedValue(0);
  const podiumOpacity = useSharedValue(0);
  const statsOpacity = useSharedValue(0);

  useEffect(() => {
    trophyScale.value = withDelay(200, withSpring(1.0, {damping: 12}));
    podiumOpacity.value = withDelay(500, withTiming(1, {duration: 600}));
    statsOpacity.value = withDelay(900, withTiming(1, {duration: 500}));
  }, []);

  const trophyStyle = useAnimatedStyle(() => ({
    transform: [{scale: trophyScale.value}],
  }));
  const podiumStyle = useAnimatedStyle(() => ({opacity: podiumOpacity.value}));
  const statsStyle = useAnimatedStyle(() => ({opacity: statsOpacity.value}));

  if (loading) {
    return (
      <View style={[styles.container, {alignItems: 'center', justifyContent: 'center'}]}>
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  if (allGladiators.length === 0) {
    return (
      <View style={[styles.container, {alignItems: 'center', justifyContent: 'center'}]}>
        <Text style={{fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.4)'}}>
          No results available.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.navigate('Main')}
          style={styles.iconBtn}>
          <ChevronLeftIcon size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerCaption}>BATTLE COMPLETE</Text>
          <Text style={styles.headerTitle}>FINAL RESULTS</Text>
        </View>
        <View style={{width: 40}} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}>
        {/* Champion Banner */}
        <View style={styles.championBanner}>
          <Animated.View style={[styles.trophyCircle, trophyStyle]}>
            <TrophyIcon size={40} color="#EAB308" />
          </Animated.View>
          <Text style={styles.championLabel}>CHAMPION</Text>
          <Text style={styles.championName}>{winner.name}</Text>
          <Text style={styles.championStrategy}>{winner.strategy}</Text>
          <View style={styles.championReturn}>
            <Text style={styles.championReturnValue}>
              +{(winner.currentReturn || 0).toFixed(1)}%
            </Text>
            <Text style={styles.championReturnLabel}>Total Return</Text>
          </View>
        </View>

        {/* Podium */}
        <Animated.View style={[styles.podiumSection, podiumStyle]}>
          <Text style={styles.sectionTitle}>PODIUM FINISH</Text>
          <View style={styles.podiumRow}>
            {/* 2nd place */}
            <PodiumCard
              gladiator={podiumThree[1]}
              rank={2}
              color={PODIUM_MEDALS[1]}
              label={PODIUM_LABELS[1]}
              lineColor={LINE_COLORS[1]}
              height={80}
            />
            {/* 1st place (center, tallest) */}
            <PodiumCard
              gladiator={podiumThree[0]}
              rank={1}
              color={PODIUM_MEDALS[0]}
              label={PODIUM_LABELS[0]}
              lineColor={LINE_COLORS[0]}
              height={110}
              isFirst
            />
            {/* 3rd place */}
            <PodiumCard
              gladiator={podiumThree[2]}
              rank={3}
              color={PODIUM_MEDALS[2]}
              label={PODIUM_LABELS[2]}
              lineColor={LINE_COLORS[2]}
              height={60}
            />
          </View>
        </Animated.View>

        {/* Stat Clash */}
        <Animated.View style={[styles.statClashSection, statsStyle]}>
          <Text style={styles.sectionTitle}>STAT CLASH</Text>
          <View style={styles.statClashCard}>
            {/* Header row */}
            <View style={styles.clashHeaderRow}>
              <Text style={styles.clashMetricLabel}>METRIC</Text>
              {podiumThree.map((g, i) => (
                <Text
                  key={g.id}
                  style={[styles.clashPlayerLabel, {color: LINE_COLORS[i]}]}
                  numberOfLines={1}>
                  {g.name.split(' ')[0]}
                </Text>
              ))}
            </View>
            <ClashRow
              metric="Return"
              values={podiumThree.map(g => `+${(g.currentReturn || 0).toFixed(1)}%`)}
              colors={[LINE_COLORS[0], LINE_COLORS[1], LINE_COLORS[2]]}
              winnerIdx={0}
            />
            <ClashRow
              metric="Win Rate"
              values={podiumThree.map(g => `${g.winRate}%`)}
              colors={[LINE_COLORS[0], LINE_COLORS[1], LINE_COLORS[2]]}
              winnerIdx={podiumThree.reduce(
                (maxI, g, i, arr) =>
                  g.winRate > arr[maxI].winRate ? i : maxI,
                0,
              )}
            />
            <ClashRow
              metric="Level"
              values={podiumThree.map(g => `LVL ${g.level}`)}
              colors={[LINE_COLORS[0], LINE_COLORS[1], LINE_COLORS[2]]}
              winnerIdx={podiumThree.reduce(
                (maxI, g, i, arr) =>
                  g.level > arr[maxI].level ? i : maxI,
                0,
              )}
            />
          </View>
        </Animated.View>

        {/* Full Rankings */}
        <Animated.View style={[styles.rankingsSection, statsStyle]}>
          <Text style={styles.sectionTitle}>FULL STANDINGS</Text>
          <View style={styles.rankingsCard}>
            {allGladiators.map((g, i) => {
              const rank = i + 1;
              const returnColor =
                (g.currentReturn || 0) >= 0 ? '#10B981' : '#EF4444';
              return (
                <View key={g.id} style={styles.rankingRow}>
                  <View
                    style={[
                      styles.rankBadge,
                      rank <= 3 ? {backgroundColor: PODIUM_MEDALS[rank - 1] + '33'} : {},
                    ]}>
                    <Text
                      style={[
                        styles.rankNum,
                        rank <= 3 ? {color: PODIUM_MEDALS[rank - 1]} : {},
                      ]}>
                      {rank}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.gladAvatar,
                      {backgroundColor: g.avatarColor},
                    ]}>
                    <Text style={styles.gladAvatarText}>
                      {g.name.charAt(0)}
                    </Text>
                  </View>
                  <View style={styles.gladInfo}>
                    <Text style={styles.gladName}>{g.name}</Text>
                    <Text style={styles.gladStrategy}>{g.strategy}</Text>
                  </View>
                  <View style={styles.miniChartContainer}>
                    <MiniLineChart
                      data={g.equityData || []}
                      width={60}
                      height={28}
                      color={LINE_COLORS[i] || '#10B981'}
                    />
                  </View>
                  <Text style={[styles.gladReturn, {color: returnColor}]}>
                    +{(g.currentReturn || 0).toFixed(1)}%
                  </Text>
                </View>
              );
            })}
          </View>
        </Animated.View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => navigation.navigate('ArenaSetup')}>
            <Text style={styles.primaryBtnText}>BATTLE AGAIN</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => navigation.navigate('Main')}>
            <Text style={styles.secondaryBtnText}>Back to Dashboard</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

// Podium card sub-component
function PodiumCard({
  gladiator,
  rank,
  color,
  label,
  lineColor,
  height,
  isFirst,
}: {
  gladiator: any;
  rank: number;
  color: string;
  label: string;
  lineColor: string;
  height: number;
  isFirst?: boolean;
}) {
  const scale = useSharedValue(0);
  useEffect(() => {
    scale.value = withDelay(
      600 + rank * 150,
      withSpring(1, {damping: 14}),
    );
  }, []);
  const style = useAnimatedStyle(() => ({
    transform: [{scale: scale.value}],
  }));

  return (
    <Animated.View style={[styles.podiumCard, isFirst && styles.podiumCardFirst, style]}>
      <View style={[styles.podiumAvatar, {backgroundColor: gladiator.avatarColor}]}>
        <Text style={styles.podiumAvatarText}>{gladiator.name.charAt(0)}</Text>
      </View>
      <Text style={styles.podiumGladName} numberOfLines={1}>
        {gladiator.name.split(' ')[0]}
      </Text>
      <Text style={[styles.podiumReturn, {color: lineColor}]}>
        +{(gladiator.currentReturn || 0).toFixed(1)}%
      </Text>
      <View style={[styles.podiumBase, {height, borderTopColor: color}]}>
        <Text style={[styles.podiumLabel, {color}]}>{label}</Text>
      </View>
    </Animated.View>
  );
}

// Clash row sub-component
function ClashRow({
  metric,
  values,
  colors,
  winnerIdx,
}: {
  metric: string;
  values: string[];
  colors: string[];
  winnerIdx: number;
}) {
  return (
    <View style={styles.clashRow}>
      <Text style={styles.clashMetric}>{metric}</Text>
      {values.map((v, i) => (
        <View key={i} style={styles.clashValueCell}>
          <Text
            style={[
              styles.clashValue,
              i === winnerIdx && styles.clashValueWinner,
              i === winnerIdx && {color: colors[i]},
            ]}>
            {v}
          </Text>
          {i === winnerIdx && <View style={[styles.clashWinDot, {backgroundColor: colors[i]}]} />}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0F1117'},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 12,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {alignItems: 'center'},
  headerCaption: {
    fontFamily: 'Inter-Medium',
    fontSize: 9,
    letterSpacing: 2,
    color: '#EAB308',
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: 18,
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  scroll: {paddingHorizontal: 20, paddingBottom: 48},
  // Champion Banner
  championBanner: {
    alignItems: 'center',
    paddingVertical: 28,
    backgroundColor: 'rgba(234,179,8,0.06)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(234,179,8,0.15)',
    marginBottom: 24,
    marginTop: 8,
  },
  trophyCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(234,179,8,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  championLabel: {
    fontFamily: 'Inter-Bold',
    fontSize: 10,
    letterSpacing: 2,
    color: '#EAB308',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  championName: {
    fontFamily: 'Inter-Bold',
    fontSize: 24,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  championStrategy: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 16,
  },
  championReturn: {alignItems: 'center'},
  championReturnValue: {
    fontFamily: 'Inter-Bold',
    fontSize: 32,
    color: '#39FF14',
    letterSpacing: -0.5,
  },
  championReturnLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 2,
  },
  // Section titles
  sectionTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: 11,
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  // Podium
  podiumSection: {marginBottom: 24},
  podiumRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 8,
  },
  podiumCard: {alignItems: 'center', flex: 1},
  podiumCardFirst: {marginBottom: 0},
  podiumAvatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  podiumAvatarText: {fontFamily: 'Inter-Bold', fontSize: 18, color: '#FFFFFF'},
  podiumGladName: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  podiumReturn: {fontFamily: 'Inter-Bold', fontSize: 12, marginBottom: 6},
  podiumBase: {
    width: '100%',
    borderTopWidth: 3,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  podiumLabel: {
    fontFamily: 'Inter-Bold',
    fontSize: 14,
    letterSpacing: 1,
    marginTop: 8,
  },
  // Stat clash
  statClashSection: {marginBottom: 24},
  statClashCard: {
    backgroundColor: '#161B22',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  clashHeaderRow: {
    flexDirection: 'row',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    marginBottom: 8,
  },
  clashMetricLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    color: 'rgba(255,255,255,0.3)',
    flex: 1,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  clashPlayerLabel: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    flex: 1,
    textAlign: 'center',
  },
  clashRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 8},
  clashMetric: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    flex: 1,
  },
  clashValueCell: {flex: 1, alignItems: 'center', position: 'relative'},
  clashValue: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
  },
  clashValueWinner: {fontFamily: 'Inter-Bold', fontSize: 13},
  clashWinDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    position: 'absolute',
    bottom: -8,
  },
  // Rankings
  rankingsSection: {marginBottom: 24},
  rankingsCard: {
    backgroundColor: '#161B22',
    borderRadius: 18,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  rankingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  rankNum: {
    fontFamily: 'Inter-Bold',
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
  gladAvatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  gladAvatarText: {fontFamily: 'Inter-Bold', fontSize: 14, color: '#FFFFFF'},
  gladInfo: {flex: 1},
  gladName: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#FFFFFF'},
  gladStrategy: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 1,
  },
  miniChartContainer: {marginRight: 10},
  gladReturn: {fontFamily: 'Inter-Bold', fontSize: 14, minWidth: 52, textAlign: 'right'},
  // Actions
  actions: {gap: 12},
  primaryBtn: {
    height: 56,
    borderRadius: 16,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontFamily: 'Inter-Bold',
    fontSize: 15,
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  secondaryBtn: {
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
  },
});
