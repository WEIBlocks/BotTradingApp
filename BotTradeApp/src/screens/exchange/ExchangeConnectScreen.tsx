import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../types';
import Svg, {Path, Rect, Circle, Line} from 'react-native-svg';
import {exchangeApi, ExchangeConnection} from '../../services/exchange';
import {useToast} from '../../context/ToastContext';

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

// ─── Quick Connect Guide Data ────────────────────────────────────────────────

interface GuideStep {
  step: number;
  text: string;
}

interface ExchangeGuide {
  name: string;
  color: string;
  url: string;
  testnetUrl?: string;
  steps: GuideStep[];
  permissions: string[];
  warning?: string;
}

const EXCHANGE_GUIDES: ExchangeGuide[] = [
  {
    name: 'Binance',
    color: '#F3BA2F',
    url: 'binance.com/en/my/settings/api-management',
    testnetUrl: 'testnet.binance.vision',
    steps: [
      {step: 1, text: 'Log in to your Binance account'},
      {step: 2, text: 'Go to Account → API Management'},
      {step: 3, text: 'Click "Create API" → choose "System generated"'},
      {step: 4, text: 'Complete security verification (2FA)'},
      {step: 5, text: 'Copy your API Key and Secret Key'},
      {step: 6, text: 'Enable "Enable Spot & Margin Trading" permission'},
    ],
    permissions: ['Read', 'Spot & Margin Trading'],
    warning: 'Never enable Withdrawals permission. We only need read + trade access.',
  },
  {
    name: 'Coinbase',
    color: '#0052FF',
    url: 'coinbase.com/settings/api',
    steps: [
      {step: 1, text: 'Log in to Coinbase Advanced'},
      {step: 2, text: 'Go to Settings → API'},
      {step: 3, text: 'Click "New API Key"'},
      {step: 4, text: 'Select your portfolio and set permissions'},
      {step: 5, text: 'Complete 2FA verification'},
      {step: 6, text: 'Copy API Key and API Secret immediately'},
    ],
    permissions: ['View', 'Trade'],
    warning: 'The Secret is shown only once. Save it immediately.',
  },
  {
    name: 'Kraken',
    color: '#5741D9',
    url: 'kraken.com/u/security/api',
    steps: [
      {step: 1, text: 'Log in to your Kraken account'},
      {step: 2, text: 'Go to Security → API'},
      {step: 3, text: 'Click "Add key"'},
      {step: 4, text: 'Name your key and select permissions'},
      {step: 5, text: 'Click "Generate key"'},
      {step: 6, text: 'Copy both the API Key and Private Key'},
    ],
    permissions: ['Query Funds', 'Query Open Orders & Trades', 'Create & Modify Orders'],
  },
  {
    name: 'Alpaca',
    color: '#F0C000',
    url: 'app.alpaca.markets/brokerage/dashboard/overview',
    steps: [
      {step: 1, text: 'Log in to Alpaca Dashboard'},
      {step: 2, text: 'Go to the Overview page'},
      {step: 3, text: 'Find "API Keys" section on the right'},
      {step: 4, text: 'Click "Generate New Key"'},
      {step: 5, text: 'Copy API Key ID and Secret Key'},
      {step: 6, text: 'For paper trading, use Paper Trading dashboard instead'},
    ],
    permissions: ['Trading', 'Account'],
  },
];

// ─── Step Number Icon ──────────────────────────────────────────────────────

function StepNumber({num, color}: {num: number; color: string}) {
  return (
    <View style={{width: 24, height: 24, borderRadius: 12, backgroundColor: `${color}20`, alignItems: 'center', justifyContent: 'center'}}>
      <Text style={{fontFamily: 'Inter-Bold', fontSize: 11, color}}>{num}</Text>
    </View>
  );
}

