import React, {useCallback} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import Svg, {Circle, Path, Rect} from 'react-native-svg';
import {AuthStackParamList} from '../../types';
import {useAuth} from '../../context/AuthContext';
import Badge from '../../components/common/Badge';
import LockIcon from '../../components/icons/LockIcon';
import ChevronLeftIcon from '../../components/icons/ChevronLeftIcon';

type Props = NativeStackScreenProps<AuthStackParamList, 'ConnectCapital'>;

// Paper Trading icon — person at desk / chart icon
function PaperTradingIcon() {
  return (
    <Svg width={28} height={28} viewBox="0 0 28 28" fill="none">
      {/* Person silhouette */}
      <Circle cx={14} cy={8} r={4} fill="#FFFFFF" />
      {/* Desk/table line */}
      <Rect x={4} y={18} width={20} height={2} rx={1} fill="#FFFFFF" opacity={0.9} />
      {/* Body */}
      <Path d="M8 18 Q8 13 14 13 Q20 13 20 18" fill="#FFFFFF" />
      {/* Chart bars on table */}
      <Rect x={7} y={13} width={3} height={5} rx={1} fill="#FFFFFF" opacity={0.5} />
      <Rect x={12} y={11} width={3} height={7} rx={1} fill="#FFFFFF" opacity={0.5} />
      <Rect x={17} y={14} width={3} height={4} rx={1} fill="#FFFFFF" opacity={0.5} />
    </Svg>
  );
}

