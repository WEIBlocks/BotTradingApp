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
import {botsService} from '../../services/bots';
import {configApi} from '../../services/config';
import Svg, {Path} from 'react-native-svg';
import {useNavigation, useRoute, RouteProp} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../types';
import {useToast} from '../../context/ToastContext';
import {useAuth} from '../../context/AuthContext';

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

  // Detect category from strategyData (AI chat auto-fills assetClass)
  const initialCategory = (strategyData as any)?.assetClass === 'stocks' ? 'Stocks' : 'Crypto';
  const [category, setCategory] = useState<'Crypto' | 'Stocks'>(initialCategory);

  const tradingPairs = category === 'Stocks' ? DEFAULT_STOCK_SYMBOLS : DEFAULT_CRYPTO_PAIRS;
  const strategies = category === 'Stocks' ? STOCK_STRATEGIES : DEFAULT_STRATEGIES;
  const riskLevels = DEFAULT_RISK_LEVELS;

  const [botName, setBotName] = useState(strategyData?.name || strategyName || '');
  const [selectedPairs, setSelectedPairs] = useState<string[]>(
    strategyData?.pairs?.length ? strategyData.pairs : (initialCategory === 'Stocks' ? ['AAPL'] : ['BTC/USDT']),
  );
  const [selectedStrategy, setSelectedStrategy] = useState(
    strategyData?.strategy && DEFAULT_STRATEGIES.includes(strategyData.strategy)
      ? strategyData.strategy
      : strategyName && DEFAULT_STRATEGIES.includes(strategyName)
        ? strategyName
        : '',
  );
  const [riskLevel, setRiskLevel] = useState<string>(strategyData?.riskLevel || 'Med');
  const [stopLoss, setStopLoss] = useState(strategyData?.stopLoss ? String(strategyData.stopLoss) : '');
  const [takeProfit, setTakeProfit] = useState(strategyData?.takeProfit ? String(strategyData.takeProfit) : '');
  const [maxPosition, setMaxPosition] = useState('');
  const [tradeDirection, setTradeDirection] = useState<'buy' | 'sell' | 'both'>('both');
  const [dailyLossLimit, setDailyLossLimit] = useState('');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [prompt, setPrompt] = useState(strategyData?.prompt || '');
  const [creatorFee, setCreatorFee] = useState('10');
  const [deploying, setDeploying] = useState(false);
  const [loadingBot, setLoadingBot] = useState(false);

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
          if (config?.pairs?.length) setSelectedPairs(config.pairs);
          if (config?.stopLoss) setStopLoss(String(config.stopLoss));
          if (config?.takeProfit) setTakeProfit(String(config.takeProfit));
          if (config?.maxPositionSize) setMaxPosition(String(config.maxPositionSize));
          if (bot.category === 'Stocks') setCategory('Stocks');
          if (bot.creatorFeePercent) setCreatorFee(String(bot.creatorFeePercent));
          if (bot.prompt) setPrompt(bot.prompt);
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

  const getBotPayload = () => ({
    name: botName.trim(),
    strategy: selectedStrategy || undefined,
    category,
    riskLevel: riskLevel,
    pairs: selectedPairs,
    stopLoss: stopLoss ? parseFloat(stopLoss) : undefined,
    takeProfit: takeProfit ? parseFloat(takeProfit) : undefined,
    maxPosition: maxPosition ? parseFloat(maxPosition) : undefined,
    tradeDirection,
    dailyLossLimit: dailyLossLimit ? parseFloat(dailyLossLimit) : undefined,
    orderType,
    creatorFeePercent: creatorFee ? parseFloat(creatorFee) : 10,
    prompt: prompt.trim() || undefined,
  });

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
        await botsService.updateBot(editBotId!, {
          name: botName.trim(),
          strategy: selectedStrategy,
          category,
          risk_level: riskLevel,
          pairs: selectedPairs,
          stopLoss: stopLoss ? parseFloat(stopLoss) : undefined,
          takeProfit: takeProfit ? parseFloat(takeProfit) : undefined,
          maxPositionSize: maxPosition ? parseFloat(maxPosition) : undefined,
          creatorFeePercent: creatorFee ? parseFloat(creatorFee) : 10,
          prompt: prompt.trim() || undefined,
        });
        showAlert('Bot Updated!', `${botName} has been updated.`);
        navigation.goBack();
      } else {
        await botsService.createBot(getBotPayload());
        await refreshUser(); // role may have upgraded to 'creator'
        showAlert('Bot Deployed!', `${botName} has been created as a ${category} bot.`);
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
        await botsService.updateBot(editBotId!, {
          name: botName.trim(),
          strategy: selectedStrategy || undefined,
          category,
          risk_level: riskLevel,
          pairs: selectedPairs,
          stopLoss: stopLoss ? parseFloat(stopLoss) : undefined,
          takeProfit: takeProfit ? parseFloat(takeProfit) : undefined,
          maxPositionSize: maxPosition ? parseFloat(maxPosition) : undefined,
        });
        showAlert('Bot Updated!', `${botName} has been saved.`);
        navigation.goBack();
      } else {
        await botsService.createBot({...getBotPayload(), description: 'Draft'});
        await refreshUser(); // role may have upgraded to 'creator'
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

        {/* Strategy */}
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
                  style={[
                    styles.strategyText,
                    isSelected && styles.strategyTextSelected,
                  ]}>
                  {strat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

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

        {/* Creator Fee */}
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
          placeholder="e.g. 5 (auto-pause bot if daily loss exceeds this %)"
          placeholderTextColor="rgba(255,255,255,0.3)"
          value={dailyLossLimit}
          onChangeText={setDailyLossLimit}
          keyboardType="decimal-pad"
        />

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
          onPress={() => navigation.navigate('TrainingUpload', editBotId ? {botId: editBotId} : undefined)}>
          <BrainIcon />
          <View style={{flex: 1, marginLeft: 12}}>
            <Text style={styles.trainBtnTitle}>Train with Data</Text>
            <Text style={styles.trainBtnSub}>Upload datasets to improve AI accuracy</Text>
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