function ShieldIcon({size = 14, color = '#10B981'}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2L3 7V12C3 17.55 6.84 22.74 12 24C17.16 22.74 21 17.55 21 12V7L12 2Z" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M9 12L11 14L15 10" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ExternalLinkIcon({size = 12, color = 'rgba(255,255,255,0.4)'}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M18 13V19C18 20.1 17.1 21 16 21H5C3.9 21 3 20.1 3 19V8C3 6.9 3.9 6 5 6H11" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M15 3H21V9" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M10 14L21 3" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function ChevronDownIcon({size = 16, color = 'rgba(255,255,255,0.4)'}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 9L12 15L18 9" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ChevronUpIcon({size = 16, color = '#10B981'}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M18 15L12 9L6 15" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function WarningIcon({size = 14, color = '#F59E0B'}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2L1 21H23L12 2Z" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M12 9V13" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Circle cx={12} cy={17} r={1} fill={color} />
    </Svg>
  );
}

const ExchangeConnectScreen = () => {
  const navigation = useNavigation<NavProp>();
  const {alert: showAlert} = useToast();
  const [activeTab, setActiveTab] = useState<'guide' | 'api'>('guide');
  const [selectedExchange, setSelectedExchange] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [exchanges, setExchanges] = useState<ExchangeInfo[]>(DEFAULT_EXCHANGES);
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sandbox, setSandbox] = useState(false);
  const [expandedGuide, setExpandedGuide] = useState<string | null>(null);
  const [connectedExchanges, setConnectedExchanges] = useState<ExchangeConnection[]>([]);

  useEffect(() => {
    exchangeApi.getAvailable()
      .then(data => setExchanges(data.length > 0 ? data.map(d => ({name: d.name, subtitle: d.subtitle, color: d.color})) : DEFAULT_EXCHANGES))
      .catch(() => setExchanges(DEFAULT_EXCHANGES));
    // Fetch existing connections to prevent duplicates
    exchangeApi.getConnections()
      .then(conns => setConnectedExchanges(conns))
      .catch(() => {});
  }, []);

  const isExchangeConnected = (name: string) =>
    connectedExchanges.some(c => c.provider.toLowerCase() === name.toLowerCase() && c.status === 'connected');

  const handleTestConnection = async () => {
    if (!selectedExchange) {
      showAlert('Select Exchange', 'Please select an exchange first.');
      return;
    }
    if (!apiKey.trim() || !apiSecret.trim()) {
      showAlert('Missing Fields', 'Please fill in both API Key and API Secret.');
      return;
    }
    setTesting(true);
    try {
      const res = await exchangeApi.testConnection(selectedExchange, apiKey.trim(), apiSecret.trim(), sandbox);
      showAlert('Connection Successful', res?.data?.message || `${selectedExchange} API keys are valid!`);
    } catch (e: any) {
      showAlert('Connection Failed', e?.message || 'Could not connect. Please check your API credentials.');
    } finally {
      setTesting(false);
    }
  };

  const handleSaveConnect = async () => {
    if (!selectedExchange) {
      showAlert('Select Exchange', 'Please select an exchange first.');
      return;
    }
    if (isExchangeConnected(selectedExchange)) {
      showAlert('Already Connected', `${selectedExchange} is already connected. Disconnect it first from your profile to reconnect with new credentials.`);
      return;
    }
    if (!apiKey.trim() || !apiSecret.trim()) {
      showAlert('Missing Fields', 'Please fill in both API Key and API Secret.');
      return;
    }
    setConnecting(true);
    try {
      await exchangeApi.connectApiKey(selectedExchange, apiKey.trim(), apiSecret.trim(), sandbox);
      showAlert('Connected!', `${selectedExchange} has been connected successfully.`);
      navigation.goBack();
    } catch (e: any) {
      showAlert('Connection Failed', e?.message || 'Could not connect exchange.');
    } finally {
      setConnecting(false);
    }
  };

  // ─── Quick Connect Guide Tab ────────────────────────────────────────────

  const renderGuideTab = () => (
    <View style={styles.tabContent}>
      {/* Intro */}
      <View style={guideStyles.introCard}>
        <ShieldIcon size={18} />
        <Text style={guideStyles.introText}>
          Connect your exchange using API keys. We only need read + trade access — never enable withdrawals.
        </Text>
      </View>

      {/* Exchange Guides */}
      {EXCHANGE_GUIDES.map(guide => {
        const ExIcon = EXCHANGE_ICONS[guide.name];
        const isExpanded = expandedGuide === guide.name;
        return (
          <View key={guide.name} style={[guideStyles.guideCard, isExpanded && {borderColor: `${guide.color}30`}]}>
            {/* Header - tap to expand */}
            <TouchableOpacity
              style={guideStyles.guideHeader}
              activeOpacity={0.7}
              onPress={() => setExpandedGuide(isExpanded ? null : guide.name)}>
              <View style={guideStyles.guideIconWrap}>
                {ExIcon ? <ExIcon size={40} /> : (
                  <View style={{width: 40, height: 40, borderRadius: 20, backgroundColor: guide.color, alignItems: 'center', justifyContent: 'center'}}>
                    <Text style={{fontFamily: 'Inter-Bold', fontSize: 16, color: '#FFF'}}>{guide.name[0]}</Text>
                  </View>
                )}
              </View>
              <View style={guideStyles.guideTextWrap}>
                <Text style={guideStyles.guideName}>{guide.name}</Text>
                <Text style={guideStyles.guideSubtitle} numberOfLines={1}>API Key + Secret Key</Text>
              </View>
              <View style={guideStyles.expandBtn}>
                {isExpanded ? <ChevronUpIcon size={18} color={guide.color} /> : <ChevronDownIcon size={18} />}
              </View>
            </TouchableOpacity>

            {/* Expanded Steps */}
            {isExpanded && (
              <View style={guideStyles.guideBody}>
                {/* Where to find */}
                <View style={guideStyles.urlRow}>
                  <ExternalLinkIcon size={12} color="rgba(255,255,255,0.4)" />
                  <Text style={guideStyles.guideUrl} numberOfLines={1}>{guide.url}</Text>
                </View>

                {/* Steps */}
                {guide.steps.map(s => (
                  <View key={s.step} style={guideStyles.stepRow}>
                    <StepNumber num={s.step} color={guide.color} />
                    <Text style={guideStyles.stepText}>{s.text}</Text>
                  </View>
                ))}

                {/* Required Permissions */}
                <View style={guideStyles.permissionsSection}>
                  <Text style={guideStyles.permissionsLabel}>Required Permissions</Text>
                  <View style={guideStyles.permissionsList}>
                    {guide.permissions.map(p => (
                      <View key={p} style={guideStyles.permBadge}>
                        <CheckIcon size={10} color="#10B981" />
                        <Text style={guideStyles.permText}>{p}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Warning */}
                {guide.warning && (
                  <View style={guideStyles.warningBox}>
                    <WarningIcon size={14} />
                    <Text style={guideStyles.warningText}>{guide.warning}</Text>
                  </View>
                )}

                {/* Testnet link */}
                {guide.testnetUrl && (
                  <View style={guideStyles.testnetBox}>
                    <Text style={guideStyles.testnetLabel}>Testnet:</Text>
                    <Text style={guideStyles.testnetUrl}>{guide.testnetUrl}</Text>
                  </View>
                )}

                {/* Go to Connect button */}
                <TouchableOpacity
                  style={[guideStyles.useKeyBtn, {backgroundColor: isExchangeConnected(guide.name) ? 'rgba(16,185,129,0.1)' : `${guide.color}15`, borderColor: isExchangeConnected(guide.name) ? 'rgba(16,185,129,0.3)' : `${guide.color}40`}]}
                  activeOpacity={0.7}
                  onPress={() => {
                    if (isExchangeConnected(guide.name)) {
                      showAlert('Already Connected', `${guide.name} is already connected. Disconnect it first from your profile to reconnect.`);
                      return;
                    }
                    setSelectedExchange(guide.name);
                    setActiveTab('api');
                  }}>
                  <Text style={[guideStyles.useKeyBtnText, {color: isExchangeConnected(guide.name) ? '#10B981' : guide.color}]}>
                    {isExchangeConnected(guide.name) ? 'Connected ✓' : 'Enter API Keys'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
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
          const alreadyConnected = isExchangeConnected(exchange.name);
          return (
            <TouchableOpacity
              key={exchange.name}
              style={[
                styles.exchangeSelectorCard,
                isSelected && styles.exchangeSelectorCardActive,
                alreadyConnected && {borderColor: 'rgba(16,185,129,0.3)', opacity: 0.6},
              ]}
              activeOpacity={0.7}
              onPress={() => {
                if (alreadyConnected) {
                  showAlert('Already Connected', `${exchange.name} is already connected. Disconnect it first from your profile to reconnect.`);
                  return;
                }
                setSelectedExchange(exchange.name);
                if (exchange.name !== 'Binance' && exchange.name !== 'Alpaca') {
                  setSandbox(false);
                }
              }}>
              <View style={styles.exchangeSelectorCircle}>
                {(() => { const ExIcon = EXCHANGE_ICONS[exchange.name]; return ExIcon ? <ExIcon size={36} /> : <View style={{width: 36, height: 36, borderRadius: 18, backgroundColor: exchange.color, alignItems: 'center', justifyContent: 'center'}}><Text style={styles.exchangeSelectorLetter}>{exchange.name[0]}</Text></View>; })()}
              </View>
              <Text style={[
                styles.exchangeSelectorName,
                isSelected && styles.exchangeSelectorNameActive,
              ]}>
                {exchange.name}
              </Text>
              {alreadyConnected ? (
                <View style={[styles.checkBadge, {backgroundColor: '#10B981'}]}>
                  <CheckIcon size={12} color="#FFFFFF" />
                </View>
              ) : isSelected ? (
                <View style={styles.checkBadge}>
                  <CheckIcon size={12} color="#FFFFFF" />
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Environment Toggle — only for exchanges with testnet */}
      {(selectedExchange === 'Binance' || selectedExchange === 'Alpaca') ? (
        <>
          <Text style={styles.sectionLabel}>Environment</Text>
          <View style={styles.envToggleRow}>
            <TouchableOpacity
              style={[styles.envToggleBtn, !sandbox && styles.envToggleBtnActive]}
              activeOpacity={0.7}
              onPress={() => setSandbox(false)}>
              <View style={[styles.envDot, {backgroundColor: '#10B981'}]} />
              <Text style={[styles.envToggleText, !sandbox && styles.envToggleTextActive]}>Live</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.envToggleBtn, sandbox && styles.envToggleBtnActiveTest]}
              activeOpacity={0.7}
              onPress={() => setSandbox(true)}>
              <View style={[styles.envDot, {backgroundColor: '#F59E0B'}]} />
              <Text style={[styles.envToggleText, sandbox && styles.envToggleTextActive]}>
                {selectedExchange === 'Alpaca' ? 'Paper Trading' : 'Testnet'}
              </Text>
            </TouchableOpacity>
          </View>
          {sandbox && (
            <Text style={styles.envHint}>
              {selectedExchange === 'Alpaca'
                ? 'Using Alpaca Paper Trading — get paper keys from your Alpaca dashboard'
                : 'Using Binance Testnet — get test keys at testnet.binance.vision'}
            </Text>
          )}
        </>
      ) : selectedExchange === 'Coinbase' || selectedExchange === 'Kraken' ? (
        <View style={styles.envDisabledBox}>
          <View style={[styles.envDot, {backgroundColor: '#10B981'}]} />
          <Text style={styles.envDisabledText}>
            {selectedExchange} only supports live connections — no testnet available
          </Text>
        </View>
      ) : null}

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
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}>
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
          style={[styles.tab, activeTab === 'guide' && styles.tabActive]}
          activeOpacity={0.7}
          onPress={() => setActiveTab('guide')}>
          <Text style={[styles.tabText, activeTab === 'guide' && styles.tabTextActive]}>
            Quick Connect
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

      {/* Scrollable Content — footer inside scroll so buttons stay reachable when keyboard is open */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        {activeTab === 'guide' ? renderGuideTab() : renderApiTab()}

        {/* Security Footer inside scroll so it's not blocked by keyboard */}
        <View style={styles.securityFooter}>
          <LockIcon />
          <Text style={styles.securityText}>Secure 256-bit encrypted connection</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
    paddingBottom: 20,
  },

  // Tab content
  tabContent: {},

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

  // Environment toggle
  envToggleRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  envToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#161B22',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 12,
  },
  envToggleBtnActive: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16,185,129,0.08)',
  },
  envToggleBtnActiveTest: {
    borderColor: '#F59E0B',
    backgroundColor: 'rgba(245,158,11,0.08)',
  },
  envDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  envToggleText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
  },
  envToggleTextActive: {
    color: '#FFFFFF',
  },
  envHint: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(245,158,11,0.7)',
    marginBottom: 16,
    marginTop: -8,
  },
  envDisabledBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 14,
    marginBottom: 16,
    marginTop: 4,
  },
  envDisabledText: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    lineHeight: 18,
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

const guideStyles = StyleSheet.create({
  introCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(16,185,129,0.06)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.15)',
    padding: 14,
    gap: 12,
    marginBottom: 18,
  },
  introText: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 20,
    paddingTop: 1,
  },
  guideCard: {
    backgroundColor: '#161B22',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 10,
  },
  guideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  guideIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideTextWrap: {
    flex: 1,
  },
  guideName: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  guideSubtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
  },
  expandBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideBody: {
    paddingHorizontal: 14,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
    paddingTop: 14,
  },
  urlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 14,
  },
  guideUrl: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  stepText: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 19,
    paddingTop: 2,
  },
  permissionsSection: {
    marginTop: 8,
    marginBottom: 12,
  },
  permissionsLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  permissionsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  permBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.12)',
  },
  permText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: '#10B981',
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(245,158,11,0.06)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.15)',
    padding: 12,
    marginBottom: 12,
  },
  warningText: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(245,158,11,0.8)',
    lineHeight: 18,
    paddingTop: 1,
  },
  testnetBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(245,158,11,0.05)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 12,
  },
  testnetLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
  testnetUrl: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: '#F59E0B',
  },
  useKeyBtn: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  useKeyBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
  },
});
