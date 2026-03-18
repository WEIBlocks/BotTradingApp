import React, {useState, useCallback, useEffect} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, RefreshControl} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import Svg, {Path, Circle, Rect} from 'react-native-svg';
import {RootStackParamList} from '../../types';
import {useAuth} from '../../context/AuthContext';
import {userApi, UserProfile, WalletData, ActivityItem} from '../../services/user';
import SectionHeader from '../../components/common/SectionHeader';
import ChevronRightIcon from '../../components/icons/ChevronRightIcon';
import GiftIcon from '../../components/icons/GiftIcon';
import BellIcon from '../../components/icons/BellIcon';
import WalletIcon from '../../components/icons/WalletIcon';
import GearIcon from '../../components/icons/GearIcon';

function ActivityIcon({type}: {type: string}) {
  const size = 20;
  if (type === 'profit' || type === 'trade_profit') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d="M3 17L9 11L13 15L21 7" stroke="#10B981" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M15 7H21V13" stroke="#10B981" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }
  if (type === 'purchase' || type === 'bot_purchase') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Rect x={4} y={8} width={16} height={11} rx={3} stroke="#0D7FF2" strokeWidth={1.8} />
        <Path d="M9 8V6" stroke="#0D7FF2" strokeWidth={1.8} strokeLinecap="round" />
        <Path d="M15 8V6" stroke="#0D7FF2" strokeWidth={1.8} strokeLinecap="round" />
        <Circle cx={9.5} cy={13} r={1.2} fill="#0D7FF2" />
        <Circle cx={14.5} cy={13} r={1.2} fill="#0D7FF2" />
        <Path d="M10 17H14" stroke="#0D7FF2" strokeWidth={1.5} strokeLinecap="round" />
      </Svg>
    );
  }
  if (type === 'deposit') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d="M12 4V16" stroke="#10B981" strokeWidth={2} strokeLinecap="round" />
        <Path d="M8 12L12 16L16 12" stroke="#10B981" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M5 20H19" stroke="#10B981" strokeWidth={2} strokeLinecap="round" />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 20V8" stroke="#EF4444" strokeWidth={2} strokeLinecap="round" />
      <Path d="M8 12L12 8L16 12" stroke="#EF4444" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M5 4H19" stroke="#EF4444" strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function SwordsMenuIcon({size = 18, color = 'rgba(255,255,255,0.6)'}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M14.5 17.5L3 6V3h3l11.5 11.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M13 19l6-6M20.5 3.5l-6 6" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const SETTINGS = [
  {icon: BellIcon, label: 'Notifications', screen: 'Notifications'},
  {icon: WalletIcon, label: 'Wallet & Funds', screen: 'WalletFunds'},
  {icon: WalletIcon, label: 'Connected Exchanges', screen: 'ExchangeManage'},
  {icon: GearIcon, label: 'Subscription', screen: 'Subscription'},
  {icon: GearIcon, label: 'Creator Studio', screen: 'CreatorStudio'},
  {icon: SwordsMenuIcon, label: 'Battle History', screen: 'ArenaHistory'},
  {icon: GiftIcon, label: 'Refer a Friend', screen: 'Referral'},
  {icon: GearIcon, label: 'Settings', screen: 'Settings'},
];

