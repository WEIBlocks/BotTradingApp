import React, {useCallback} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../types';
import {mockBots} from '../../data/mockBots';
import EquityChart from '../../components/charts/EquityChart';
import MonthlyReturnBars from '../../components/charts/MonthlyReturnBars';
import Badge from '../../components/common/Badge';
import TradeRow from '../../components/common/TradeRow';
import SectionHeader from '../../components/common/SectionHeader';
import ChevronLeftIcon from '../../components/icons/ChevronLeftIcon';
import ShareIcon from '../../components/icons/ShareIcon';
import StarIcon from '../../components/icons/StarIcon';

const {width} = Dimensions.get('window');
const CHART_W = width - 40;

type Props = NativeStackScreenProps<RootStackParamList, 'BotDetails'>;

export default function BotDetailsScreen({navigation, route}: Props) {
  const bot = mockBots.find(b => b.id === route.params.botId) || mockBots[0];

  const handleActivate = useCallback(() => {
    navigation.navigate('BotPurchase', {botId: bot.id});
  }, [navigation, bot.id]);

  const handleShadowMode = useCallback(() => {
    navigation.navigate('ShadowMode');
  }, [navigation]);

  const statCells = [
    {label: '30D RETURN', value: `+${bot.returnPercent.toFixed(1)}%`, color: '#10B981'},
    {label: 'WIN RATE', value: `${bot.winRate}%`, color: '#0D7FF2'},
    {label: 'MAX DRAWDOWN', value: `${bot.maxDrawdown.toFixed(1)}%`, color: '#EF4444'},
    {label: 'SHARPE RATIO', value: `${bot.sharpeRatio.toFixed(2)}`, color: '#10B981'},
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <ChevronLeftIcon size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{bot.name}</Text>
        <TouchableOpacity style={styles.iconBtn}>
          <ShareIcon size={20} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Bot hero */}
        <View style={styles.heroSection}>
          <View style={[styles.botAvatar, {backgroundColor: bot.avatarColor}]}>
            <Text style={styles.botAvatarText}>{bot.avatarLetter}</Text>
          </View>
          <Text style={styles.botName}>{bot.name}</Text>
          <Text style={styles.botCreator}>{bot.subtitle}</Text>
          <View style={styles.ratingRow}>
            {[1,2,3,4,5].map(i => (
              <StarIcon key={i} size={14} filled={i <= Math.round(bot.rating)} color="#EAB308" />
            ))}
            <Text style={styles.ratingText}> {bot.rating.toFixed(1)} ({bot.reviewCount} reviews)</Text>
          </View>
          <Text style={styles.activeUsers}>{bot.activeUsers.toLocaleString()} active traders</Text>
        </View>

        {/* Stats 2x2 grid */}
        <View style={styles.statsGrid}>
          {statCells.map(cell => (
            <View key={cell.label} style={styles.statCell}>
              <Text style={styles.statCellLabel}>{cell.label}</Text>
              <Text style={[styles.statCellValue, {color: cell.color}]}>{cell.value}</Text>
            </View>
          ))}
        </View>

        {/* Equity chart */}
        <View style={styles.chartSection}>
          <EquityChart data={bot.equityData} width={CHART_W} height={140} />
        </View>

        {/* Bot DNA */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>BOT DNA</Text>
          <View style={styles.tagsRow}>
            {bot.tags.map(tag => (
              <Badge key={tag} label={tag} variant="outline" size="sm" style={styles.tag} />
            ))}
          </View>
        </View>

        {/* Strategy */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>STRATEGY</Text>
          <Text style={styles.strategyText}>{bot.description}</Text>
        </View>

        {/* Monthly Returns */}
        {bot.monthlyReturns.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>MONTHLY RETURNS</Text>
            <MonthlyReturnBars data={bot.monthlyReturns} />
          </View>
        )}

        {/* Recent Trades */}
        {bot.recentTrades.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Recent Trades" />
            <View style={styles.card}>
              {bot.recentTrades.slice(0, 3).map(trade => (
                <TradeRow key={trade.id} trade={trade} />
              ))}
            </View>
          </View>
        )}

        {/* Reviews */}
        {bot.reviews.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Reviews" />
            {bot.reviews.map(review => (
              <View key={review.id} style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  <View style={[styles.reviewAvatar, {backgroundColor: '#10B981'}]}>
                    <Text style={styles.reviewAvatarText}>{review.userInitials}</Text>
                  </View>
                  <View>
                    <Text style={styles.reviewName}>{review.userName}</Text>
                    <View style={styles.reviewStars}>
                      {[1,2,3,4,5].map(i => (
                        <StarIcon key={i} size={10} filled={i <= review.rating} color="#EAB308" />
                      ))}
                    </View>
                  </View>
                  <Text style={styles.reviewDate}>{review.date}</Text>
                </View>
                <Text style={styles.reviewText}>{review.text}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={{height: 120}} />
      </ScrollView>

      {/* Sticky footer CTA */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.shadowBtn} onPress={handleShadowMode} activeOpacity={0.8}>
          <Text style={styles.shadowBtnText}>Shadow Mode</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.activateBtn} onPress={handleActivate} activeOpacity={0.85}>
          <Text style={styles.activateBtnText}>
            {bot.price === 0 ? 'Activate Free' : `Activate — $${bot.price}/mo`}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0F1117'},
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {flex: 1, fontFamily: 'Inter-SemiBold', fontSize: 16, color: '#FFFFFF', textAlign: 'center', marginHorizontal: 8},
  scroll: {paddingHorizontal: 20},
  heroSection: {alignItems: 'center', paddingVertical: 16},
  botAvatar: {width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 12},
  botAvatarText: {fontFamily: 'Inter-Bold', fontSize: 28, color: '#FFFFFF'},
  botName: {fontFamily: 'Inter-Bold', fontSize: 22, color: '#FFFFFF', marginBottom: 4, letterSpacing: -0.3},
  botCreator: {fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 8},
  ratingRow: {flexDirection: 'row', alignItems: 'center', marginBottom: 4},
  ratingText: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.4)'},
  activeUsers: {fontFamily: 'Inter-Medium', fontSize: 12, color: 'rgba(255,255,255,0.35)'},
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16,
  },
  statCell: {
    flex: 1, minWidth: '45%',
    backgroundColor: '#161B22', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  statCellLabel: {fontFamily: 'Inter-Medium', fontSize: 9, letterSpacing: 0.8, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 6},
  statCellValue: {fontFamily: 'Inter-Bold', fontSize: 22, letterSpacing: -0.5},
  chartSection: {marginBottom: 16},
  section: {marginBottom: 20},
  sectionLabel: {fontFamily: 'Inter-Medium', fontSize: 10, letterSpacing: 1, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 10},
  tagsRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 6},
  tag: {marginBottom: 4},
  strategyText: {fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 22},
  card: {backgroundColor: '#161B22', borderRadius: 16, paddingHorizontal: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)'},
  reviewCard: {
    backgroundColor: '#161B22', borderRadius: 14, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  reviewHeader: {flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8},
  reviewAvatar: {width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center'},
  reviewAvatarText: {fontFamily: 'Inter-Bold', fontSize: 12, color: '#FFFFFF'},
  reviewName: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#FFFFFF'},
  reviewStars: {flexDirection: 'row', gap: 2, marginTop: 2},
  reviewDate: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.3)', marginLeft: 'auto'},
  reviewText: {fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 20},
  footer: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32,
    backgroundColor: '#0F1117', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
  },
  shadowBtn: {
    flex: 1, height: 52, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#161B22', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  shadowBtnText: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF'},
  activateBtn: {
    flex: 2, height: 52, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#10B981',
  },
  activateBtnText: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF'},
});
