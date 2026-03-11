import React, {useState} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import Svg, {Path} from 'react-native-svg';
import {RootStackParamList} from '../../types';
import {mockUser} from '../../data/mockUser';
import ChevronLeftIcon from '../../components/icons/ChevronLeftIcon';
import WalletIcon from '../../components/icons/WalletIcon';
import ArrowUpIcon from '../../components/icons/ArrowUpIcon';
import ArrowDownIcon from '../../components/icons/ArrowDownIcon';

function TxIcon({type}: {type: string}) {
  const size = 18;
  if (type === 'deposit') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d="M12 4V16" stroke="#10B981" strokeWidth={2} strokeLinecap="round" />
        <Path d="M8 12L12 16L16 12" stroke="#10B981" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M5 20H19" stroke="#10B981" strokeWidth={2} strokeLinecap="round" />
      </Svg>
    );
  }
  if (type === 'withdrawal') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d="M12 20V8" stroke="#EF4444" strokeWidth={2} strokeLinecap="round" />
        <Path d="M8 12L12 8L16 12" stroke="#EF4444" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M5 4H19" stroke="#EF4444" strokeWidth={2} strokeLinecap="round" />
      </Svg>
    );
  }
  // default: trend up
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 17L9 11L13 15L21 7" stroke="#10B981" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M15 7H21V13" stroke="#10B981" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

type Props = NativeStackScreenProps<RootStackParamList, 'WalletFunds'>;

export default function WalletFundsScreen({navigation}: Props) {
  const [selectedAction, setSelectedAction] = useState<'deposit' | 'withdraw' | null>(null);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <ChevronLeftIcon size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Wallet &amp; Funds</Text>
        <View style={{width: 40}} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Balance card */}
        <View style={styles.balanceCard}>
          <WalletIcon size={28} color="#10B981" />
          <Text style={styles.balanceLabel}>TOTAL BALANCE</Text>
          <Text style={styles.balanceValue}>${mockUser.totalBalance.toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
          <View style={styles.subBalances}>
            <View style={styles.subItem}>
              <Text style={styles.subValue}>${mockUser.accountBalance.toLocaleString()}</Text>
              <Text style={styles.subLabel}>Invested</Text>
            </View>
            <View style={styles.subDivider} />
            <View style={styles.subItem}>
              <Text style={styles.subValue}>${mockUser.buyingPower.toLocaleString()}</Text>
              <Text style={styles.subLabel}>Available</Text>
            </View>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={[styles.actionBtn, selectedAction === 'deposit' && styles.actionBtnActive]} onPress={() => setSelectedAction('deposit')}>
            <ArrowDownIcon size={20} color="#10B981" />
            <Text style={styles.actionText}>Deposit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, selectedAction === 'withdraw' && styles.actionBtnActive]} onPress={() => setSelectedAction('withdraw')}>
            <ArrowUpIcon size={20} color="#EF4444" />
            <Text style={styles.actionText}>Withdraw</Text>
          </TouchableOpacity>
        </View>

        {/* Recent transactions */}
        <Text style={styles.sectionLabel}>RECENT TRANSACTIONS</Text>
        {mockUser.recentActivity.map(activity => (
          <View key={activity.id} style={styles.txRow}>
            <View style={[styles.txIcon, {backgroundColor: activity.amount >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'}]}>
              <TxIcon type={activity.type} />
            </View>
            <View style={styles.txInfo}>
              <Text style={styles.txTitle}>{activity.title}</Text>
              <Text style={styles.txSub}>{activity.subtitle}</Text>
            </View>
            <Text style={[styles.txAmount, {color: activity.amount >= 0 ? '#10B981' : '#EF4444'}]}>
              {activity.amount >= 0 ? '+' : ''}${Math.abs(activity.amount).toFixed(2)}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0F1117'},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12},
  iconBtn: {width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center'},
  headerTitle: {fontFamily: 'Inter-Bold', fontSize: 20, color: '#FFFFFF'},
  scroll: {paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40},
  balanceCard: {
    backgroundColor: '#161B22', borderRadius: 20, padding: 24, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)', marginBottom: 20,
  },
  balanceLabel: {fontFamily: 'Inter-Medium', fontSize: 10, letterSpacing: 1, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginTop: 10, marginBottom: 4},
  balanceValue: {fontFamily: 'Inter-Bold', fontSize: 36, color: '#FFFFFF', letterSpacing: -1.5, marginBottom: 16},
  subBalances: {flexDirection: 'row', width: '100%', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 12},
  subItem: {flex: 1, alignItems: 'center'},
  subValue: {fontFamily: 'Inter-SemiBold', fontSize: 16, color: '#FFFFFF', marginBottom: 2},
  subLabel: {fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.35)'},
  subDivider: {width: 1, backgroundColor: 'rgba(255,255,255,0.08)'},
  actionsRow: {flexDirection: 'row', gap: 10, marginBottom: 24},
  actionBtn: {
    flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 8,
    backgroundColor: '#161B22', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  actionBtnActive: {borderColor: 'rgba(16,185,129,0.4)', backgroundColor: 'rgba(16,185,129,0.08)'},
  actionText: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF'},
  sectionLabel: {fontFamily: 'Inter-Medium', fontSize: 10, letterSpacing: 1, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 12},
  txRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)'},
  txIcon: {width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12},
  txInfo: {flex: 1},
  txTitle: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF'},
  txSub: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 1},
  txAmount: {fontFamily: 'Inter-SemiBold', fontSize: 15},
});
