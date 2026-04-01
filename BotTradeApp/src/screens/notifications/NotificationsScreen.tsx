import React, {useState, useCallback} from 'react';
import {View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';
import {useToast} from '../../context/ToastContext';
import Svg, {Path, Circle, Rect} from 'react-native-svg';
import {RootStackParamList, Notification} from '../../types';
import {notificationsService} from '../../services/notifications';
import TabChip from '../../components/common/TabChip';
import Badge from '../../components/common/Badge';
import MiniLineChart from '../../components/charts/MiniLineChart';
import ChevronLeftIcon from '../../components/icons/ChevronLeftIcon';

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

const TABS = ['All', 'Trades', 'System', 'Alerts'];

function SettingsGearIcon({size = 20, color = 'rgba(255,255,255,0.6)'}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth={1.5} />
      <Path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function EmptyBellIcon() {
  return (
    <Svg width={56} height={56} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9z"
        stroke="rgba(255,255,255,0.15)"
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      <Path
        d="M13.73 21a2 2 0 01-3.46 0"
        stroke="rgba(255,255,255,0.15)"
        strokeWidth={1.2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function EmptyState({tab = 'All'}: {tab?: string}) {
  const messages: Record<string, {icon: string; title: string; subtitle: string}> = {
    'All': {icon: '🔔', title: 'No notifications yet', subtitle: 'When your bots trade or important events occur,\nyou\'ll see them here.'},
    'Trades': {icon: '📊', title: 'No trade notifications', subtitle: 'Trade alerts will appear here when your\nbots execute BUY or SELL orders.'},
    'System': {icon: '⚙️', title: 'No system notifications', subtitle: 'System updates, connection changes, and\naccount alerts will appear here.'},
    'Alerts': {icon: '🚨', title: 'No alerts', subtitle: 'Price alerts, risk warnings, and important\nsignals will appear here.'},
  };
  const msg = messages[tab] || messages['All'];
  return (
    <View style={emptyStyles.container}>
      <Text style={{fontSize: 48, marginBottom: 16}}>{msg.icon}</Text>
      <Text style={emptyStyles.title}>{msg.title}</Text>
      <Text style={emptyStyles.subtitle}>{msg.subtitle}</Text>
    </View>
  );
}

function timeAgo(dateStr: string | Date): string {
  const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  const diff = Math.max(0, Date.now() - date.getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationsScreen({navigation}: Props) {
  const {alert: showAlert} = useToast();
  const [activeTab, setActiveTab] = useState('All');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await notificationsService.list(1, 50);
      const mapped: Notification[] = res.notifications.map(n => ({
        id: n.id,
        type: n.type as Notification['type'],
        title: n.title,
        body: n.body,
        timestamp: new Date(n.createdAt),
        read: n.read,
        priority: n.priority === 'medium' ? 'normal' : n.priority as Notification['priority'],
      }));
      setNotifications(mapped);
    } catch {
      showAlert('Error', 'Failed to load notifications. Pull down to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    fetchNotifications().then(() => {
      // Mark all as read when screen is viewed
      notificationsService.markAllRead().catch(() => {});
    });
  }, [fetchNotifications]));

  const handleMarkRead = useCallback(async (id: string) => {
    try {
      await notificationsService.markRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? {...n, read: true} : n));
    } catch {}
  }, []);

  // Map tab names to DB enum values (Trades→trade, Alerts→alert, System→system)
  const tabToType: Record<string, string> = { 'Trades': 'trade', 'Alerts': 'alert', 'System': 'system' };
  const filtered = notifications.filter(n => {
    if (activeTab === 'All') return true;
    return n.type === tabToType[activeTab];
  });

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
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <ChevronLeftIcon size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Smart Notifications</Text>
        {/* <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('NotificationSettings' as any)}>
          <SettingsGearIcon size={20} />
        </TouchableOpacity> */}
      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        {TABS.map(tab => (
          <TabChip key={tab} label={tab} active={activeTab === tab} onPress={() => setActiveTab(tab)} />
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.listContent, filtered.length === 0 && {flex: 1}]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<EmptyState tab={activeTab} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchNotifications(); }}
            tintColor="#10B981"
            colors={['#10B981']}
            progressBackgroundColor="#161B22"
          />
        }
        renderItem={({item}) => {
          const isHighPriority = item.priority === 'high';
          return (
            <TouchableOpacity
              style={[styles.notifCard, !item.read && styles.notifCardUnread, isHighPriority && styles.notifCardHigh]}
              activeOpacity={0.8}
              onPress={() => {
                if (!item.read) handleMarkRead(item.id);
                // Navigate based on notification type
                if (item.type === 'trade') {
                  navigation.navigate('TradeHistory' as any);
                } else if (item.type === 'alert') {
                  navigation.navigate('TradeHistory' as any);
                }
              }}>
              {/* Top row */}
              <View style={styles.notifTop}>
                <View style={styles.notifLeft}>
                  {item.type === 'alert' && <Badge label="ALERT" variant="green" size="sm" />}
                  {item.type === 'system' && <Badge label="SYSTEM" variant="blue" size="sm" />}
                  {item.type === 'trade' && <Badge label="TRADE" variant="purple" size="sm" />}
                </View>
                {item.chartData && (
                  <MiniLineChart data={item.chartData} width={60} height={30} color="#10B981" />
                )}
                <Text style={styles.notifTime}>{timeAgo(item.timestamp)}</Text>
              </View>

              {/* Content */}
              <Text style={styles.notifTitle}>{item.title}</Text>
              <Text style={styles.notifBody} numberOfLines={3}>{item.body}</Text>

              {/* Action button — only for trade notifications */}
              {item.type === 'trade' && (
                <View style={styles.notifActions}>
                  <TouchableOpacity
                    style={styles.viewBtn}
                    onPress={() => navigation.navigate('TradeHistory' as any)}>
                    <Text style={styles.viewBtnText}>View Trade History</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Unread dot */}
              {!item.read && <View style={styles.unreadDot} />}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0F1117'},
  header: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12},
  iconBtn: {width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center'},
  headerTitle: {fontFamily: 'Inter-Bold', fontSize: 18, marginLeft: 18, color: '#FFFFFF'},
  tabsRow: {flexDirection: 'row', paddingHorizontal: 20, marginBottom: 8, gap: 4},
  listContent: {paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32},
  notifCard: {
    backgroundColor: '#161B22', borderRadius: 16, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', position: 'relative',
  },
  notifCardUnread: {borderColor: 'rgba(16,185,129,0.2)'},
  notifCardHigh: {borderColor: 'rgba(16,185,129,0.3)', backgroundColor: 'rgba(16,185,129,0.04)'},
  notifTop: {flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8},
  notifLeft: {flex: 1},
  notifTime: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.35)'},
  notifTitle: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF', marginBottom: 4},
  notifBody: {fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 18},
  notifActions: {marginTop: 10},
  viewBtn: {
    height: 36, backgroundColor: 'rgba(16,185,129,0.15)',
    borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)',
  },
  viewBtnText: {fontFamily: 'Inter-SemiBold', fontSize: 12, color: '#10B981'},
  unreadDot: {
    position: 'absolute', top: 12, right: 12,
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981',
  },
});

const emptyStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  title: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 17,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    lineHeight: 20,
  },
});
