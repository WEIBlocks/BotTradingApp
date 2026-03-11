import React from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../types';
import {mockUser} from '../../data/mockUser';
import ChevronLeftIcon from '../../components/icons/ChevronLeftIcon';
import GiftIcon from '../../components/icons/GiftIcon';
import CopyIcon from '../../components/icons/CopyIcon';
import CheckCircleIcon from '../../components/icons/CheckCircleIcon';
import ClockIcon from '../../components/icons/ClockIcon';

type Props = NativeStackScreenProps<RootStackParamList, 'Referral'>;

const SHARE_OPTIONS = [
  {label: 'WhatsApp', color: '#25D366', emoji: '💬'},
  {label: 'Twitter', color: '#1DA1F2', emoji: '🐦'},
  {label: 'Message', color: '#3478F6', emoji: '📱'},
  {label: 'Email', color: '#EA4335', emoji: '📧'},
];

const REWARDS_HISTORY = [
  {id: 'r1', icon: 'check', title: 'Friend Joined', subtitle: 'Alex joined using your link', done: true},
  {id: 'r2', icon: 'check', title: 'Bot Activated', subtitle: 'Alex started "Smart Growth" bot', done: true},
  {id: 'r3', icon: 'clock', title: 'Reward Pending', subtitle: 'Processing $50 credit', done: false},
];

export default function ReferralScreen({navigation}: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <ChevronLeftIcon size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Refer a Friend</Text>
        <View style={{width: 40}} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.heroSection}>
          <View style={styles.giftCircle}>
            <GiftIcon size={48} color="#10B981" />
          </View>
          <Text style={styles.heroTitle}>Give $50, Get $50</Text>
          <Text style={styles.heroSubtitle}>
            Invite friends to BotTrade and earn $50 in trading credits when they make their first trade. No limits on referrals!
          </Text>
        </View>

        {/* Referral code */}
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>YOUR REFERRAL CODE</Text>
          <View style={styles.codeRow}>
            <Text style={styles.codeText}>{mockUser.referralCode}</Text>
            <TouchableOpacity style={styles.copyBtn}>
              <CopyIcon size={18} color="#10B981" />
              <Text style={styles.copyText}>Copy</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Share buttons */}
        <Text style={styles.sectionLabel}>SHARE VIA</Text>
        <View style={styles.shareRow}>
          {SHARE_OPTIONS.map(option => (
            <TouchableOpacity key={option.label} style={styles.shareBtn} activeOpacity={0.7}>
              <Text style={styles.shareEmoji}>{option.emoji}</Text>
              <Text style={styles.shareLabel}>{option.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Rewards history */}
        <Text style={styles.sectionLabel}>REWARDS HISTORY</Text>
        <View style={styles.timelineContainer}>
          {REWARDS_HISTORY.map((item, i) => (
            <View key={item.id} style={styles.timelineItem}>
              <View style={styles.timelineLeft}>
                <View style={[styles.timelineIcon, item.done ? styles.timelineIconDone : styles.timelineIconPending]}>
                  {item.done
                    ? <CheckCircleIcon size={18} color="#10B981" />
                    : <ClockIcon size={18} color="#F59E0B" />}
                </View>
                {i < REWARDS_HISTORY.length - 1 && <View style={styles.timelineLine} />}
              </View>
              <View style={styles.timelineContent}>
                <Text style={styles.timelineTitle}>{item.title}</Text>
                <Text style={styles.timelineSubtitle}>{item.subtitle}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Invite button */}
        <TouchableOpacity style={styles.inviteBtn} activeOpacity={0.85}>
          <Text style={styles.inviteBtnText}>Invite Contacts</Text>
        </TouchableOpacity>
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
  heroSection: {alignItems: 'center', paddingVertical: 24},
  giftCircle: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderWidth: 2, borderColor: 'rgba(16,185,129,0.3)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  heroTitle: {fontFamily: 'Inter-Bold', fontSize: 28, color: '#FFFFFF', marginBottom: 8, letterSpacing: -0.5},
  heroSubtitle: {fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 20},
  codeCard: {
    backgroundColor: '#161B22', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)', marginBottom: 24,
  },
  codeLabel: {fontFamily: 'Inter-Medium', fontSize: 10, letterSpacing: 1, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 8},
  codeRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  codeText: {fontFamily: 'Inter-Bold', fontSize: 22, color: '#FFFFFF', letterSpacing: 2},
  copyBtn: {flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: 'rgba(16,185,129,0.12)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)'},
  copyText: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#10B981'},
  sectionLabel: {fontFamily: 'Inter-Medium', fontSize: 10, letterSpacing: 1, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 12},
  shareRow: {flexDirection: 'row', gap: 8, marginBottom: 28},
  shareBtn: {flex: 1, backgroundColor: '#161B22', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)'},
  shareEmoji: {fontSize: 22, marginBottom: 4},
  shareLabel: {fontFamily: 'Inter-Medium', fontSize: 11, color: 'rgba(255,255,255,0.5)'},
  timelineContainer: {marginBottom: 24},
  timelineItem: {flexDirection: 'row', marginBottom: 4},
  timelineLeft: {alignItems: 'center', marginRight: 14},
  timelineIcon: {width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center'},
  timelineIconDone: {backgroundColor: 'rgba(16,185,129,0.12)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)'},
  timelineIconPending: {backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)'},
  timelineLine: {width: 2, flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 2, marginBottom: 4},
  timelineContent: {flex: 1, paddingBottom: 16, paddingTop: 6},
  timelineTitle: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF', marginBottom: 2},
  timelineSubtitle: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.4)'},
  inviteBtn: {height: 56, backgroundColor: '#10B981', borderRadius: 14, alignItems: 'center', justifyContent: 'center'},
  inviteBtnText: {fontFamily: 'Inter-SemiBold', fontSize: 16, color: '#FFFFFF'},
});
