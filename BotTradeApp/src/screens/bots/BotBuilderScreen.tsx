import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import {launchImageLibrary} from 'react-native-image-picker';
import {botsService} from '../../services/bots';
import {creatorApi} from '../../services/creator';
import {configApi} from '../../services/config';
import Svg, {Path} from 'react-native-svg';
import {useNavigation, useRoute, RouteProp} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../types';
import {useToast} from '../../context/ToastContext';
import {useAuth} from '../../context/AuthContext';
import BotAvatar from '../../components/common/BotAvatar';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'BotBuilder'>;

const DEFAULT_CRYPTO_PAIRS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'MATIC/USDT'];
const DEFAULT_STOCK_SYMBOLS = ['AAPL', 'MSFT', 'TSLA', 'AMZN', 'GOOGL', 'NVDA', 'META', 'SPY', 'QQQ'];
const DEFAULT_STRATEGIES = ['Trend Following', 'Scalping', 'Grid', 'DCA', 'Momentum', 'Custom'];
const STOCK_STRATEGIES = ['Trend Following', 'Momentum', 'Swing', 'Mean Reversion', 'Custom'];
const RULE_ONLY_STRATEGIES = ['Grid', 'DCA']; // These don't need AI prompt
const DEFAULT_RISK_LEVELS = ['Very Low', 'Low', 'Med', 'High', 'Very High'];

// ─── Icons ──────────────────────────────────────────────────────────────────

function BackArrow() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 19l-7-7 7-7"
        stroke="#FFFFFF"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function BrainIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2C9.24 2 7 4.24 7 7V8C5.34 8 4 9.34 4 11C4 12.3 4.84 13.4 6 13.82V17C6 19.76 8.24 22 11 22H13C15.76 22 18 19.76 18 17V13.82C19.16 13.4 20 12.3 20 11C20 9.34 18.66 8 17 8V7C17 4.24 14.76 2 12 2Z"
        stroke="#10B981"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M9 12H15M9 16H15" stroke="#10B981" strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

function RocketIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09zM12 15l-3-3M22 2l-7.5 7.5"
        stroke="#FFFFFF"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M9.5 14.5L6 18M14.5 9.5L18 6M22 2l-1 7-7.5-2.5L22 2zM22 2l-7 1 2.5 7.5L22 2z"
        stroke="#FFFFFF"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ─── Collapsible section helper ─────────────────────────────────────────────
//
// Renders a header-with-chevron and conditionally shows children. Used to
// group the 25+ form fields into 7 logical sections so the screen feels like
// a proper bot management page, not a long flat form.
function SectionCard({
  title,
  subtitle,
  open,
  onToggle,
  children,
}: {
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  return (
    <View style={sectionStyles.card}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onToggle}
        style={sectionStyles.header}>
        <View style={{flex: 1, minWidth: 0}}>
          <Text style={sectionStyles.title}>{title}</Text>
          {subtitle ? <Text style={sectionStyles.subtitle}>{subtitle}</Text> : null}
        </View>
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" style={{transform: [{rotate: open ? '180deg' : '0deg'}]}}>
          <Path d="M6 9l6 6 6-6" stroke="rgba(255,255,255,0.5)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </TouchableOpacity>
      {open ? <View style={sectionStyles.body}>{children}</View> : null}
    </View>
  );
}

// ─── Custom rules editor ───────────────────────────────────────────────────
//
// Lets the creator define up to 5 indicator-based conditions for entry or
// exit. Each row is `{indicator, operator, value, weight}` where:
//   • indicator — one of the supported strings the bot engine recognises
//     (rsi, ema20, ema50, macd_histogram, …). Free-text-typed for now;
//     unrecognised values are simply ignored at decision time.
//   • operator — one of <, >, <=, >=, crosses_above, crosses_below
//   • value — number the indicator is compared against
//   • weight — 0..1, how much this condition contributes to the composite signal
//
// Empty/incomplete rows are filtered out at submit time inside
// buildPayload → buildCustomRules so the user can leave drafts in the form.

const RULE_INDICATORS: string[] = [
  'rsi',
  'ema20',
  'ema50',
  'price_vs_ema20',
  'price_vs_ema50',
  'macd_histogram',
  'price_vs_bb_upper',
  'price_vs_bb_lower',
  'price_change_pct',
  'volume_change_pct',
];
const RULE_OPERATORS = ['<', '>', '<=', '>=', 'crosses_above', 'crosses_below'] as const;

type RuleRow = {indicator: string; operator: string; value: string; weight: string};