// Alpaca icon — 'a' on dark green
function AlpacaIcon() {
  return (
    <Svg width={40} height={40} viewBox="0 0 40 40" fill="none">
      <Rect width={40} height={40} rx={10} fill="#1E3A2F" />
      <Path
        d="M14 28 L14 16 Q14 12 20 12 Q26 12 26 16 L26 28 M14 20 L26 20"
        stroke="#A3E4C8"
        strokeWidth={2.5}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

// Interactive Brokers icon — 'IB' on yellow/gold
function IBIcon() {
  return (
    <Svg width={40} height={40} viewBox="0 0 40 40" fill="none">
      <Rect width={40} height={40} rx={10} fill="#B8860B" />
      <Path d="M13 12 L13 28" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" />
      <Path
        d="M19 12 L19 28 M19 12 Q26 12 26 16 Q26 20 19 20 Q26 20 26 24 Q26 28 19 28"
        stroke="#FFFFFF"
        strokeWidth={2.5}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

// Coinbase icon — concentric circles / CB logo
function CoinbaseIcon() {
  return (
    <Svg width={40} height={40} viewBox="0 0 40 40" fill="none">
      <Rect width={40} height={40} rx={10} fill="#1A1F2E" />
      <Circle cx={20} cy={20} r={11} stroke="#0052FF" strokeWidth={2} />
      <Circle cx={20} cy={20} r={7} fill="#0052FF" />
      <Path d="M16 20 Q16 16 20 16 Q24 16 24 20 Q24 24 20 24 Q16 24 16 20" fill="#FFFFFF" />
    </Svg>
  );
}

// Info icon (ⓘ)
function InfoIcon({size = 20, color = '#10B981'}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Circle cx={10} cy={10} r={9} stroke={color} strokeWidth={1.5} />
      <Path d="M10 9 L10 14" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <Circle cx={10} cy={6.5} r={1} fill={color} />
    </Svg>
  );
}

const BROKERAGES = [
  {
    name: 'Alpaca',
    subtitle: 'Commission-free API',
    Icon: AlpacaIcon,
  },
  {
    name: 'Interactive Brokers',
    subtitle: 'Global Multi-Asset',
    Icon: IBIcon,
  },
  {
    name: 'Coinbase',
    subtitle: 'Crypto Assets',
    Icon: CoinbaseIcon,
  },
];

export default function ConnectCapitalScreen({navigation}: Props) {
  const {completeOnboarding} = useAuth();

  const handleNavigateMain = useCallback(() => {
    // Complete onboarding — this flips the flag and AppNavigator switches to Main
    completeOnboarding();
  }, [completeOnboarding]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeftIcon size={20} color="#10B981" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account Setup</Text>
        <TouchableOpacity style={styles.infoBtn} onPress={() => Alert.alert('About Capital Connection', 'Connect your brokerage account to enable live automated trading, or start with paper trading to practice risk-free.')}>
          <InfoIcon size={20} color="#10B981" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Title */}
        <Text style={styles.title}>Connect your Capital</Text>
        <Text style={styles.subtitle}>
          Link your existing brokerage to automate your strategies or test risk-free with virtual funds.
        </Text>

        {/* Paper Trading Card */}
        <View style={styles.featuredCard}>
          <View style={styles.featuredTopRow}>
            {/* Icon + Name + subtitle */}
            <View style={styles.featuredIconWrap}>
              <PaperTradingIcon />
            </View>
            <View style={styles.featuredNameCol}>
              <Text style={styles.featuredName}>Paper Trading</Text>
              <Text style={styles.featuredSubtitle}>No risk, real-time simulation</Text>
            </View>
            <Badge label="RECOMMENDED" variant="green" size="sm" />
          </View>

          {/* Description + Button */}
          <View style={styles.featuredBottomRow}>
            <Text style={styles.featuredDesc}>
              Practice your strategies with $100k virtual funds before going live.
            </Text>
            <TouchableOpacity style={styles.getStartedBtn} onPress={handleNavigateMain} activeOpacity={0.85}>
              <Text style={styles.getStartedText}>Get Started</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Available Brokerages */}
        <Text style={styles.sectionLabel}>AVAILABLE BROKERAGES</Text>

        {BROKERAGES.map(b => (
          <View key={b.name} style={styles.brokerRow}>
            <b.Icon />
            <View style={styles.brokerInfo}>
              <Text style={styles.brokerName}>{b.name}</Text>
              <Text style={styles.brokerSubtitle}>{b.subtitle}</Text>
            </View>
            <TouchableOpacity style={styles.connectBtn} activeOpacity={0.7} onPress={() => Alert.alert('Coming Soon', `${b.name} integration is coming soon. Start with paper trading to get started immediately!`)}>
              <Text style={styles.connectText}>Connect</Text>
            </TouchableOpacity>
          </View>
        ))}

        {/* Request brokerage */}
        <TouchableOpacity style={styles.requestRow} activeOpacity={0.7} onPress={() => Alert.alert('Request Brokerage', 'Your request has been noted! We\'ll notify you when new brokerages become available.')}>
          <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
            <Circle cx={8} cy={8} r={7} stroke="rgba(255,255,255,0.3)" strokeWidth={1.2} />
            <Path d="M8 5 L8 11 M5 8 L11 8" stroke="rgba(255,255,255,0.3)" strokeWidth={1.2} strokeLinecap="round" />
          </Svg>
          <Text style={styles.requestText}>Request another brokerage</Text>
        </TouchableOpacity>

        {/* Security footer */}
        <View style={styles.securityRow}>
          <LockIcon size={13} color="rgba(255,255,255,0.3)" />
          <Text style={styles.securityText}>Secure 256-bit encrypted connection</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0F1117'},
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16,
  },
  backBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
  },
  infoBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {fontFamily: 'Inter-SemiBold', fontSize: 17, color: '#FFFFFF'},
  scroll: {paddingHorizontal: 20, paddingTop: 4, paddingBottom: 48},

  title: {
    fontFamily: 'Inter-Bold', fontSize: 28, color: '#FFFFFF',
    letterSpacing: -0.5, marginBottom: 10,
  },
  subtitle: {
    fontFamily: 'Inter-Regular', fontSize: 14,
    color: 'rgba(255,255,255,0.5)', lineHeight: 20, marginBottom: 24,
  },

  // Featured Paper Trading Card
  featuredCard: {
    backgroundColor: '#161B22', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)', marginBottom: 28,
  },
  featuredTopRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 14,
  },
  featuredIconWrap: {
    width: 50, height: 50, borderRadius: 12,
    backgroundColor: '#10B981',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  featuredNameCol: {flex: 1},
  featuredName: {fontFamily: 'Inter-Bold', fontSize: 16, color: '#FFFFFF', marginBottom: 2},
  featuredSubtitle: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.5)'},
  featuredBottomRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  featuredDesc: {
    flex: 1, fontFamily: 'Inter-Regular', fontSize: 12,
    color: 'rgba(255,255,255,0.5)', lineHeight: 17,
  },
  getStartedBtn: {
    backgroundColor: '#10B981', borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  getStartedText: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#FFFFFF'},

  // Section label
  sectionLabel: {
    fontFamily: 'Inter-SemiBold', fontSize: 11, letterSpacing: 1.2,
    color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 12,
  },

  // Brokerage rows
  brokerRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#161B22', borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  brokerInfo: {flex: 1, marginLeft: 14},
  brokerName: {fontFamily: 'Inter-SemiBold', fontSize: 15, color: '#FFFFFF'},
  brokerSubtitle: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2},
  connectBtn: {
    borderWidth: 1.5, borderColor: '#10B981', borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  connectText: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#10B981'},

  // Request row
  requestRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderStyle: 'dashed',
    borderRadius: 14, paddingVertical: 16, marginTop: 4, marginBottom: 28,
  },
  requestText: {fontFamily: 'Inter-Medium', fontSize: 13, color: 'rgba(255,255,255,0.35)'},

  // Security
  securityRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6},
  securityText: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.3)'},
});