export default function ProfileScreen() {
  const navigation = useNavigation<NavProp>();
  const {user: authUser, logout} = useAuth();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [profileData, walletData] = await Promise.all([
        userApi.getProfile(),
        userApi.getWallet(),
      ]);
      setProfile(profileData);
      // If wallet response has recentActivity, use as-is; otherwise fetch separately
      if (walletData && (!walletData.recentActivity || walletData.recentActivity.length === 0)) {
        try {
          const activityRes = await userApi.getActivity(1, 10);
          walletData.recentActivity = activityRes.items ?? [];
        } catch {}
      }
      setWallet(walletData);
    } catch (err) {
      console.warn('[Profile] fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Fetch on first focus and re-fetch when screen comes back into focus
  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const handleLogout = useCallback(async () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            setLoggingOut(true);
            try {
              await logout();
              // Navigation switches automatically via AuthContext → AppNavigator
            } catch {
              setLoggingOut(false);
              Alert.alert('Error', 'Failed to log out. Please try again.');
            }
          },
        },
      ],
    );
  }, [logout]);

  // Derive display values
  const displayName = profile?.name || authUser?.name || 'User';
  const displayEmail = profile?.email || authUser?.email || '';
  const avatarColor = profile?.avatarColor || '#10B981';
  const avatarInitials = profile?.avatarInitials || displayName.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
  const totalBalance = wallet ? parseFloat(wallet.totalBalance) : 0;
  const investmentGoal = profile?.investmentGoal || 'Not set';
  const referralCode = profile?.referralCode || '—';
  const recentActivity = wallet?.recentActivity || [];

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
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#10B981"
            colors={['#10B981']}
          />
        }>
        {/* Profile card */}
        <View style={styles.profileCard}>
          <View style={[styles.avatar, {backgroundColor: avatarColor}]}>
            <Text style={styles.avatarText}>{avatarInitials}</Text>
          </View>
          <Text style={styles.userName}>{displayName}</Text>
          <Text style={styles.userEmail}>{displayEmail}</Text>

          {/* Balance */}
          <View style={styles.balanceRow}>
            <View style={styles.balanceItem}>
              <Text style={styles.balanceValue}>
                ${totalBalance.toLocaleString('en-US', {minimumFractionDigits: 2})}
              </Text>
              <Text style={styles.balanceLabel}>Total Balance</Text>
            </View>
            <View style={styles.balanceDivider} />
            <View style={styles.balanceItem}>
              <Text style={[styles.balanceValue, {color: '#10B981'}]}>0.00%</Text>
              <Text style={styles.balanceLabel}>All Time Return</Text>
            </View>
          </View>

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNum}>0</Text>
              <Text style={styles.statLbl}>Active Bots</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNum}>{investmentGoal}</Text>
              <Text style={styles.statLbl}>Goal</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNum}>{referralCode}</Text>
              <Text style={styles.statLbl}>Ref. Code</Text>
            </View>
          </View>
        </View>

        {/* Recent Activity */}
        <View style={styles.section}>
          <SectionHeader
            title="Recent Activity"
            actionLabel="View All"
            onAction={() => navigation.navigate('TradeHistory')}
          />
          <View style={styles.card}>
            {recentActivity.length === 0 ? (
              <View style={styles.emptyRow}>
                <Text style={styles.emptyText}>No recent activity</Text>
              </View>
            ) : (
              recentActivity.map(activity => {
                const amount = parseFloat(activity.amount || '0');
                const isPositive = amount >= 0;
                const color = isPositive ? '#10B981' : '#EF4444';
                const sign = isPositive ? '+' : '';
                return (
                  <View key={activity.id} style={styles.activityRow}>
                    <View style={[styles.activityIcon, {backgroundColor: isPositive ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'}]}>
                      <ActivityIcon type={activity.type} />
                    </View>
                    <View style={styles.activityInfo}>
                      <Text style={styles.activityTitle}>{activity.title}</Text>
                      <Text style={styles.activitySubtitle}>
                        {new Date(activity.createdAt).toLocaleDateString()}
                      </Text>
                    </View>
                    <Text style={[styles.activityAmount, {color}]}>
                      {sign}${Math.abs(amount).toFixed(2)}
                    </Text>
                  </View>
                );
              })
            )}
          </View>
        </View>

        {/* Settings */}
        <View style={styles.section}>
          <SectionHeader title="Account" />
          <View style={styles.card}>
            {SETTINGS.map(({icon: Icon, label, screen}) => (
              <TouchableOpacity
                key={label}
                style={styles.settingsRow}
                onPress={() => screen && navigation.navigate(screen as any)}
                activeOpacity={0.7}>
                <View style={styles.settingsIcon}>
                  <Icon size={18} color="rgba(255,255,255,0.6)" />
                </View>
                <Text style={styles.settingsLabel}>{label}</Text>
                <ChevronRightIcon size={18} color="rgba(255,255,255,0.25)" />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={handleLogout}
          disabled={loggingOut}
          activeOpacity={0.7}>
          {loggingOut ? (
            <ActivityIndicator size="small" color="#EF4444" />
          ) : (
            <Text style={styles.logoutText}>Log Out</Text>
          )}
        </TouchableOpacity>

        <View style={{height: 32}} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0F1117'},
  header: {paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12},
  headerTitle: {fontFamily: 'Inter-Bold', fontSize: 24, color: '#FFFFFF'},
  profileCard: {
    marginHorizontal: 20, marginBottom: 8,
    backgroundColor: '#161B22', borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
  },
  avatar: {width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 12},
  avatarText: {fontFamily: 'Inter-Bold', fontSize: 24, color: '#FFFFFF'},
  userName: {fontFamily: 'Inter-Bold', fontSize: 20, color: '#FFFFFF', marginBottom: 4},
  userEmail: {fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 16},
  balanceRow: {
    flexDirection: 'row', width: '100%',
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 14, marginBottom: 12,
  },
  balanceItem: {flex: 1, alignItems: 'center'},
  balanceDivider: {width: 1, backgroundColor: 'rgba(255,255,255,0.08)'},
  balanceValue: {fontFamily: 'Inter-Bold', fontSize: 17, color: '#FFFFFF', marginBottom: 2},
  balanceLabel: {fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 0.5},
  statsRow: {flexDirection: 'row', gap: 20},
  statItem: {alignItems: 'center'},
  statNum: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF', marginBottom: 2},
  statLbl: {fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.35)'},
  section: {paddingHorizontal: 20, marginBottom: 8},
  card: {
    backgroundColor: '#161B22', borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 16,
  },
  emptyRow: {paddingVertical: 24, alignItems: 'center'},
  emptyText: {fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.3)'},
  activityRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)'},
  activityIcon: {width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12},
  activityInfo: {flex: 1},
  activityTitle: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF'},
  activitySubtitle: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 1},
  activityAmount: {fontFamily: 'Inter-SemiBold', fontSize: 15},
  settingsRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  settingsIcon: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  settingsLabel: {flex: 1, fontFamily: 'Inter-Medium', fontSize: 15, color: '#FFFFFF'},
  logoutBtn: {
    marginHorizontal: 20, height: 48, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
    backgroundColor: 'rgba(239,68,68,0.08)', marginBottom: 8,
  },
  logoutText: {fontFamily: 'Inter-SemiBold', fontSize: 15, color: '#EF4444'},
});