function CustomRulesEditor({
  label,
  help,
  rows,
  setRows,
  defaultOperator,
}: {
  label: string;
  help?: string;
  rows: RuleRow[];
  setRows: React.Dispatch<React.SetStateAction<RuleRow[]>>;
  defaultOperator: string;
}) {
  const addRow = () => {
    if (rows.length >= 5) return;
    setRows([...rows, {indicator: RULE_INDICATORS[0], operator: defaultOperator, value: '', weight: '0.5'}]);
  };
  const removeRow = (idx: number) => {
    setRows(rows.filter((_, i) => i !== idx));
  };
  const update = (idx: number, patch: Partial<RuleRow>) => {
    setRows(rows.map((r, i) => (i === idx ? {...r, ...patch} : r)));
  };

  return (
    <View style={{marginBottom: 14}}>
      <Text style={ruleStyles.label}>{label}</Text>
      {help ? <Text style={ruleStyles.help}>{help}</Text> : null}
      {rows.length === 0 ? (
        <Text style={ruleStyles.empty}>None — engine uses its defaults.</Text>
      ) : (
        rows.map((row, idx) => (
          <View key={idx} style={ruleStyles.row}>
            <View style={ruleStyles.rowHeader}>
              <Text style={ruleStyles.rowIndex}>#{idx + 1}</Text>
              <TouchableOpacity onPress={() => removeRow(idx)} style={ruleStyles.removeBtn} hitSlop={{top: 6, bottom: 6, left: 6, right: 6}}>
                <Text style={ruleStyles.removeBtnText}>Remove</Text>
              </TouchableOpacity>
            </View>
            {/* Indicator chips — wrap so all 10 fit on narrow phones */}
            <Text style={ruleStyles.fieldHeading}>Indicator</Text>
            <View style={ruleStyles.chipsRow}>
              {RULE_INDICATORS.map(ind => {
                const sel = row.indicator === ind;
                return (
                  <TouchableOpacity
                    key={ind}
                    style={[ruleStyles.chip, sel && ruleStyles.chipActive]}
                    onPress={() => update(idx, {indicator: ind})}>
                    <Text style={[ruleStyles.chipText, sel && ruleStyles.chipTextActive]}>{ind}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {/* Operator chips */}
            <Text style={ruleStyles.fieldHeading}>Operator</Text>
            <View style={ruleStyles.chipsRow}>
              {RULE_OPERATORS.map(op => {
                const sel = row.operator === op;
                return (
                  <TouchableOpacity
                    key={op}
                    style={[ruleStyles.chip, sel && ruleStyles.chipActive]}
                    onPress={() => update(idx, {operator: op})}>
                    <Text style={[ruleStyles.chipText, sel && ruleStyles.chipTextActive]}>{op}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {/* Value + weight */}
            <View style={{flexDirection: 'row', gap: 8}}>
              <View style={{flex: 1}}>
                <Text style={ruleStyles.fieldHeading}>Value</Text>
                <TextInput
                  style={ruleStyles.input}
                  placeholder="e.g. 30"
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  keyboardType="decimal-pad"
                  value={row.value}
                  onChangeText={t => update(idx, {value: t})}
                />
              </View>
              <View style={{flex: 1}}>
                <Text style={ruleStyles.fieldHeading}>Weight (0-1)</Text>
                <TextInput
                  style={ruleStyles.input}
                  placeholder="0.5"
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  keyboardType="decimal-pad"
                  value={row.weight}
                  onChangeText={t => update(idx, {weight: t})}
                />
              </View>
            </View>
          </View>
        ))
      )}
      <TouchableOpacity
        style={[ruleStyles.addBtn, rows.length >= 5 && {opacity: 0.5}]}
        onPress={addRow}
        disabled={rows.length >= 5}
        activeOpacity={0.75}>
        <Text style={ruleStyles.addBtnText}>+ Add Condition {rows.length >= 5 ? '(max 5)' : ''}</Text>
      </TouchableOpacity>
    </View>
  );
}

const ruleStyles = StyleSheet.create({
  label: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1,
    marginBottom: 4,
    marginTop: 8,
  },
  help: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    marginBottom: 10,
  },
  empty: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  row: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  rowIndex: {
    fontFamily: 'Inter-Bold',
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.5,
  },
  removeBtn: {paddingHorizontal: 8, paddingVertical: 4},
  removeBtnText: {fontFamily: 'Inter-Medium', fontSize: 11, color: '#EF4444'},
  fieldHeading: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 8,
    marginBottom: 4,
  },
  chipsRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 6},
  chip: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipActive: {
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderColor: '#10B981',
  },
  chipText: {fontFamily: 'Inter-Medium', fontSize: 11, color: 'rgba(255,255,255,0.55)'},
  chipTextActive: {color: '#10B981'},
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    color: '#FFFFFF',
  },
  addBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.4)',
    backgroundColor: 'rgba(16,185,129,0.08)',
    alignItems: 'center',
    marginTop: 6,
  },
  addBtnText: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#10B981'},
});

const sectionStyles = StyleSheet.create({
  card: {
    backgroundColor: '#161B22',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  title: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  subtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
  },
});

// ─── Main Component ─────────────────────────────────────────────────────────

export default function BotBuilderScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const {alert: showAlert} = useToast();
  const {refreshUser} = useAuth();

  const strategyName = route.params?.strategyName;
  const editBotId = route.params?.editBotId;
  const strategyData = route.params?.strategyData;
  const isEditMode = !!editBotId;

  // Detect category from strategyData (AI chat auto-fills assetClass as "stocks" or "crypto" — lowercase)
  const rawAssetClass = ((strategyData as any)?.assetClass ?? '').toLowerCase();
  const initialCategory = rawAssetClass === 'stocks' ? 'Stocks' : 'Crypto';
  const [category, setCategory] = useState<'Crypto' | 'Stocks'>(initialCategory);

  // Store custom pairs generated by AI or loaded from an existing bot so they appear in the UI
  const [customPairs, setCustomPairs] = useState<string[]>(strategyData?.pairs || []);

  const basePairs = category === 'Stocks' ? DEFAULT_STOCK_SYMBOLS : DEFAULT_CRYPTO_PAIRS;
  // Filter custom pairs: crypto pairs usually have '/', stock symbols usually don't
  const validCustomPairs = customPairs.filter(p => category === 'Crypto' ? p.includes('/') : !p.includes('/'));
  const tradingPairs = Array.from(new Set([...basePairs, ...validCustomPairs]));

  const baseStrategies = category === 'Stocks' ? STOCK_STRATEGIES : DEFAULT_STRATEGIES;
  const riskLevels = DEFAULT_RISK_LEVELS;

  const [botName, setBotName] = useState(strategyData?.name || strategyName || '');
  const [selectedPairs, setSelectedPairs] = useState<string[]>(
    strategyData?.pairs?.length ? strategyData.pairs : (initialCategory === 'Stocks' ? ['AAPL'] : ['BTC/USDT']),
  );
  
  // Accept the AI's custom strategy name without incorrectly filtering it out
  const [selectedStrategy, setSelectedStrategy] = useState<string>(
    strategyData?.strategy ? strategyData.strategy : (strategyName ? strategyName : '')
  );

  // Pull the currently selected strategy (default or custom AI-generated) to the very front of the list
  let strategies = [...baseStrategies];
  if (selectedStrategy) {
    strategies = [selectedStrategy, ...strategies.filter(s => s !== selectedStrategy)];
  }
  const [riskLevel, setRiskLevel] = useState<string>(strategyData?.riskLevel || 'Med');
  const [stopLoss, setStopLoss] = useState(strategyData?.stopLoss ? String(strategyData.stopLoss) : '');
  const [takeProfit, setTakeProfit] = useState(strategyData?.takeProfit ? String(strategyData.takeProfit) : '');
  const [maxPosition, setMaxPosition] = useState('');
  const [tradeDirection, setTradeDirection] = useState<'buy' | 'sell' | 'both'>('both');
  const [dailyLossLimit, setDailyLossLimit] = useState('');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [prompt, setPrompt] = useState(strategyData?.prompt || '');
  const [creatorFee, setCreatorFee] = useState('10');
  // Marketplace metadata — UI hidden until backend prod has these fields.
  // State + setters kept so edit-mode rehydration still populates them; once
  // the UI is uncommented the inputs read these directly.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [subtitle, setSubtitle] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [description, setDescription] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [tagsInput, setTagsInput] = useState(''); // comma-separated for ergonomics
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [priceMonthly, setPriceMonthly] = useState('');
  // Custom Entry/Exit rules — UI-driven indicator/operator/value/weight rows.
  // Empty arrays = no custom rules (engine falls back to its defaults).
  const [customEntryConditions, setCustomEntryConditions] = useState<Array<{indicator: string; operator: string; value: string; weight: string}>>([]);
  const [customExitConditions, setCustomExitConditions] = useState<Array<{indicator: string; operator: string; value: string; weight: string}>>([]);
  // Section open/close state (collapsible groups).
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    identity: true,
    strategy: true,
    risk: true,
    execution: false,
    ai: false,
    marketplace: false,
    advanced: false,
  });
  const toggleSection = (key: string) => setOpenSections(prev => ({...prev, [key]: !prev[key]}));
  const [deploying, setDeploying] = useState(false);
  const [loadingBot, setLoadingBot] = useState(false);

  // Bot avatar — server URL (when loaded in edit mode) and a locally-picked
  // image waiting to be uploaded. Once uploaded, serverAvatarUrl is updated
  // and pickedAvatar is cleared.
  const [serverAvatarUrl, setServerAvatarUrl] = useState<string | null>(null);
  const [pickedAvatar, setPickedAvatar] = useState<{uri: string; name: string; type: string} | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [serverAvatarColor, setServerAvatarColor] = useState<string | null>(null);
  const [serverAvatarLetter, setServerAvatarLetter] = useState<string | null>(null);

  // Advanced AI / Trading Settings — pre-fill from AI chat strategyData if available
  const [tradingFrequency, setTradingFrequency] = useState<'conservative' | 'balanced' | 'aggressive' | 'max'>(
    ((strategyData as any)?.tradingFrequency as any) || 'balanced',
  );
  const [aiMode, setAiMode] = useState<'rules_only' | 'hybrid' | 'full_ai'>(
    ((strategyData as any)?.aiMode as any) || 'hybrid',
  );
  const [maxHoldsBeforeAI, setMaxHoldsBeforeAI] = useState('4');
  const [aiConfidenceThreshold, setAiConfidenceThreshold] = useState('60');
  const [maxOpenPositions, setMaxOpenPositions] = useState(
    (strategyData as any)?.maxOpenPositions ? String((strategyData as any).maxOpenPositions) : '3',
  );
  const [tradingSchedule, setTradingSchedule] = useState<'24_7' | 'us_hours' | 'custom'>(
    ((strategyData as any)?.tradingSchedule as any) || (initialCategory === 'Stocks' ? 'us_hours' : '24_7'),
  );

  // Platform config fetch (no longer overrides local lists)
  useEffect(() => {
    configApi.getPlatformConfig().catch(() => {});
  }, []);

  // Load existing bot data in edit mode
  useEffect(() => {
    if (!editBotId) return;
    setLoadingBot(true);
    botsService.getBotForEdit(editBotId)
      .then((res: any) => {
        const bot = res?.data ?? res;
        if (bot) {
          setBotName(bot.name || '');
          setSelectedStrategy(bot.strategy || '');
          if (bot.riskLevel) setRiskLevel(bot.riskLevel);
          const config = bot.config as any;
          if (config?.pairs?.length) {
            setSelectedPairs(config.pairs);
            setCustomPairs(prev => Array.from(new Set([...prev, ...config.pairs])));
          }
          if (config?.stopLoss) setStopLoss(String(config.stopLoss));
          if (config?.takeProfit) setTakeProfit(String(config.takeProfit));
          if (config?.maxPositionSize) setMaxPosition(String(config.maxPositionSize));
          if (bot.category === 'Stocks') setCategory('Stocks');
          if (bot.creatorFeePercent) setCreatorFee(String(bot.creatorFeePercent));
          if (bot.prompt) setPrompt(bot.prompt);
          // Marketplace metadata
          if (bot.subtitle) setSubtitle(bot.subtitle);
          if (bot.description) setDescription(bot.description);
          if (Array.isArray(bot.tags) && bot.tags.length) setTagsInput(bot.tags.join(', '));
          if (bot.priceMonthly) setPriceMonthly(String(bot.priceMonthly));
          // Avatar fields for the picker preview
          setServerAvatarUrl(bot.avatarUrl ?? null);
          setServerAvatarColor(bot.avatarColor ?? null);
          setServerAvatarLetter(bot.avatarLetter ?? null);
          if (config?.tradingFrequency) setTradingFrequency(config.tradingFrequency);
          if (config?.aiMode) setAiMode(config.aiMode);
          if (config?.maxHoldsBeforeAI) setMaxHoldsBeforeAI(String(config.maxHoldsBeforeAI));
          if (config?.aiConfidenceThreshold) setAiConfidenceThreshold(String(config.aiConfidenceThreshold));
          if (config?.maxOpenPositions) setMaxOpenPositions(String(config.maxOpenPositions));
          if (config?.tradingSchedule) setTradingSchedule(config.tradingSchedule);
          // Execution / risk extras that were not previously rehydrated
          if (config?.tradeDirection) setTradeDirection(config.tradeDirection);
          if (config?.orderType) setOrderType(config.orderType);
          if (config?.dailyLossLimit !== undefined && config?.dailyLossLimit !== null) {
            setDailyLossLimit(String(config.dailyLossLimit));
          }
          // Custom rules: hydrate as strings so the inputs render values
          if (Array.isArray(config?.customEntryConditions)) {
            setCustomEntryConditions(config.customEntryConditions.map((c: any) => ({
              indicator: String(c.indicator ?? ''),
              operator: String(c.operator ?? '>'),
              value: c.value !== undefined && c.value !== null ? String(c.value) : '',
              weight: c.weight !== undefined && c.weight !== null ? String(c.weight) : '0.5',
            })));
          }
          if (Array.isArray(config?.customExitConditions)) {
            setCustomExitConditions(config.customExitConditions.map((c: any) => ({
              indicator: String(c.indicator ?? ''),
              operator: String(c.operator ?? '<'),
              value: c.value !== undefined && c.value !== null ? String(c.value) : '',
              weight: c.weight !== undefined && c.weight !== null ? String(c.weight) : '0.5',
            })));
          }
        }
      })
      .catch(() => showAlert('Error', 'Could not load bot data.'))
      .finally(() => setLoadingBot(false));
  }, [editBotId]);

  const togglePair = (pair: string) => {
    setSelectedPairs(prev =>
      prev.includes(pair) ? prev.filter(p => p !== pair) : [...prev, pair],
    );
  };

  // Manual pair entry. Normalises the input (uppercase, trimmed) and validates
  // a basic shape per category — crypto wants BASE/QUOTE, stocks want a plain
  // ticker. Pushes into `customPairs` so it shows up as a chip and auto-selects
  // so the user can save right away.
  const [pairInput, setPairInput] = useState('');
  const addManualPair = () => {
    const raw = pairInput.trim().toUpperCase();
    if (!raw) return;
    if (category === 'Crypto') {
      const ok = /^[A-Z0-9]{2,10}\/[A-Z0-9]{2,10}$/.test(raw);
      if (!ok) {
        showAlert('Invalid pair', 'Use the BASE/QUOTE format, e.g. ARB/USDT.');
        return;
      }
    } else {
      const ok = /^[A-Z]{1,6}$/.test(raw);
      if (!ok) {
        showAlert('Invalid symbol', 'Tickers are 1-6 letters, e.g. NVDA.');
        return;
      }
    }
    setCustomPairs(prev => (prev.includes(raw) ? prev : [...prev, raw]));
    setSelectedPairs(prev => (prev.includes(raw) ? prev : [...prev, raw]));
    setPairInput('');
  };

  // ─── Avatar handlers ───────────────────────────────────────────────────
  // pickAvatarImage opens the OS gallery and stores the picked file locally.
  // - In edit mode: we upload immediately so the change persists even if the
  //   user navigates away without saving.
  // - In create mode: we hold the picked image in `pickedAvatar` and upload
  //   after the bot is created (we need a botId to attach to).
  const pickAvatarImage = async () => {
    try {
      const res = await launchImageLibrary({
        mediaType: 'photo',
        quality: 0.8,
        selectionLimit: 1,
        includeBase64: false,
      });
      if (res.didCancel) return;
      const asset = res.assets?.[0];
      if (!asset?.uri) return;
      const file = {
        uri: asset.uri,
        name: asset.fileName || `bot-avatar-${Date.now()}.jpg`,
        type: asset.type || 'image/jpeg',
      };
      setPickedAvatar(file);
      // If we're editing an existing bot, upload right away.
      if (isEditMode && editBotId) {
        setUploadingAvatar(true);
        try {
          const r = await botsService.uploadAvatar(editBotId, file);
          const url = r?.data?.avatarUrl ?? null;
          setServerAvatarUrl(url);
          setPickedAvatar(null);
        } catch (e: any) {
          showAlert('Upload Failed', e?.message || 'Could not upload image.');
        } finally {
          setUploadingAvatar(false);
        }
      }
    } catch (e: any) {
      showAlert('Picker Error', e?.message || 'Could not open image picker.');
    }
  };

  const removeAvatar = async () => {
    // If we just picked one locally and haven't persisted it, just drop it.
    if (pickedAvatar && !serverAvatarUrl) {
      setPickedAvatar(null);
      return;
    }
    if (!isEditMode || !editBotId) {
      // Create mode: nothing on server yet, just clear local state.
      setPickedAvatar(null);
      setServerAvatarUrl(null);
      return;
    }
    setUploadingAvatar(true);
    try {
      const r = await botsService.removeAvatar(editBotId);
      const url = r?.data?.avatarUrl ?? null;
      setServerAvatarUrl(url);
      setPickedAvatar(null);
    } catch (e: any) {
      showAlert('Error', e?.message || 'Could not remove image.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const validateForm = () => {
    if (!botName.trim()) {
      showAlert('Missing Name', 'Please enter a bot name.');
      return false;
    }
    if (stopLoss) {
      const sl = parseFloat(stopLoss);
      if (isNaN(sl) || sl <= 0 || sl > 50) {
        showAlert('Invalid Stop Loss', 'Stop loss must be between 0.1% and 50%.');
        return false;
      }
    }
    if (takeProfit) {
      const tp = parseFloat(takeProfit);
      if (isNaN(tp) || tp <= 0 || tp > 500) {
        showAlert('Invalid Take Profit', 'Take profit must be between 0.1% and 500%.');
        return false;
      }
    }
    if (maxPosition) {
      const mp = parseFloat(maxPosition);
      if (isNaN(mp) || mp < 10 || mp > 1000000) {
        showAlert('Invalid Max Position', 'Max position size must be between $10 and $1,000,000.');
        return false;
      }
    }
    const price = parseFloat(creatorFee);
    if (!isNaN(price) && price > 20) {
      showAlert('Invalid Price', 'Bot price cannot exceed $20.00 per month.');
      return false;
    }
    return true;
  };

  // Sanitize the editable custom-rule rows into the array shape the backend
  // expects. Empty/invalid rows are filtered out so a half-filled row doesn't
  // 422 the request.
  const buildCustomRules = (rows: typeof customEntryConditions) => rows
    .map(r => ({
      indicator: r.indicator.trim(),
      operator: r.operator,
      value: parseFloat(r.value),
      weight: parseFloat(r.weight),
    }))
    .filter(r =>
      r.indicator.length > 0 &&
      Number.isFinite(r.value) &&
      Number.isFinite(r.weight) &&
      r.weight >= 0 && r.weight <= 1,
    );

  // Single source of truth for both create and update. Mirrors
  // `BotEditableFields` from services/bots.ts so the API contract stays in sync.
  const buildPayload = () => {
    // subtitle / description / tags / priceMonthly intentionally not sent —
    // UI is hidden until backend prod has been redeployed with these fields.
    // const tags = tagsInput
    //   .split(',')
    //   .map(t => t.trim())
    //   .filter(Boolean)
    //   .slice(0, 10);
    // const priceNum = parseFloat(priceMonthly);

    return {
      // Identity / marketplace
      name: botName.trim(),
      // subtitle: subtitle.trim() || undefined,
      // description: description.trim() || undefined,
      // tags: tags.length ? tags : undefined,
      // priceMonthly: Number.isFinite(priceNum) && priceNum >= 0 ? priceNum : undefined,
      creatorFeePercent: creatorFee ? parseFloat(creatorFee) : 10,
      // Strategy core
      strategy: selectedStrategy || undefined,
      category,
      // Backend accepts both `risk_level` (snake) and `riskLevel` (camel). Send
      // both so the contract is forgiving.
      risk_level: riskLevel,
      riskLevel,
      pairs: selectedPairs,
      prompt: prompt.trim() ? prompt.trim().slice(0, 4500) : undefined,
      // Risk / sizing
      stopLoss: stopLoss ? parseFloat(stopLoss) : undefined,
      takeProfit: takeProfit ? parseFloat(takeProfit) : undefined,
      maxPositionSize: maxPosition ? parseFloat(maxPosition) : undefined,
      // legacy alias used by older create payloads
      maxPosition: maxPosition ? parseFloat(maxPosition) : undefined,
      dailyLossLimit: dailyLossLimit ? parseFloat(dailyLossLimit) : undefined,
      maxOpenPositions: maxOpenPositions ? parseInt(maxOpenPositions, 10) : undefined,
      // Execution
      tradeDirection,
      orderType,
      tradingFrequency,
      tradingSchedule,
      // AI
      aiMode,
      maxHoldsBeforeAI: maxHoldsBeforeAI ? parseInt(maxHoldsBeforeAI, 10) : undefined,
      aiConfidenceThreshold: aiConfidenceThreshold ? parseFloat(aiConfidenceThreshold) : undefined,
      customEntryConditions: customEntryConditions.length ? buildCustomRules(customEntryConditions) : undefined,
      customExitConditions: customExitConditions.length ? buildCustomRules(customExitConditions) : undefined,
    } as any;
  };

  const handleDeploy = async () => {
    if (!validateForm()) return;
    if (!selectedStrategy) {
      showAlert('Missing Strategy', 'Please select a strategy.');
      return;
    }
    if (selectedPairs.length === 0) {
      showAlert('Missing Pairs', 'Please select at least one trading pair.');
      return;
    }
    setDeploying(true);
    try {
      if (isEditMode) {
        // Send the full payload — every field the form collects is now persisted
        // by the backend updateBot service (tradeDirection / orderType /
        // dailyLossLimit / subtitle / description / tags / priceMonthly /
        // custom rules included).
        await botsService.updateBot(editBotId!, buildPayload());
        showAlert('Bot Updated!', `${botName} has been updated.`);
        navigation.goBack();
      } else {
        // Check for duplicate bot name before creating
        try {
          const myBots = await creatorApi.getBots();
          const duplicate = myBots.find(
            (b: any) => b.name?.trim().toLowerCase() === botName.trim().toLowerCase(),
          );
          if (duplicate) {
            showAlert('Duplicate Name', `You already have a bot named "${botName.trim()}". Please choose a different name.`);
            setDeploying(false);
            return;
          }
        } catch {
          // If the check fails, proceed anyway — don't block the user
        }

        const res = await botsService.createBot(buildPayload());
        const newBotId = res?.data?.id ?? res?.data?.data?.id;
        await refreshUser(); // role may have upgraded to 'creator'

        // Upload the avatar (if picked) before publishing — non-fatal on
        // failure so the bot still ships even if the upload hiccups.
        if (newBotId && pickedAvatar) {
          try {
            await botsService.uploadAvatar(newBotId, pickedAvatar);
          } catch {
            // Image upload failed — bot still created without it.
          }
        }

        // Publish immediately so it appears in the marketplace
        if (newBotId) {
          try {
            await creatorApi.publishBot(newBotId);
          } catch {
            // Published silently failed — bot still created as draft
          }
        }

        showAlert('Bot Deployed!', `${botName} is now live on the marketplace.`);
        navigation.goBack();
      }
    } catch (e: any) {
      showAlert(isEditMode ? 'Update Failed' : 'Deploy Failed', e?.message || 'Could not save bot.');
    } finally {
      setDeploying(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!validateForm()) return;
    setDeploying(true);
    try {
      if (isEditMode) {
        await botsService.updateBot(editBotId!, buildPayload());
        showAlert('Bot Updated!', `${botName} has been saved.`);
        navigation.goBack();
      } else {
        const res = await botsService.createBot(buildPayload());
        const newBotId = res?.data?.id ?? res?.data?.data?.id;
        await refreshUser(); // role may have upgraded to 'creator'
        if (newBotId && pickedAvatar) {
          try {
            await botsService.uploadAvatar(newBotId, pickedAvatar);
          } catch {
            // Non-fatal — draft saved without avatar.
          }
        }
        showAlert('Draft Saved!', `${botName} has been saved as a draft.`);
      }
    } catch (e: any) {
      showAlert('Save Failed', e?.message || 'Could not save draft.');
    } finally {
      setDeploying(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
          <BackArrow />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEditMode ? 'Edit Bot' : 'Configure Bot'}</Text>
        <View style={{width: 22}} />
      </View>

      {loadingBot ? (
        <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
          <ActivityIndicator size="large" color="#10B981" />
        </View>
      ) : (
        <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">

        {/* ── 1. IDENTITY ─────────────────────────────────────────── */}
        <SectionCard
          title="Identity"
          subtitle="Avatar, name, and how this bot appears in the marketplace"
          open={openSections.identity}
          onToggle={() => toggleSection('identity')}>
        {/* Bot Avatar Image picker — preview + Upload/Change/Remove actions. */}
        <Text style={styles.label}>BOT AVATAR</Text>
        <View style={styles.avatarRow}>
          <View style={styles.avatarPreviewWrap}>
            <BotAvatar
              size={84}
              avatarUrl={pickedAvatar?.uri ?? serverAvatarUrl}
              avatarColor={serverAvatarColor ?? '#6C63FF'}
              avatarLetter={serverAvatarLetter ?? (botName.trim().charAt(0).toUpperCase() || 'B')}
            />
            {uploadingAvatar && (
              <View style={styles.avatarUploadingOverlay}>
                <ActivityIndicator size="small" color="#FFFFFF" />
              </View>
            )}
          </View>
          <View style={styles.avatarActions}>
            <TouchableOpacity
              style={styles.avatarPickBtn}
              activeOpacity={0.75}
              onPress={pickAvatarImage}
              disabled={uploadingAvatar}>
              <Text style={styles.avatarPickBtnText}>
                {pickedAvatar || serverAvatarUrl ? 'Change Image' : 'Upload Image'}
              </Text>
            </TouchableOpacity>
            {(pickedAvatar || serverAvatarUrl) && (
              <TouchableOpacity
                style={styles.avatarRemoveBtn}
                activeOpacity={0.75}
                onPress={removeAvatar}
                disabled={uploadingAvatar}>
                <Text style={styles.avatarRemoveBtnText}>Remove</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.avatarHint}>
              JPG, PNG, WebP, or GIF · max 10MB
            </Text>
          </View>
        </View>

        {/* Asset Class Toggle */}
        <Text style={styles.label}>ASSET CLASS</Text>
        <View style={{flexDirection: 'row', gap: 10, marginBottom: 18}}>
          <TouchableOpacity
            activeOpacity={0.7}
            style={[styles.categoryBtn, category === 'Crypto' && styles.categoryBtnActive]}
            onPress={() => {
              setCategory('Crypto');
              setSelectedPairs(['BTC/USDT']);
              setSelectedStrategy('');
              setTradingSchedule('24_7');
            }}>
            <Text style={[styles.categoryBtnText, category === 'Crypto' && styles.categoryBtnTextActive]}>Crypto</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.7}
            style={[styles.categoryBtn, category === 'Stocks' && styles.categoryBtnActive]}
            onPress={() => {
              setCategory('Stocks');
              setSelectedPairs(['AAPL']);
              setSelectedStrategy('');
              setTradingSchedule('us_hours');
            }}>
            <Text style={[styles.categoryBtnText, category === 'Stocks' && styles.categoryBtnTextActive]}>Stocks</Text>
          </TouchableOpacity>
        </View>
        {category === 'Stocks' && (
          <View style={{backgroundColor: 'rgba(59,130,246,0.08)', borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(59,130,246,0.2)'}}>
            <Text style={{fontFamily: 'Inter-Medium', fontSize: 12, color: '#3B82F6'}}>
              Stock bots trade during US market hours (9:30 AM - 4:00 PM ET) via Alpaca.
            </Text>
          </View>
        )}

        {/* Bot Name */}
        <Text style={styles.label}>BOT NAME</Text>
        <TextInput
          style={styles.textInput}
          placeholder="Enter bot name..."
          placeholderTextColor="rgba(255,255,255,0.3)"
          value={botName}
          onChangeText={setBotName}
        />

        {/* Subtitle / Description / Tags — hidden until backend prod is
            deployed. State + edit-mode rehydration kept so re-enabling is a
            simple uncomment. */}
        {/*
        <Text style={styles.label}>SUBTITLE (OPTIONAL)</Text>
        <TextInput
          style={styles.textInput}
          placeholder="One-line tagline shown on marketplace cards"
          placeholderTextColor="rgba(255,255,255,0.3)"
          value={subtitle}
          onChangeText={setSubtitle}
          maxLength={200}
        />

        <Text style={styles.label}>DESCRIPTION (OPTIONAL)</Text>
        <TextInput
          style={[styles.textInput, {height: 90, textAlignVertical: 'top', paddingTop: 12}]}
          placeholder="What does this bot do? Who is it for?"
          placeholderTextColor="rgba(255,255,255,0.3)"
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={2000}
        />

        <Text style={styles.label}>TAGS (OPTIONAL, COMMA-SEPARATED)</Text>
        <TextInput
          style={styles.textInput}
          placeholder="e.g. momentum, swing, low-risk"
          placeholderTextColor="rgba(255,255,255,0.3)"
          value={tagsInput}
          onChangeText={setTagsInput}
          maxLength={300}
        />
        <Text style={styles.fieldHint}>
          Up to 10 tags · shown as badges on the bot card.
        </Text>
        */}
        </SectionCard>

        {/* ── 2. STRATEGY ─────────────────────────────────────────── */}
        <SectionCard
          title="Strategy"
          subtitle="Asset class, strategy choice, pairs, and AI instructions"
          open={openSections.strategy}
          onToggle={() => toggleSection('strategy')}>

        {/* Bot Instructions / Prompt — only for AI-based strategies */}
        {!RULE_ONLY_STRATEGIES.includes(selectedStrategy) && (
          <>
            <Text style={styles.label}>
              {selectedStrategy === 'Custom' ? 'CUSTOM STRATEGY INSTRUCTIONS' : 'BOT INSTRUCTIONS (OPTIONAL)'}
            </Text>
            <TextInput
              style={[styles.textInput, {height: 100, textAlignVertical: 'top', paddingTop: 12}]}
              placeholder={selectedStrategy === 'Custom'
                ? "Describe your trading strategy in detail... (e.g., Buy when RSI drops below 30 and price is near support, sell when RSI > 70 or MACD crosses bearish)"
                : "Add custom instructions to fine-tune the strategy... (optional — sensible defaults will be used)"}
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={prompt}
              onChangeText={setPrompt}
              multiline
              numberOfLines={4}
              maxLength={2000}
            />
            {prompt.length > 0 && (
              <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'right', marginTop: 4}}>
                {prompt.length}/2000
              </Text>
            )}
          </>
        )}
        {RULE_ONLY_STRATEGIES.includes(selectedStrategy) && (
          <View style={{backgroundColor: '#111827', borderRadius: 10, padding: 14, marginBottom: 12}}>
            <Text style={{fontFamily: 'Inter-Medium', fontSize: 13, color: '#9CA3AF', lineHeight: 18}}>
              {selectedStrategy === 'DCA'
                ? 'DCA bots buy automatically at regular intervals regardless of price. Configure the amount and frequency with the parameters below.'
                : 'Grid bots place buy orders below the current price and sell orders above it, profiting from price oscillations within a range.'}
            </Text>
          </View>
        )}

        {/* Trading Pairs */}
        <Text style={styles.label}>TRADING PAIRS</Text>
        <View style={styles.chipsRow}>
          {tradingPairs.map(pair => {
            const isSelected = selectedPairs.includes(pair);
            return (
              <TouchableOpacity
                key={pair}
                style={[styles.chip, isSelected && styles.chipSelected]}
                onPress={() => togglePair(pair)}>
                <Text
                  style={[
                    styles.chipText,
                    isSelected && styles.chipTextSelected,
                  ]}>
                  {pair}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Manual pair entry — works for both create and edit. Pushes the
            normalised pair into `customPairs` (which feeds `tradingPairs`)
            and auto-selects it. */}
        <View style={styles.pairAddRow}>
          <TextInput
            style={styles.pairAddInput}
            placeholder={category === 'Stocks' ? 'Add symbol (e.g. NVDA)' : 'Add pair (e.g. ARB/USDT)'}
            placeholderTextColor="rgba(255,255,255,0.3)"
            autoCapitalize="characters"
            autoCorrect={false}
            value={pairInput}
            onChangeText={setPairInput}
            onSubmitEditing={addManualPair}
            returnKeyType="done"
          />
          <TouchableOpacity style={styles.pairAddBtn} onPress={addManualPair} activeOpacity={0.7}>
            <Text style={styles.pairAddBtnText}>Add</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.fieldHint}>
          {category === 'Stocks'
            ? 'Type a ticker like NVDA or TSLA. Added pairs are saved with the bot.'
            : 'Use the BASE/QUOTE format like ARB/USDT. Added pairs are saved with the bot.'}
        </Text>

        {/* Strategy — pick a preset OR type any custom name. Backend stores
            `bots.strategy` as varchar(200), so the value is honored verbatim. */}
        <Text style={styles.label}>STRATEGY</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.strategyScroll}>
          {strategies.map(strat => {
            const isSelected = selectedStrategy === strat;
            return (
              <TouchableOpacity
                key={strat}
                style={[
                  styles.strategyCard,
                  isSelected && styles.strategyCardSelected,
                ]}
                onPress={() => setSelectedStrategy(strat)}>
                <Text
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={[
                    styles.strategyText,
                    isSelected && styles.strategyTextSelected,
                  ]}>
                  {strat.length > 22 ? strat.substring(0, 20) + '...' : strat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <TextInput
          style={[styles.textInput, {marginTop: 10}]}
          placeholder="Or type a custom strategy name…"
          placeholderTextColor="rgba(255,255,255,0.3)"
          value={selectedStrategy}
          onChangeText={setSelectedStrategy}
          maxLength={200}
        />
        <Text style={styles.fieldHint}>
          Free-form. Engine drives behaviour off the strategy name + your prompt + parameters.
        </Text>
        </SectionCard>

        {/* ── 3. RISK & SIZING ────────────────────────────────────── */}
        <SectionCard
          title="Risk & Sizing"
          subtitle="Risk level, stop-loss, take-profit, and position limits"
          open={openSections.risk}
          onToggle={() => toggleSection('risk')}>

        {/* Risk Level */}
        <Text style={styles.label}>RISK LEVEL</Text>
        <View style={styles.segmentContainer}>
          {riskLevels.map(level => {
            const isSelected = riskLevel === level;
            return (
              <TouchableOpacity
                key={level}
                style={[
                  styles.segment,
                  isSelected && styles.segmentSelected,
                ]}
                onPress={() => setRiskLevel(level)}>
                <Text
                  style={[
                    styles.segmentText,
                    isSelected && styles.segmentTextSelected,
                  ]}>
                  {level}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Parameters */}
        <Text style={styles.label}>PARAMETERS</Text>
        <View style={styles.paramCard}>
          <Text style={styles.paramLabel}>Stop Loss %</Text>
          <View style={styles.paramInputRow}>
            <TextInput
              style={styles.paramInput}
              placeholder="2.0"
              placeholderTextColor="rgba(255,255,255,0.25)"
              keyboardType="decimal-pad"
              value={stopLoss}
              onChangeText={setStopLoss}
            />
            <Text style={styles.paramSuffix}>%</Text>
          </View>
        </View>
        <View style={styles.paramCard}>
          <Text style={styles.paramLabel}>Take Profit %</Text>
          <View style={styles.paramInputRow}>
            <TextInput
              style={styles.paramInput}
              placeholder="5.0"
              placeholderTextColor="rgba(255,255,255,0.25)"
              keyboardType="decimal-pad"
              value={takeProfit}
              onChangeText={setTakeProfit}
            />
            <Text style={styles.paramSuffix}>%</Text>
          </View>
        </View>
        <View style={styles.paramCard}>
          <Text style={styles.paramLabel}>Max Position Size</Text>
          <View style={styles.paramInputRow}>
            <Text style={styles.paramPrefix}>$</Text>
            <TextInput
              style={styles.paramInput}
              placeholder="1000"
              placeholderTextColor="rgba(255,255,255,0.25)"
              keyboardType="decimal-pad"
              value={maxPosition}
              onChangeText={setMaxPosition}
            />
          </View>
        </View>

        </SectionCard>

        {/* ── 4. MARKETPLACE — hidden per product call.
               Section is fully commented out below; creatorFee defaults to 10% in
               the payload so existing logic still works. Re-enable by uncommenting. */}
        {/*
        <SectionCard
          title="Marketplace"
          subtitle="How subscribers see and pay for this bot"
          open={openSections.marketplace}
          onToggle={() => toggleSection('marketplace')}>

          <Text style={styles.label}>CREATOR FEE (% OF SUBSCRIBER PROFITS)</Text>
          <View style={styles.feeCard}>
            <View style={styles.feePresetRow}>
              {['5', '10', '15', '20'].map(val => (
                <TouchableOpacity
                  key={val}
                  style={[styles.feePreset, creatorFee === val && styles.feePresetActive]}
                  onPress={() => setCreatorFee(val)}
                  activeOpacity={0.7}>
                  <Text style={[styles.feePresetText, creatorFee === val && styles.feePresetTextActive]}>
                    {val}%
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.feeInfoRow}>
              <Text style={styles.feeInfoText}>
                You earn {creatorFee || '10'}% of every profit your subscribers make. Platform takes 2-5%.
              </Text>
            </View>
          </View>
        </SectionCard>
        */}

        {/* ── 5. EXECUTION ────────────────────────────────────────── */}
        <SectionCard
          title="Execution"
          subtitle="How the bot places trades — direction, order type, frequency, schedule"
          open={openSections.execution}
          onToggle={() => toggleSection('execution')}>

        {/* Trade Direction */}
        <Text style={styles.label}>TRADE DIRECTION</Text>
        <View style={styles.modeRow}>
          {(['buy', 'sell', 'both'] as const).map(dir => (
            <TouchableOpacity
              key={dir}
              style={[styles.modeBtn, tradeDirection === dir && styles.modeBtnSelected]}
              onPress={() => setTradeDirection(dir)}>
              <Text style={[styles.modeBtnText, tradeDirection === dir && styles.modeBtnTextSelected]}>
                {dir === 'buy' ? 'Buy Only' : dir === 'sell' ? 'Sell Only' : 'Both'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Order Type */}
        <Text style={styles.label}>ORDER TYPE</Text>
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.modeBtn, orderType === 'market' && styles.modeBtnSelected]}
            onPress={() => setOrderType('market')}>
            <Text style={[styles.modeBtnText, orderType === 'market' && styles.modeBtnTextSelected]}>Market</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, orderType === 'limit' && styles.modeBtnSelected, orderType !== 'limit' && styles.modeBtnOutline]}
            onPress={() => setOrderType('limit')}>
            <Text style={[styles.modeBtnText, orderType === 'limit' && styles.modeBtnTextSelected]}>Limit</Text>
          </TouchableOpacity>
        </View>

        {/* Daily Loss Limit */}
        <Text style={styles.label}>DAILY LOSS LIMIT (%)</Text>
        <TextInput
          style={styles.textInput}
          placeholder="e.g. 5"
          placeholderTextColor="rgba(255,255,255,0.3)"
          value={dailyLossLimit}
          onChangeText={setDailyLossLimit}
          keyboardType="decimal-pad"
        />
        <Text style={styles.fieldHint}>
          Auto-pauses the bot if its daily loss exceeds this percentage.
        </Text>

        {/* ── Advanced AI & Trading Settings ────────────────────── */}
        <Text style={styles.label}>TRADING FREQUENCY</Text>
        <View style={styles.modeRow}>
          {(['conservative', 'balanced', 'aggressive', 'max'] as const).map(f => (
            <TouchableOpacity
              key={f}
              style={[styles.modeBtn, tradingFrequency === f && styles.modeBtnSelected]}
              onPress={() => setTradingFrequency(f)}>
              <Text style={[styles.modeBtnText, tradingFrequency === f && styles.modeBtnTextSelected]}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 14, marginTop: -6}}>
          {tradingFrequency === 'conservative' ? 'Long cooldowns, fewer trades, lower frequency'
            : tradingFrequency === 'balanced' ? 'Balanced trade rate (default)'
            : tradingFrequency === 'aggressive' ? 'Short cooldowns, more active trading'
            : 'Maximum frequency — trade as fast as signals allow'}
        </Text>

        </SectionCard>

        {/* ── 6. AI BEHAVIOUR ─────────────────────────────────────── */}
        <SectionCard
          title="AI Behaviour"
          subtitle="When and how the AI engine takes over decisions"
          open={openSections.ai}
          onToggle={() => toggleSection('ai')}>

        <Text style={styles.label}>AI MODE</Text>
        <View style={styles.modeRow}>
          {([['rules_only', 'Rules Only'], ['hybrid', 'Hybrid'], ['full_ai', 'Full AI']] as const).map(([val, lbl]) => (
            <TouchableOpacity
              key={val}
              style={[styles.modeBtn, aiMode === val && styles.modeBtnSelected]}
              onPress={() => setAiMode(val)}>
              <Text style={[styles.modeBtnText, aiMode === val && styles.modeBtnTextSelected]}>{lbl}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 14, marginTop: -6}}>
          {aiMode === 'rules_only' ? 'Pure indicator rules, no AI calls (fastest)'
            : aiMode === 'hybrid' ? 'Rules first, AI validates on significant signals'
            : 'AI makes all decisions based on your prompt'}
        </Text>

        {aiMode !== 'rules_only' && (
          <>
            <View style={styles.paramCard}>
              <Text style={styles.paramLabel}>Force AI After N HOLDs</Text>
              <View style={styles.paramInputRow}>
                <TextInput
                  style={styles.paramInput}
                  placeholder="4"
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  keyboardType="number-pad"
                  value={maxHoldsBeforeAI}
                  onChangeText={setMaxHoldsBeforeAI}
                />
                <Text style={styles.paramSuffix}>holds</Text>
              </View>
            </View>
            <View style={styles.paramCard}>
              <Text style={styles.paramLabel}>AI Confidence Threshold</Text>
              <View style={styles.paramInputRow}>
                <TextInput
                  style={styles.paramInput}
                  placeholder="60"
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  keyboardType="decimal-pad"
                  value={aiConfidenceThreshold}
                  onChangeText={setAiConfidenceThreshold}
                />
                <Text style={styles.paramSuffix}>%</Text>
              </View>
            </View>
          </>
        )}

        <View style={styles.paramCard}>
          <Text style={styles.paramLabel}>Max Open Positions</Text>
          <View style={styles.paramInputRow}>
            <TextInput
              style={styles.paramInput}
              placeholder="3"
              placeholderTextColor="rgba(255,255,255,0.25)"
              keyboardType="number-pad"
              value={maxOpenPositions}
              onChangeText={setMaxOpenPositions}
            />
            <Text style={styles.paramSuffix}>positions</Text>
          </View>
        </View>

        {category !== 'Stocks' && (
          <>
            <Text style={styles.label}>TRADING SCHEDULE</Text>
            <View style={styles.modeRow}>
              {([['24_7', '24/7'], ['us_hours', 'US Hours'], ['custom', 'Custom']] as const).map(([val, lbl]) => (
                <TouchableOpacity
                  key={val}
                  style={[styles.modeBtn, tradingSchedule === val && styles.modeBtnSelected]}
                  onPress={() => setTradingSchedule(val)}>
                  <Text style={[styles.modeBtnText, tradingSchedule === val && styles.modeBtnTextSelected]}>{lbl}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        </SectionCard>

        {/* ── 7. CUSTOM RULES ─────────────────────────────────────── */}
        <SectionCard
          title="Custom Rules"
          subtitle="Hand-authored entry/exit conditions (advanced)"
          open={openSections.advanced}
          onToggle={() => toggleSection('advanced')}>

          <CustomRulesEditor
            label="ENTRY CONDITIONS"
            help="ALL conditions must pass for the bot to open a position. Up to 5."
            rows={customEntryConditions}
            setRows={setCustomEntryConditions}
            defaultOperator=">"
          />
          <CustomRulesEditor
            label="EXIT CONDITIONS"
            help="Any one condition triggers an exit. Up to 5."
            rows={customExitConditions}
            setRows={setCustomExitConditions}
            defaultOperator="<"
          />
        </SectionCard>

        {/* How it works info */}
        <View style={{backgroundColor: '#111827', borderRadius: 10, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#1F2937'}}>
          <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#FFFFFF', marginBottom: 6}}>How it works</Text>
          <Text style={{fontFamily: 'Inter-Regular', fontSize: 12, color: '#9CA3AF', lineHeight: 18}}>
            1. Deploy your bot with a strategy and parameters{'\n'}
            2. Test with Shadow Mode (virtual money, no risk){'\n'}
            3. When ready, Go Live with your exchange connection
          </Text>
        </View>

        {/* Train with Data — only for AI strategies */}
        {!RULE_ONLY_STRATEGIES.includes(selectedStrategy) && (
        <TouchableOpacity
          style={styles.trainBtn}
          activeOpacity={0.7}
          onPress={async () => {
            if (isEditMode) {
              // Edit mode: bot exists, go straight to training
              navigation.navigate('TrainingUpload', {botId: editBotId!});
            } else {
              // Create mode: create bot first, then navigate to training
              if (!validateForm()) return;
              if (!selectedStrategy) { showAlert('Missing Strategy', 'Please select a strategy first.'); return; }
              if (selectedPairs.length === 0) { showAlert('Missing Pairs', 'Please select at least one trading pair.'); return; }
              setDeploying(true);
              try {
                const res = await botsService.createBot(buildPayload());
                const newBotId = res?.data?.id ?? res?.data?.data?.id;
                await refreshUser();
                if (newBotId) {
                  navigation.navigate('TrainingUpload', {botId: newBotId});
                } else {
                  showAlert('Bot Created', `${botName} was created. Go to Creator Studio to train it.`);
                  navigation.goBack();
                }
              } catch (e: any) {
                showAlert('Error', e?.message || 'Could not create bot.');
              } finally {
                setDeploying(false);
              }
            }
          }}>
          <BrainIcon />
          <View style={{flex: 1, marginLeft: 12}}>
            <Text style={styles.trainBtnTitle}>Train with Data</Text>
            <Text style={styles.trainBtnSub}>{isEditMode ? 'Upload datasets to improve AI accuracy' : 'Save & train this bot'}</Text>
          </View>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Path d="M9 5l7 7-7 7" stroke="rgba(255,255,255,0.4)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>
        )}

        {/* Deploy Button */}
        <TouchableOpacity
          style={[styles.deployBtn, deploying && {opacity: 0.6}]}
          activeOpacity={0.8}
          onPress={handleDeploy}
          disabled={deploying}>
          {deploying ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <RocketIcon />
          )}
          <Text style={styles.deployBtnText}>{deploying ? (isEditMode ? 'Saving...' : 'Deploying...') : (isEditMode ? 'Save Changes' : 'Deploy Bot')}</Text>
        </TouchableOpacity>

        {/* Save Draft */}
        <TouchableOpacity
          style={styles.draftBtn}
          onPress={handleSaveDraft}
          disabled={deploying}>
          <Text style={styles.draftBtnText}>Save as Draft</Text>
        </TouchableOpacity>

        <View style={{height: 40}} />
      </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E14',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 54,
    paddingBottom: 14,
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 18,
    color: '#FFFFFF',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  label: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 18,
  },
  categoryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  categoryBtnActive: {
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderColor: '#10B981',
  },
  categoryBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
  },
  categoryBtnTextActive: {
    color: '#10B981',
  },
  fieldHint: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    lineHeight: 17,
    color: 'rgba(255,255,255,0.45)',
    marginTop: -2,
    marginBottom: 14,
  },
  // ─── Avatar picker styles ─────────────────────────────────────────────
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 18,
  },
  avatarPreviewWrap: {
    width: 84,
    height: 84,
    position: 'relative',
  },
  avatarUploadingOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarActions: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  avatarPickBtn: {
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.25)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  avatarPickBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    color: '#10B981',
  },
  avatarRemoveBtn: {
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  avatarRemoveBtnText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: '#EF4444',
  },
  avatarHint: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 2,
  },
  pairAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    marginBottom: 6,
  },
  pairAddInput: {
    flex: 1,
    backgroundColor: '#161B22',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: '#FFFFFF',
  },
  pairAddBtn: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.4)',
  },
  pairAddBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    color: '#10B981',
  },
  textInput: {
    backgroundColor: '#161B22',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: 'Inter-Regular',
    marginBottom: 10,
    fontSize: 15,
    color: '#FFFFFF',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#161B22',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  chipSelected: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  chipText: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },
  strategyScroll: {
    marginBottom: 4,
  },
  strategyCard: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: '#161B22',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginRight: 10,
  },
  strategyCardSelected: {
    borderColor: '#10B981',
    borderWidth: 1.5,
  },
  strategyText: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
  strategyTextSelected: {
    color: '#10B981',
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#161B22',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  segmentSelected: {
    backgroundColor: '#10B981',
    borderRadius: 14,
  },
  segmentText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  segmentTextSelected: {
    color: '#FFFFFF',
    fontFamily: 'Inter-SemiBold',
  },
  paramCard: {
    backgroundColor: '#161B22',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 10,
  },
  paramLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 6,
  },
  paramInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  paramInput: {
    flex: 1,
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: '#FFFFFF',
    padding: 0,
  },
  paramSuffix: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
    marginLeft: 4,
  },
  paramPrefix: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
    marginRight: 4,
  },
  feeCard: {
    backgroundColor: '#161B22',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 14,
    marginBottom: 8,
  },
  feePresetRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  feePreset: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  feePresetActive: {
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderColor: '#10B981',
  },
  feePresetText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
  },
  feePresetTextActive: {
    color: '#10B981',
  },
  feeInfoRow: {
    backgroundColor: 'rgba(16,185,129,0.06)',
    borderRadius: 10,
    padding: 10,
  },
  feeInfoText: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 18,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  modeBtnSelected: {
    backgroundColor: '#10B981',
  },
  modeBtnOutline: {
    backgroundColor: '#161B22',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modeBtnText: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
  },
  modeBtnTextSelected: {
    color: '#FFFFFF',
    fontFamily: 'Inter-SemiBold',
  },
  trainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.2)',
  },
  trainBtnTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  trainBtnSub: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  deployBtn: {
    backgroundColor: '#10B981',
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  deployBtnText: {
    fontFamily: 'Inter-Bold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  draftBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 4,
  },
  draftBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: '#10B981',
  },
});
