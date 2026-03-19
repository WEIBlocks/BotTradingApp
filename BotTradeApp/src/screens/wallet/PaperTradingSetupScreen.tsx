import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../types';
import {useToast} from '../../context/ToastContext';
import ChevronLeftIcon from '../../components/icons/ChevronLeftIcon';
import CheckCircleIcon from '../../components/icons/CheckCircleIcon';
import InfoIcon from '../../components/icons/InfoIcon';
import {botsService} from '../../services/bots';

type Props = NativeStackScreenProps<RootStackParamList, 'PaperTradingSetup'>;

const BALANCE_PRESETS = [5000, 10000, 25000, 50000, 100000];
const DURATION_OPTIONS = [
  {label: '7 Days', value: 7},
  {label: '14 Days', value: 14},
  {label: '30 Days', value: 30},
  {label: '60 Days', value: 60},
  {label: '90 Days', value: 90},
];

export default function PaperTradingSetupScreen({navigation}: Props) {
  const {alert: showAlert} = useToast();
  const [selectedBalance, setSelectedBalance] = useState(10000);
  const [customBalance, setCustomBalance] = useState('');
  const [selectedDuration, setSelectedDuration] = useState(30);
  const [enableRiskLimits, setEnableRiskLimits] = useState(true);
  const [enableRealistic, setEnableRealistic] = useState(true);
  const [step, setStep] = useState<'setup' | 'confirm'>('setup');
  const [submitting, setSubmitting] = useState(false);

  const btnScale = useSharedValue(1);
  const btnStyle = useAnimatedStyle(() => ({
    transform: [{scale: btnScale.value}],
  }));

  const displayBalance = customBalance
    ? parseInt(customBalance.replace(/,/g, ''), 10) || selectedBalance
    : selectedBalance;

  const handleStart = async () => {
    if (displayBalance < 100) {
      showAlert('Invalid Amount', 'Starting balance must be at least $100.');
      return;
    }
    if (displayBalance > 10000000) {
      showAlert('Invalid Amount', 'Starting balance cannot exceed $10,000,000.');
      return;
    }
    btnScale.value = withSpring(0.96, {}, () => {
      btnScale.value = withSpring(1);
    });
    setSubmitting(true);
    try {
      await botsService.setupPaperTrading({
        botId: 'paper-default',
        virtualBalance: displayBalance,
        durationDays: selectedDuration,
      });
      setStep('confirm');
    } catch (e: any) {
      showAlert('Setup Failed', e?.message || 'Could not start paper trading.');
    } finally {
      setSubmitting(false);
    }
  };

  if (step === 'confirm') {
    return (
      <View style={styles.container}>
        <View style={styles.confirmContainer}>
          <View style={styles.confirmIconCircle}>
            <CheckCircleIcon size={48} color="#10B981" />
          </View>
          <Text style={styles.confirmTitle}>Paper Trading Active!</Text>
          <Text style={styles.confirmSubtitle}>
            Your virtual portfolio of{' '}
            <Text style={styles.confirmHighlight}>
              ${displayBalance.toLocaleString()}
            </Text>{' '}
            is ready. Trade risk-free for{' '}
            <Text style={styles.confirmHighlight}>{selectedDuration} days</Text>.
          </Text>

          <View style={styles.confirmStats}>
            <ConfirmStat label="Virtual Balance" value={`$${displayBalance.toLocaleString()}`} />
            <ConfirmStat label="Duration" value={`${selectedDuration} Days`} />
            <ConfirmStat label="Risk Limits" value={enableRiskLimits ? 'Enabled' : 'Disabled'} />
            <ConfirmStat label="Realistic Fees" value={enableRealistic ? 'On' : 'Off'} />
          </View>

          <View style={styles.confirmActions}>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => navigation.navigate('Main')}>
              <Text style={styles.primaryBtnText}>Start Trading</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.ghostBtn}
              onPress={() => setStep('setup')}>
              <Text style={styles.ghostBtnText}>Edit Settings</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <ChevronLeftIcon size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Paper Trading Setup</Text>
        <View style={{width: 40}} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        {/* Info banner */}
        <View style={styles.infoBanner}>
          <InfoIcon size={18} color="#0D7FF2" />
          <Text style={styles.infoBannerText}>
            Paper trading uses virtual money — no real funds at risk. Perfect
            for testing bots before going live.
          </Text>
        </View>

        {/* Virtual balance */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>VIRTUAL STARTING BALANCE</Text>
          <View style={styles.presetGrid}>
            {BALANCE_PRESETS.map(amount => (
              <TouchableOpacity
                key={amount}
                style={[
                  styles.presetChip,
                  selectedBalance === amount &&
                    !customBalance &&
                    styles.presetChipActive,
                ]}
                onPress={() => {
                  setSelectedBalance(amount);
                  setCustomBalance('');
                }}>
                <Text
                  style={[
                    styles.presetChipText,
                    selectedBalance === amount &&
                      !customBalance &&
                      styles.presetChipTextActive,
                  ]}>
                  ${(amount / 1000).toFixed(0)}K
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.customLabel}>Or enter a custom amount:</Text>
          <View style={styles.customInputWrapper}>
            <Text style={styles.currencyPrefix}>$</Text>
            <TextInput
              style={styles.customInput}
              value={customBalance}
              onChangeText={val => {
                setCustomBalance(val.replace(/[^0-9]/g, ''));
              }}
              placeholder="Custom amount..."
              placeholderTextColor="rgba(255,255,255,0.2)"
              keyboardType="numeric"
              returnKeyType="done"
            />
          </View>
          <Text style={styles.balanceDisplay}>
            Selected:{' '}
            <Text style={styles.balanceHighlight}>
              ${displayBalance.toLocaleString()}
            </Text>
          </Text>
        </View>

        {/* Duration */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SIMULATION DURATION</Text>
          <View style={styles.durationGrid}>
            {DURATION_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.durationChip,
                  selectedDuration === opt.value && styles.durationChipActive,
                ]}
                onPress={() => setSelectedDuration(opt.value)}>
                <Text
                  style={[
                    styles.durationChipText,
                    selectedDuration === opt.value &&
                      styles.durationChipTextActive,
                  ]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Advanced options */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SIMULATION OPTIONS</Text>
          <View style={styles.optionsCard}>
            <OptionRow
              label="Risk Limit Enforcement"
              description="Apply real brokerage position limits"
              active={enableRiskLimits}
              onToggle={() => setEnableRiskLimits(v => !v)}
            />
            <View style={styles.optionDivider} />
            <OptionRow
              label="Realistic Fees & Slippage"
              description="Simulate market spread and commission"
              active={enableRealistic}
              onToggle={() => setEnableRealistic(v => !v)}
            />
          </View>
        </View>

        {/* Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Session Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryKey}>Starting Balance</Text>
            <Text style={styles.summaryValue}>${displayBalance.toLocaleString()}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryKey}>Duration</Text>
            <Text style={styles.summaryValue}>{selectedDuration} Days</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryKey}>Risk Limits</Text>
            <Text style={[styles.summaryValue, {color: enableRiskLimits ? '#10B981' : '#EF4444'}]}>
              {enableRiskLimits ? 'Active' : 'Disabled'}
            </Text>
          </View>
          <View style={[styles.summaryRow, {borderBottomWidth: 0}]}>
            <Text style={styles.summaryKey}>Realistic Simulation</Text>
            <Text style={[styles.summaryValue, {color: enableRealistic ? '#10B981' : 'rgba(255,255,255,0.4)'}]}>
              {enableRealistic ? 'Enabled' : 'Disabled'}
            </Text>
          </View>
        </View>

        {/* CTA */}
        <Animated.View style={btnStyle}>
          <TouchableOpacity style={styles.startBtn} onPress={handleStart} disabled={submitting}>
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.startBtnText}>Start Paper Trading</Text>
            )}
          </TouchableOpacity>
        </Animated.View>
        <Text style={styles.disclaimer}>
          Paper trading results do not guarantee future live performance.
        </Text>
      </ScrollView>
    </View>
  );
}

