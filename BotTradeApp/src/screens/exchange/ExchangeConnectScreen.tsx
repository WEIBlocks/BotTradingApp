import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../types';
import Svg, {Path, Rect, Circle, Line} from 'react-native-svg';
import {exchangeApi, ExchangeInfo as ExchangeInfoApi} from '../../services/exchange';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

// ─── Icons ──────────────────────────────────────────────────────────────────

function ChevronLeftIcon({size = 22, color = '#FFFFFF'}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M15 18L9 12L15 6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function LockIcon({size = 16, color = 'rgba(255,255,255,0.5)'}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={5} y={11} width={14} height={10} rx={2} stroke={color} strokeWidth={1.8} />
      <Path d="M8 11V7C8 4.79 9.79 3 12 3C14.21 3 16 4.79 16 7V11" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Circle cx={12} cy={16} r={1.5} fill={color} />
    </Svg>
  );
}

function EyeIcon({size = 20, color = 'rgba(255,255,255,0.5)'}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M1 12C1 12 5 5 12 5C19 5 23 12 23 12C23 12 19 19 12 19C5 19 1 12 1 12Z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

function EyeOffIcon({size = 20, color = 'rgba(255,255,255,0.5)'}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M17.94 17.94C16.23 19.24 14.18 20 12 20C5 20 1 12 1 12C2.24 9.68 3.97 7.73 6.06 6.06M9.9 4.24C10.59 4.08 11.29 4 12 4C19 4 23 12 23 12C22.39 13.15 21.68 14.21 20.87 15.17" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1={1} y1={1} x2={23} y2={23} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function CheckIcon({size = 16, color = '#10B981'}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12L10 17L20 7" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ─── Exchange Icons ─────────────────────────────────────────────────────────

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

function KrakenLogo({size = 28}: {size?: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <Circle cx={14} cy={14} r={14} fill="#5741D9" />
      <Path d="M10 8V20M10 14L17 8M10 14L17 20" stroke="#FFFFFF" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function AlpacaLogo({size = 28}: {size?: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <Circle cx={14} cy={14} r={14} fill="#F0C000" />
      <Path d="M9 20V12L14 8L19 12V20" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 20V16H16V20" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={12} cy={13} r={1} fill="#FFFFFF" />
      <Circle cx={16} cy={13} r={1} fill="#FFFFFF" />
    </Svg>
  );
}

const EXCHANGE_ICONS: Record<string, React.FC<{size?: number}>> = {
  Coinbase: CoinbaseLogo,
  Binance: BinanceLogo,
  Kraken: KrakenLogo,
  Alpaca: AlpacaLogo,
};

// ─── Exchange data ──────────────────────────────────────────────────────────

interface ExchangeInfo {
  name: string;
  subtitle: string;
  color: string;
}

const DEFAULT_EXCHANGES: ExchangeInfo[] = [
  {name: 'Coinbase', subtitle: 'Crypto Assets', color: '#0052FF'},
  {name: 'Binance', subtitle: 'Crypto Assets', color: '#F3BA2F'},
  {name: 'Kraken', subtitle: 'Crypto Assets', color: '#5741D9'},
  {name: 'Alpaca', subtitle: 'Multi-Asset', color: '#F0C000'},
];

// ─── Component ──────────────────────────────────────────────────────────────

const ExchangeConnectScreen = () => {
  const navigation = useNavigation<NavProp>();
  const [activeTab, setActiveTab] = useState<'oauth' | 'api'>('oauth');
  const [selectedExchange, setSelectedExchange] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [exchanges, setExchanges] = useState<ExchangeInfo[]>(DEFAULT_EXCHANGES);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    exchangeApi.getAvailable()
      .then(data => setExchanges(data.length > 0 ? data.map(d => ({name: d.name, subtitle: d.subtitle, color: d.color})) : DEFAULT_EXCHANGES))
      .catch(() => setExchanges(DEFAULT_EXCHANGES))
      .finally(() => setLoading(false));
  }, []);

  const handleConnect = async (exchangeName: string) => {
    setConnecting(true);
    try {
      await exchangeApi.initiateOAuth(exchangeName);
      Alert.alert('OAuth Initiated', `Please complete the authorization for ${exchangeName}.`);
    } catch (e: any) {
      Alert.alert('Connection Failed', e?.message || 'Could not initiate OAuth.');
    } finally {
      setConnecting(false);
    }
  };

  const handleTestConnection = async () => {
    if (!selectedExchange) {
      Alert.alert('Select Exchange', 'Please select an exchange first.');
      return;
    }
    if (!apiKey.trim() || !apiSecret.trim()) {
      Alert.alert('Missing Fields', 'Please fill in both API Key and API Secret.');
      return;
    }
    setTesting(true);
    try {
      const res = await exchangeApi.testConnection(selectedExchange, apiKey.trim(), apiSecret.trim());
      Alert.alert('Connection Successful', res?.data?.message || `${selectedExchange} API keys are valid!`);
    } catch (e: any) {
      Alert.alert('Connection Failed', e?.message || 'Could not connect. Please check your API credentials.');
    } finally {
      setTesting(false);
    }
  };

  const handleSaveConnect = async () => {
    if (!selectedExchange) {
      Alert.alert('Select Exchange', 'Please select an exchange first.');
      return;
    }
    if (!apiKey.trim() || !apiSecret.trim()) {
      Alert.alert('Missing Fields', 'Please fill in both API Key and API Secret.');
      return;
    }
    setConnecting(true);
    try {
      await exchangeApi.connectApiKey(selectedExchange, apiKey.trim(), apiSecret.trim());
      Alert.alert('Connected!', `${selectedExchange} has been connected successfully.`, [
        {text: 'OK', onPress: () => navigation.goBack()},
      ]);
    } catch (e: any) {
      Alert.alert('Connection Failed', e?.message || 'Could not connect exchange.');
    } finally {
      setConnecting(false);
    }
  };

  // ─── OAuth Tab ──────────────────────────────────────────────────────────

  const renderOAuthTab = () => (
    <View style={styles.tabContent}>
      {loading ? (
        <ActivityIndicator size="large" color="#10B981" style={{marginTop: 40}} />
      ) : exchanges.map((exchange) => {
        const ExIcon = EXCHANGE_ICONS[exchange.name];
        return (
        <View key={exchange.name} style={styles.exchangeCard}>
          <View style={styles.exchangeRow}>
            <View style={styles.exchangeCircle}>
              {ExIcon ? <ExIcon size={44} /> : <View style={[styles.exchangeFallback, {backgroundColor: exchange.color}]}><Text style={styles.exchangeLetter}>{exchange.name[0]}</Text></View>}
            </View>
            <View style={styles.exchangeInfo}>
              <Text style={styles.exchangeName}>{exchange.name}</Text>
              <Text style={styles.exchangeSubtitle}>{exchange.subtitle}</Text>
            </View>
            <TouchableOpacity
              style={[styles.connectBtn, connecting && {opacity: 0.5}]}
              activeOpacity={0.7}
              onPress={() => handleConnect(exchange.name)}
              disabled={connecting}>
              {connecting ? (
                <ActivityIndicator size="small" color="#10B981" />
              ) : (
                <Text style={styles.connectBtnText}>Connect</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
        );
      })}
    </View>
  );

  // ─── API Key Tab ────────────────────────────────────────────────────────

  const renderApiTab = () => (
    <View style={styles.tabContent}>
      {/* Exchange Selector */}
      <Text style={styles.sectionLabel}>Select Exchange</Text>
      <View style={styles.exchangeSelectorRow}>
        {exchanges.map((exchange) => {
          const isSelected = selectedExchange === exchange.name;
          return (
            <TouchableOpacity
              key={exchange.name}
              style={[
                styles.exchangeSelectorCard,
                isSelected && styles.exchangeSelectorCardActive,
              ]}
              activeOpacity={0.7}
              onPress={() => setSelectedExchange(exchange.name)}>
              <View style={styles.exchangeSelectorCircle}>
                {(() => { const ExIcon = EXCHANGE_ICONS[exchange.name]; return ExIcon ? <ExIcon size={36} /> : <View style={{width: 36, height: 36, borderRadius: 18, backgroundColor: exchange.color, alignItems: 'center', justifyContent: 'center'}}><Text style={styles.exchangeSelectorLetter}>{exchange.name[0]}</Text></View>; })()}
              </View>
              <Text style={[
                styles.exchangeSelectorName,
                isSelected && styles.exchangeSelectorNameActive,
              ]}>
                {exchange.name}
              </Text>
              {isSelected && (
                <View style={styles.checkBadge}>
                  <CheckIcon size={12} color="#FFFFFF" />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* API Key Input */}
      <Text style={styles.sectionLabel}>API Key</Text>
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.textInput}
          placeholder="Enter your API key"
          placeholderTextColor="rgba(255,255,255,0.3)"
          value={apiKey}
          onChangeText={setApiKey}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* API Secret Input */}
      <Text style={styles.sectionLabel}>API Secret</Text>
      <View style={styles.inputContainer}>
        <TextInput
          style={[styles.textInput, {flex: 1}]}
          placeholder="Enter your API secret"
          placeholderTextColor="rgba(255,255,255,0.3)"
          value={apiSecret}
          onChangeText={setApiSecret}
          secureTextEntry={!showSecret}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity
          style={styles.eyeToggle}
          activeOpacity={0.6}
          onPress={() => setShowSecret(!showSecret)}>
          {showSecret ? <EyeOffIcon /> : <EyeIcon />}
        </TouchableOpacity>
      </View>

      {/* Action Buttons */}
      <TouchableOpacity
        style={[styles.testBtn, testing && {opacity: 0.6}]}
        activeOpacity={0.7}
        onPress={handleTestConnection}
        disabled={testing || connecting}>
        {testing ? (
          <ActivityIndicator size="small" color="#10B981" />
        ) : (
          <Text style={styles.testBtnText}>Test Connection</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.saveCta, connecting && {opacity: 0.6}]}
        activeOpacity={0.8}
        onPress={handleSaveConnect}
        disabled={connecting}>
        {connecting ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Text style={styles.saveCtaText}>Save & Connect</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  // ─── Render ─────────────────────────────────────────────────────────────

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
        <Text style={styles.headerTitle}>Connect Exchange</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Tab Selector */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'oauth' && styles.tabActive]}
          activeOpacity={0.7}
          onPress={() => setActiveTab('oauth')}>
          <Text style={[styles.tabText, activeTab === 'oauth' && styles.tabTextActive]}>
            OAuth Login
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'api' && styles.tabActive]}
          activeOpacity={0.7}
          onPress={() => setActiveTab('api')}>
          <Text style={[styles.tabText, activeTab === 'api' && styles.tabTextActive]}>
            API Credentials
          </Text>
        </TouchableOpacity>
      </View>

      {/* Scrollable Content */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        {activeTab === 'oauth' ? renderOAuthTab() : renderApiTab()}
      </ScrollView>

      {/* Security Footer */}
      <View style={styles.securityFooter}>
        <LockIcon />
        <Text style={styles.securityText}>Secure 256-bit encrypted connection</Text>
      </View>
    </View>
  );
};

export default ExchangeConnectScreen;

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

  // Tab Bar
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 20,
    backgroundColor: '#161B22',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#10B981',
  },
  tabText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },

  // Tab content
  tabContent: {},

  // ── OAuth Tab ──────────────────────────────────────────
  exchangeCard: {
    backgroundColor: '#161B22',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 16,
    marginBottom: 12,
  },
  exchangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  exchangeCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  exchangeFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
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
  exchangeName: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  exchangeSubtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  connectBtn: {
    borderWidth: 1.5,
    borderColor: '#10B981',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  connectBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    color: '#10B981',
  },

  // ── API Tab ────────────────────────────────────────────
  sectionLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 10,
    marginTop: 4,
  },
  exchangeSelectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  exchangeSelectorCard: {
    backgroundColor: '#161B22',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: 'center',
    width: '47%' as any,
    position: 'relative',
  },
  exchangeSelectorCardActive: {
    borderColor: '#10B981',
    borderWidth: 1.5,
  },
  exchangeSelectorCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    overflow: 'hidden',
  },
  exchangeSelectorLetter: {
    fontFamily: 'Inter-Bold',
    fontSize: 15,
    color: '#FFFFFF',
  },
  exchangeSelectorName: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
  exchangeSelectorNameActive: {
    color: '#FFFFFF',
  },
  checkBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Inputs
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161B22',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 16,
    paddingHorizontal: 14,
  },
  textInput: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    color: '#FFFFFF',
    paddingVertical: 14,
  },
  eyeToggle: {
    padding: 6,
    marginLeft: 4,
  },

  // Buttons
  testBtn: {
    borderWidth: 1.5,
    borderColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 4,
  },
  testBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
    color: '#10B981',
  },
  saveCta: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveCtaText: {
    fontFamily: 'Inter-Bold',
    fontSize: 16,
    color: '#FFFFFF',
  },

  // Security Footer
  securityFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingBottom: 32,
    gap: 8,
  },
  securityText: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
});
