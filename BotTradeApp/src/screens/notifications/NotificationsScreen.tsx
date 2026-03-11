import React, {useState} from 'react';
import {View, Text, StyleSheet, FlatList, TouchableOpacity} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../types';
import {mockNotifications} from '../../data/mockNotifications';
import TabChip from '../../components/common/TabChip';
import Badge from '../../components/common/Badge';
import MiniLineChart from '../../components/charts/MiniLineChart';
import ChevronLeftIcon from '../../components/icons/ChevronLeftIcon';
import GearIcon from '../../components/icons/GearIcon';

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

const TABS = ['All', 'Trades', 'System', 'Alerts'];

function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationsScreen({navigation}: Props) {
  const [activeTab, setActiveTab] = useState('All');

  const filtered = mockNotifications.filter(n => {
    if (activeTab === 'All') return true;
    return n.type === activeTab.toLowerCase();
  });

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <ChevronLeftIcon size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Smart Notifications</Text>
        <TouchableOpacity style={styles.iconBtn}>
          <GearIcon size={20} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
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
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({item}) => {
          const isHighPriority = item.priority === 'high';
          return (
            <View style={[styles.notifCard, !item.read && styles.notifCardUnread, isHighPriority && styles.notifCardHigh]}>
              {/* Top row */}
              <View style={styles.notifTop}>
                <View style={styles.notifLeft}>
                  {item.type === 'alert' && <Badge label="HIGH SIGNAL" variant="green" size="sm" />}
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

              {/* Actions */}
              {item.type === 'alert' && (
                <View style={styles.notifActions}>
                  <TouchableOpacity style={styles.viewBtn}>
                    <Text style={styles.viewBtnText}>View Trade Details</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Unread dot */}
              {!item.read && <View style={styles.unreadDot} />}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0F1117'},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12},
  iconBtn: {width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center'},
  headerTitle: {fontFamily: 'Inter-Bold', fontSize: 18, color: '#FFFFFF'},
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