function OptionRow({
  label,
  description,
  active,
  onToggle,
}: {
  label: string;
  description: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.optionRow}
      onPress={onToggle}
      activeOpacity={0.7}>
      <View style={styles.optionLeft}>
        <Text style={styles.optionLabel}>{label}</Text>
        <Text style={styles.optionDesc}>{description}</Text>
      </View>
      <View style={[styles.togglePill, active ? styles.togglePillActive : styles.togglePillInactive]}>
        <View style={[styles.toggleThumb, active ? styles.toggleThumbRight : styles.toggleThumbLeft]} />
      </View>
    </TouchableOpacity>
  );
}

function ConfirmStat({label, value}: {label: string; value: string}) {
  return (
    <View style={styles.confirmStat}>
      <Text style={styles.confirmStatLabel}>{label}</Text>
      <Text style={styles.confirmStatValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0F1117'},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {fontFamily: 'Inter-Bold', fontSize: 17, color: '#FFFFFF'},
  scroll: {paddingHorizontal: 20, paddingBottom: 48},
  // Info banner
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: 'rgba(13,127,242,0.08)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(13,127,242,0.2)',
    marginBottom: 24,
  },
  infoBannerText: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 19,
  },
  // Sections
  section: {marginBottom: 24},
  sectionLabel: {
    fontFamily: 'Inter-Bold',
    fontSize: 10,
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  // Preset grid
  presetGrid: {flexDirection: 'row', gap: 8, flexWrap: 'wrap'},
  presetChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  presetChipActive: {
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderColor: '#10B981',
  },
  presetChipText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
  },
  presetChipTextActive: {color: '#10B981'},
  customLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 14,
    marginBottom: 8,
  },
  customInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    height: 50,
  },
  currencyPrefix: {
    fontFamily: 'Inter-Bold',
    fontSize: 18,
    color: 'rgba(255,255,255,0.4)',
    marginRight: 8,
  },
  customInput: {
    flex: 1,
    fontFamily: 'Inter-SemiBold',
    fontSize: 18,
    color: '#FFFFFF',
    paddingVertical: 0,
  },
  balanceDisplay: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 8,
  },
  balanceHighlight: {color: '#10B981', fontFamily: 'Inter-SemiBold'},
  // Duration
  durationGrid: {flexDirection: 'row', gap: 8, flexWrap: 'wrap'},
  durationChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  durationChipActive: {
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderColor: '#10B981',
  },
  durationChipText: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  durationChipTextActive: {color: '#10B981', fontFamily: 'Inter-SemiBold'},
  // Options
  optionsCard: {
    backgroundColor: '#161B22',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  optionLeft: {flex: 1, paddingRight: 16},
  optionLabel: {fontFamily: 'Inter-Medium', fontSize: 14, color: '#FFFFFF'},
  optionDesc: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 2,
  },
  optionDivider: {height: 1, backgroundColor: 'rgba(255,255,255,0.04)', marginHorizontal: 16},
  togglePill: {
    width: 44,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  togglePillActive: {backgroundColor: 'rgba(16,185,129,0.4)'},
  togglePillInactive: {backgroundColor: 'rgba(255,255,255,0.1)'},
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  toggleThumbRight: {backgroundColor: '#10B981', alignSelf: 'flex-end'},
  toggleThumbLeft: {backgroundColor: 'rgba(255,255,255,0.4)', alignSelf: 'flex-start'},
  // Summary
  summaryCard: {
    backgroundColor: '#161B22',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 16,
    marginBottom: 20,
  },
  summaryTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  summaryKey: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
  },
  summaryValue: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#FFFFFF'},
  // Start button
  startBtn: {
    height: 58,
    borderRadius: 18,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10B981',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  startBtnText: {
    fontFamily: 'Inter-Bold',
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  disclaimer: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.2)',
    textAlign: 'center',
    marginTop: 12,
  },
  // Confirm state
  confirmContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  confirmIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(16,185,129,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  confirmTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: 26,
    color: '#FFFFFF',
    marginBottom: 12,
    textAlign: 'center',
  },
  confirmSubtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  confirmHighlight: {color: '#10B981', fontFamily: 'Inter-SemiBold'},
  confirmStats: {
    width: '100%',
    backgroundColor: '#161B22',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 16,
    marginBottom: 28,
    gap: 12,
  },
  confirmStat: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  confirmStatLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
  },
  confirmStatValue: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#FFFFFF'},
  confirmActions: {width: '100%', gap: 12},
  primaryBtn: {
    height: 56,
    borderRadius: 16,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {fontFamily: 'Inter-Bold', fontSize: 16, color: '#FFFFFF'},
  ghostBtn: {
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
  },
});
