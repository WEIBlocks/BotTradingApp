import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {useNavigation, useRoute, RouteProp} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'BotBuilder'>;

const TRADING_PAIRS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'MATIC/USDT'];
const STRATEGIES = ['Trend Following', 'Scalping', 'Grid', 'Arbitrage', 'DCA'];
const RISK_LEVELS = ['Very Low', 'Low', 'Med', 'High', 'Very High'] as const;

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

  const fromChat = route.params?.fromChat;
  const strategyName = route.params?.strategyName;

  const [botName, setBotName] = useState(strategyName || '');
  const [selectedPairs, setSelectedPairs] = useState<string[]>(['BTC/USDT']);
  const [selectedStrategy, setSelectedStrategy] = useState(
    strategyName && STRATEGIES.includes(strategyName) ? strategyName : '',
  );
  const [riskLevel, setRiskLevel] = useState<string>('Med');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [maxPosition, setMaxPosition] = useState('');
  const [tradingMode, setTradingMode] = useState<'paper' | 'live'>('paper');

  const togglePair = (pair: string) => {
    setSelectedPairs(prev =>
      prev.includes(pair) ? prev.filter(p => p !== pair) : [...prev, pair],
    );
  };

  const handleDeploy = () => {
    Alert.alert('Bot deployed successfully!', undefined, [
      {text: 'OK', onPress: () => navigation.goBack()},
    ]);
  };

  const handleSaveDraft = () => {
    Alert.alert('Draft saved!');
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
        <Text style={styles.headerTitle}>Configure Bot</Text>
        <View style={{width: 22}} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>
        {/* Bot Name */}
        <Text style={styles.label}>BOT NAME</Text>
        <TextInput
          style={styles.textInput}
          placeholder="Enter bot name..."
          placeholderTextColor="rgba(255,255,255,0.3)"
          value={botName}
          onChangeText={setBotName}
        />

        {/* Trading Pairs */}
        <Text style={styles.label}>TRADING PAIRS</Text>
        <View style={styles.chipsRow}>
          {TRADING_PAIRS.map(pair => {
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
          {STRATEGIES.map(strat => {
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
          {RISK_LEVELS.map(level => {
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

        {/* Trading Mode */}
        <Text style={styles.label}>TRADING MODE</Text>
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[
              styles.modeBtn,
              tradingMode === 'paper' && styles.modeBtnSelected,
            ]}
            onPress={() => setTradingMode('paper')}>
            <Text
              style={[
                styles.modeBtnText,
                tradingMode === 'paper' && styles.modeBtnTextSelected,
              ]}>
              Paper Trading
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.modeBtn,
              tradingMode === 'live' && styles.modeBtnSelected,
              tradingMode !== 'live' && styles.modeBtnOutline,
            ]}
            onPress={() => setTradingMode('live')}>
            <Text
              style={[
                styles.modeBtnText,
                tradingMode === 'live' && styles.modeBtnTextSelected,
              ]}>
              Live Trading
            </Text>
          </TouchableOpacity>
        </View>

        {/* Deploy Button */}
        <TouchableOpacity
          style={styles.deployBtn}
          activeOpacity={0.8}
          onPress={handleDeploy}>
          <RocketIcon />
          <Text style={styles.deployBtnText}>Deploy Bot</Text>
        </TouchableOpacity>

        {/* Save Draft */}
        <TouchableOpacity
          style={styles.draftBtn}
          onPress={handleSaveDraft}>
          <Text style={styles.draftBtnText}>Save as Draft</Text>
        </TouchableOpacity>

        <View style={{height: 40}} />
      </ScrollView>
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
  textInput: {
    backgroundColor: '#161B22',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: 'Inter-Regular',
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
