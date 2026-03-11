import React, {useCallback} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import LinearGradient from 'react-native-linear-gradient';
import {AuthStackParamList} from '../../types';
import Badge from '../../components/common/Badge';
import LockIcon from '../../components/icons/LockIcon';
import ChevronLeftIcon from '../../components/icons/ChevronLeftIcon';
import ChevronRightIcon from '../../components/icons/ChevronRightIcon';

type Props = NativeStackScreenProps<AuthStackParamList, 'ConnectCapital'>;

const BROKERAGES = [
  {name: 'Alpaca', subtitle: 'US Stocks & Crypto', color: '#FFF', letter: 'A', bg: '#FF0000'},
  {name: 'Interactive Brokers', subtitle: 'Stocks, Options, Futures', color: '#FFF', letter: 'IB', bg: '#CC0000'},
  {name: 'Coinbase', subtitle: 'Crypto only', color: '#FFF', letter: 'CB', bg: '#0052FF'},
];

export default function ConnectCapitalScreen({navigation}: Props) {
  const handleNavigateMain = useCallback(() => {
    navigation.getParent()?.navigate('Main');
  }, [navigation]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeftIcon size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Connect Capital</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Connect your Capital</Text>
        <Text style={styles.subtitle}>Link your brokerage or start with risk-free paper trading to test bots before going live.</Text>

        {/* Paper Trading Card - Featured */}
        <View style={styles.featuredCard}>
          <View style={styles.featuredTop}>
            <View style={styles.featuredIcon}>
              <Text style={styles.featuredIconText}>📝</Text>
            </View>
            <Badge label="RECOMMENDED" variant="green" size="sm" />
          </View>
          <Text style={styles.featuredName}>Paper Trading</Text>
          <Text style={styles.featuredDesc}>
            Practice with real market data using virtual funds. Zero risk, full functionality.
          </Text>
          <TouchableOpacity style={styles.featuredBtn} onPress={handleNavigateMain} activeOpacity={0.85}>
            <LinearGradient
              colors={['#10B981', '#059669']}
              style={styles.featuredBtnGradient}
              start={{x: 0, y: 0}} end={{x: 1, y: 0}}>
              <Text style={styles.featuredBtnText}>Get Started Free</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Brokerage list */}
        <Text style={styles.sectionLabel}>CONNECT A BROKERAGE</Text>

        {BROKERAGES.map(b => (
          <TouchableOpacity key={b.name} style={styles.brokerRow} activeOpacity={0.7}>
            <View style={[styles.brokerAvatar, {backgroundColor: b.bg}]}>
              <Text style={styles.brokerLetter}>{b.letter}</Text>
            </View>
            <View style={styles.brokerInfo}>
              <Text style={styles.brokerName}>{b.name}</Text>
              <Text style={styles.brokerSubtitle}>{b.subtitle}</Text>
            </View>
            <View style={styles.connectBtn}>
              <Text style={styles.connectText}>Connect</Text>
              <ChevronRightIcon size={14} color="#10B981" />
            </View>
          </TouchableOpacity>
        ))}

        {/* Dashed add button */}
        <TouchableOpacity style={styles.addBrokerBtn}>
          <Text style={styles.addBrokerText}>+ Request another brokerage</Text>
        </TouchableOpacity>

        {/* Security notice */}
        <View style={styles.securityRow}>
          <LockIcon size={14} color="rgba(255,255,255,0.3)" />
          <Text style={styles.securityText}>Secure 256-bit encrypted connection. Read-only access.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0F1117'},
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {fontFamily: 'Inter-SemiBold', fontSize: 17, color: '#FFFFFF'},
  scroll: {paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40},
  title: {fontFamily: 'Inter-Bold', fontSize: 24, color: '#FFFFFF', marginBottom: 8, letterSpacing: -0.3},
  subtitle: {fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 20, marginBottom: 24},
  featuredCard: {
    backgroundColor: '#161B22', borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)', marginBottom: 24,
  },
  featuredTop: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12},
  featuredIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  featuredIconText: {fontSize: 22},
  featuredName: {fontFamily: 'Inter-Bold', fontSize: 18, color: '#FFFFFF', marginBottom: 6},
  featuredDesc: {fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 18, marginBottom: 16},
  featuredBtn: {borderRadius: 12, overflow: 'hidden', height: 44},
  featuredBtnGradient: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  featuredBtnText: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF'},
  sectionLabel: {
    fontFamily: 'Inter-Medium', fontSize: 10, letterSpacing: 1,
    color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 12,
  },
  brokerRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#161B22', borderRadius: 14, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  brokerAvatar: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  brokerLetter: {fontFamily: 'Inter-Bold', fontSize: 12, color: '#FFFFFF'},
  brokerInfo: {flex: 1},
  brokerName: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF'},
  brokerSubtitle: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 1},
  connectBtn: {flexDirection: 'row', alignItems: 'center', gap: 4},
  connectText: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#10B981'},
  addBrokerBtn: {
    height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderStyle: 'dashed', marginTop: 4, marginBottom: 24,
  },
  addBrokerText: {fontFamily: 'Inter-Medium', fontSize: 13, color: 'rgba(255,255,255,0.35)'},
  securityRow: {flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center'},
  securityText: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.3)'},
});
