import React, {useState, useCallback} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../types';
import {mockUser} from '../../data/mockUser';
import {mockTrades} from '../../data/mockTrades';
import {dashboardEquityData} from '../../data/mockEquityData';
import EquityChart from '../../components/charts/EquityChart';
import SectionHeader from '../../components/common/SectionHeader';
import ActiveBotRow from '../../components/common/ActiveBotRow';
import TradeRow from '../../components/common/TradeRow';
import BellIcon from '../../components/icons/BellIcon';
import SearchIcon from '../../components/icons/SearchIcon';
import PlusIcon from '../../components/icons/PlusIcon';

const {width} = Dimensions.get('window');
const CHART_WIDTH = width - 48;

const TIMEFRAMES = ['1D', '1W', '1M', 'ALL'];

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function DashboardScreen() {
  const navigation = useNavigation<NavProp>();
  const [selectedTF, setSelectedTF] = useState('1M');
  const user = mockUser;

  const isPositive = user.totalProfitPercent >= 0;
  const profitColor = isPositive ? '#10B981' : '#EF4444';
  const profitSign = isPositive ? '+' : '';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.avatarRow}>
          <View style={[styles.avatar, {backgroundColor: user.avatarColor}]}>
            <Text style={styles.avatarText}>{user.avatarInitials}</Text>
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.greeting}>Good morning 👋</Text>
            <Text style={styles.userName}>{user.name}</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => navigation.navigate('Notifications')}>
            <BellIcon size={20} color="rgba(255,255,255,0.7)" hasDot />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn}>
            <SearchIcon size={20} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Balance card */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>TOTAL BALANCE</Text>
          <Text style={styles.balanceValue}>${user.totalBalance.toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
          <View style={styles.profitRow}>
            <View style={[styles.profitBadge, {backgroundColor: isPositive ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}]}>
              <Text style={[styles.profitBadgeText, {color: profitColor}]}>
                {profitSign}{user.totalProfitPercent.toFixed(2)}%
              </Text>
            </View>
            <Text style={[styles.profitAmount, {color: profitColor}]}>
              {profitSign}${user.totalProfit.toFixed(2)} today
            </Text>
          </View>

          {/* Metrics row */}
          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>ACCOUNT BALANCE</Text>
              <Text style={styles.metricValue}>${user.accountBalance.toLocaleString()}</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>BUYING POWER</Text>
              <Text style={styles.metricValue}>${user.buyingPower.toLocaleString()}</Text>
            </View>
          </View>
        </View>

        {/* Chart section */}
        <View style={styles.chartSection}>
          <View style={styles.timeframeRow}>
            {TIMEFRAMES.map(tf => (
              <TouchableOpacity
                key={tf}
                style={[styles.tfBtn, selectedTF === tf && styles.tfBtnActive]}
                onPress={() => setSelectedTF(tf)}>
                <Text style={[styles.tfText, selectedTF === tf && styles.tfTextActive]}>{tf}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <EquityChart data={dashboardEquityData} width={CHART_WIDTH} height={140} />
        </View>

        {/* Active bots */}
        <View style={styles.section}>
          <SectionHeader
            title="Active Bots"
            actionLabel="View Store"
            onAction={() => navigation.navigate('Main')}
          />
          <View style={styles.card}>
            {user.activeBots.map(bot => (
              <ActiveBotRow
                key={bot.id}
                bot={bot}
                onPress={() => navigation.navigate('BotDetails', {botId: bot.id})}
              />
            ))}
          </View>
        </View>

        {/* Recent trades */}
        <View style={styles.section}>
          <SectionHeader
            title="Recent Trades"
            actionLabel="History"
            onAction={() => navigation.navigate('TradeHistory')}
          />
          <View style={styles.card}>
            {mockTrades.slice(0, 4).map(trade => (
              <TradeRow key={trade.id} trade={trade} />
            ))}
          </View>
        </View>

        <View style={{height: 32}} />
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('QuickActions')}
        activeOpacity={0.85}>
        <PlusIcon size={22} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0F1117'},
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16,
  },
  avatarRow: {flexDirection: 'row', alignItems: 'center', gap: 12},
  avatar: {width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center'},
  avatarText: {fontFamily: 'Inter-Bold', fontSize: 14, color: '#FFFFFF'},
  headerInfo: {},
  greeting: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.4)'},
  userName: {fontFamily: 'Inter-SemiBold', fontSize: 15, color: '#FFFFFF'},
  headerActions: {flexDirection: 'row', gap: 8},
  iconBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  balanceCard: {
    marginHorizontal: 20, marginBottom: 16,
    backgroundColor: '#161B22', borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  balanceLabel: {fontFamily: 'Inter-Medium', fontSize: 10, letterSpacing: 1, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 6},
  balanceValue: {fontFamily: 'Inter-Bold', fontSize: 38, color: '#FFFFFF', letterSpacing: -1.5, marginBottom: 8},
  profitRow: {flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16},
  profitBadge: {paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99},
  profitBadgeText: {fontFamily: 'Inter-SemiBold', fontSize: 12},
  profitAmount: {fontFamily: 'Inter-Medium', fontSize: 13},
  metricsRow: {
    flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12, padding: 12,
  },
  metricItem: {flex: 1},
  metricDivider: {width: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginHorizontal: 12},
  metricLabel: {fontFamily: 'Inter-Medium', fontSize: 9, letterSpacing: 0.8, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 4},
  metricValue: {fontFamily: 'Inter-SemiBold', fontSize: 16, color: '#FFFFFF'},
  chartSection: {marginHorizontal: 20, marginBottom: 4},
  timeframeRow: {flexDirection: 'row', gap: 4, marginBottom: 12},
  tfBtn: {paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8},
  tfBtnActive: {backgroundColor: 'rgba(16,185,129,0.15)'},
  tfText: {fontFamily: 'Inter-Medium', fontSize: 12, color: 'rgba(255,255,255,0.35)'},
  tfTextActive: {color: '#10B981'},
  section: {paddingHorizontal: 20},
  card: {
    backgroundColor: '#161B22', borderRadius: 16, padding: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 16,
  },
  fab: {
    position: 'absolute', bottom: 92, right: 20,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#10B981',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#10B981', shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.5, shadowRadius: 12, elevation: 10,
  },
});
