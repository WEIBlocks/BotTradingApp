import React, {useState, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../types';
import {exchangeApi, ExchangeConnection} from '../../services/exchange';
import Svg, {Path, Circle} from 'react-native-svg';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

// ─── Icons ──────────────────────────────────────────────────────────────────

function ChevronLeftIcon({size = 22, color = '#FFFFFF'}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M15 18L9 12L15 6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function SyncIcon({size = 16, color = '#10B981'}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M21 2V8H15" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M3 22V16H9" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M19.36 15.36A9 9 0 0 1 4.64 8.64" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="M4.64 8.64A9 9 0 0 1 19.36 15.36" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function PlusIcon({size = 20, color = '#FFFFFF'}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5V19M5 12H19" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function ClockIcon({size = 14, color = 'rgba(255,255,255,0.4)'}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} />
      <Path d="M12 7V12L15 15" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ─── Exchange Logos ─────────────────────────────────────────────────────────

function CoinbaseLogo({size = 28}: {size?: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <Circle cx={14} cy={14} r={14} fill="#0052FF" />
      <Path d="M14 6C9.58 6 6 9.58 6 14C6 18.42 9.58 22 14 22C18.42 22 22 18.42 22 14C22 9.58 18.42 6 14 6ZM14 19C11.24 19 9 16.76 9 14C9 11.24 11.24 9 14 9C15.38 9 16.63 9.56 17.54 10.46L15.41 12.59C15.01 12.2 14.53 12 14 12C12.9 12 12 12.9 12 14C12 15.1 12.9 16 14 16C14.53 16 15.01 15.8 15.41 15.41L17.54 17.54C16.63 18.44 15.38 19 14 19Z" fill="#FFFFFF" />
    </Svg>
  );
}

function BinanceLogo({size = 28}: {size?: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <Circle cx={14} cy={14} r={14} fill="#F3BA2F" />
      <Path d="M14 7L16.2 9.2L14 11.4L11.8 9.2L14 7Z" fill="#FFFFFF" />
      <Path d="M14 16.6L16.2 18.8L14 21L11.8 18.8L14 16.6Z" fill="#FFFFFF" />
      <Path d="M7 14L9.2 11.8L11.4 14L9.2 16.2L7 14Z" fill="#FFFFFF" />
      <Path d="M16.6 14L18.8 11.8L21 14L18.8 16.2L16.6 14Z" fill="#FFFFFF" />
      <Path d="M14 12L15.4 13.4L14 14.8L12.6 13.4L14 12Z" fill="#FFFFFF" />
    </Svg>
  );
}

const EXCHANGE_LOGOS: Record<string, React.FC<{size?: number}>> = {
  Coinbase: CoinbaseLogo,
  Binance: BinanceLogo,
};

const EXCHANGE_COLORS: Record<string, string> = {
  Coinbase: '#0052FF',
  Binance: '#F3BA2F',
  Kraken: '#5741D9',
  Alpaca: '#F0C000',
  'Interactive Brokers': '#D92B2B',
};

const formatBalance = (balance: number): string =>
  '$' + balance.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});

// ─── Component ──────────────────────────────────────────────────────────────

const ExchangeManageScreen = () => {
  const navigation = useNavigation<NavProp>();
  const [connections, setConnections] = useState<ExchangeConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchConnections = useCallback(() => {
    exchangeApi.getConnections()
      .then(data => setConnections(data))
      .catch(() => Alert.alert('Error', 'Failed to load exchange connections. Pull down to retry.'))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, []);

  useFocusEffect(useCallback(() => { fetchConnections(); }, [fetchConnections]));

  const handleResync = (connectionId: string, provider: string) => {
    Alert.alert('Re-syncing', `Syncing data from ${provider}...`);
    exchangeApi.resync(connectionId)
      .then(() => fetchConnections())
      .catch(() => Alert.alert('Error', 'Re-sync failed. Please try again.'));
  };

  const handleDisconnect = (connectionId: string, provider: string) => {
    Alert.alert(
      'Disconnect Exchange',
      `Are you sure you want to disconnect ${provider}?`,
      [
        {text: 'Cancel', style: 'cancel'},
        {text: 'Disconnect', style: 'destructive', onPress: () => {
          exchangeApi.disconnect(connectionId)
            .then(() => fetchConnections())
            .catch(() => Alert.alert('Error', 'Failed to disconnect exchange. Please try again.'));
        }},
      ],
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          activeOpacity={0.7}
          onPress={() => navigation.goBack()}>
          <ChevronLeftIcon />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Connected Exchanges</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Exchange Cards */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchConnections(); }}
            tintColor="#10B981"
            colors={['#10B981']}
            progressBackgroundColor="#161B22"
          />
        }>
        {loading ? (
          <ActivityIndicator size="large" color="#10B981" style={{marginTop: 40}} />
        ) : connections.length === 0 ? (
          <Text style={{fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 40}}>
            No exchanges connected yet.
          </Text>
        ) : null}
        {connections.map((exchange) => (
          <View key={exchange.id} style={styles.card}>
            {/* Top Row */}
            <View style={styles.cardTopRow}>
              <View style={styles.exchangeCircle}>
                {(() => { const Logo = EXCHANGE_LOGOS[exchange.provider]; return Logo ? <Logo size={44} /> : <View style={{width: 44, height: 44, borderRadius: 22, backgroundColor: EXCHANGE_COLORS[exchange.provider] || '#6366F1', alignItems: 'center', justifyContent: 'center'}}><Text style={styles.exchangeLetter}>{exchange.provider.charAt(0)}</Text></View>; })()}
              </View>
              <View style={styles.exchangeInfo}>
                <Text style={styles.providerName}>{exchange.provider}</Text>
                <Text style={styles.accountLabel}>{exchange.accountLabel}</Text>
              </View>
              <View style={{flexDirection: 'row', gap: 6, alignItems: 'center'}}>
                {exchange.sandbox && (
                  <View style={styles.testnetBadge}>
                    <Text style={styles.testnetText}>Testnet</Text>
                  </View>
                )}
                <View style={styles.statusBadge}>
                  <View style={styles.statusDot} />
                  <Text style={styles.statusText}>Connected</Text>
                </View>
              </View>
            </View>

            {/* Details Row */}
            <View style={styles.detailsRow}>
              <View style={styles.detailItem}>
                <View style={styles.detailIconRow}>
                  <ClockIcon />
                  <Text style={styles.detailLabel}>Last sync</Text>
                </View>
                <Text style={styles.detailValue}>{exchange.lastSync}</Text>
              </View>
              <View style={styles.detailDivider} />
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Balance</Text>
                <Text style={styles.detailValueGreen}>{formatBalance(exchange.totalBalance)}</Text>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.resyncBtn}
                activeOpacity={0.7}
                onPress={() => handleResync(exchange.id, exchange.provider)}>
                <SyncIcon size={14} />
                <Text style={styles.resyncBtnText}>Re-sync</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.disconnectBtn}
                activeOpacity={0.7}
                onPress={() => handleDisconnect(exchange.id, exchange.provider)}>
                <Text style={styles.disconnectBtnText}>Disconnect</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {/* Add Exchange Button */}
        <TouchableOpacity
          style={styles.addBtn}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('ExchangeConnect')}>
          <PlusIcon size={20} color="#FFFFFF" />
          <Text style={styles.addBtnText}>Add Exchange</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

export default ExchangeManageScreen;

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E14',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 54,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#161B22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Inter-Bold',
    fontSize: 18,
    color: '#FFFFFF',
  },
  headerSpacer: {
    width: 40,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  // Card
  card: {
    backgroundColor: '#161B22',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 18,
    marginBottom: 14,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  exchangeCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  exchangeLetter: {
    fontFamily: 'Inter-Bold',
    fontSize: 18,
    color: '#FFFFFF',
  },
  exchangeInfo: {
    flex: 1,
    marginLeft: 14,
  },
  providerName: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  accountLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#10B981',
  },
  statusText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: '#10B981',
  },
  testnetBadge: {
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  testnetText: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    color: '#F59E0B',
  },

  // Details
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  detailItem: {
    flex: 1,
  },
  detailIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  detailLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 4,
  },
  detailValue: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: '#FFFFFF',
  },
  detailValueGreen: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
    color: '#10B981',
  },
  detailDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 14,
  },

  // Action Buttons
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  resyncBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#10B981',
    borderRadius: 10,
    paddingVertical: 10,
    gap: 6,
  },
  resyncBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    color: '#10B981',
  },
  disconnectBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#EF4444',
    borderRadius: 10,
    paddingVertical: 10,
  },
  disconnectBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    color: '#EF4444',
  },

  // Add Exchange Button
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 6,
    gap: 8,
  },
  addBtnText: {
    fontFamily: 'Inter-Bold',
    fontSize: 16,
    color: '#FFFFFF',
  },
});
