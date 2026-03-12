import React, {useState, useCallback} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import Slider from '@react-native-community/slider';
import LinearGradient from 'react-native-linear-gradient';
import Svg, {Path, Circle, Rect, Line, Polyline} from 'react-native-svg';
import {AuthStackParamList} from '../../types';
import {useAuth} from '../../context/AuthContext';
import ProgressBar from '../../components/common/ProgressBar';
import ChevronLeftIcon from '../../components/icons/ChevronLeftIcon';
import CheckCircleIcon from '../../components/icons/CheckCircleIcon';

type Props = NativeStackScreenProps<AuthStackParamList, 'InvestorQuiz'>;

// Step 1 icons
function IconSellAlert() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="#EF4444" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="12" y1="9" x2="12" y2="13" stroke="#EF4444" strokeWidth={1.6} strokeLinecap="round" />
      <Line x1="12" y1="17" x2="12.01" y2="17" stroke="#EF4444" strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}
function IconHoldShield() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="#F59E0B" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M9 12l2 2 4-4" stroke="#F59E0B" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
function IconBuyDip() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Polyline points="23 6 13.5 15.5 8.5 10.5 1 18" stroke="#10B981" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <Polyline points="17 6 23 6 23 12" stroke="#10B981" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Step 2 icons
function IconPreserve() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="#60A5FA" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M9 12l2 2 4-4" stroke="#60A5FA" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
function IconIncome() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" stroke="#FBBF24" strokeWidth={1.6} />
      <Path d="M14.5 9.5A2.5 2.5 0 0 0 12 8h-.5a2 2 0 1 0 0 4H12a2 2 0 1 1 0 4h-.5A2.5 2.5 0 0 1 9 13.5" stroke="#FBBF24" strokeWidth={1.5} strokeLinecap="round" />
      <Line x1="12" y1="6" x2="12" y2="7.5" stroke="#FBBF24" strokeWidth={1.5} strokeLinecap="round" />
      <Line x1="12" y1="16.5" x2="12" y2="18" stroke="#FBBF24" strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}
function IconMaxGrowth() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2L8.5 8.5H2L7 13l-2 7 7-4 7 4-2-7 5-4.5h-6.5L12 2z" stroke="#10B981" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Step 3 icons
function IconShortTerm() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" stroke="#F472B6" strokeWidth={1.6} />
      <Path d="M12 7v5l3 3" stroke="#F472B6" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
function IconMediumTerm() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="4" width="18" height="16" rx="2" stroke="#818CF8" strokeWidth={1.6} />
      <Path d="M8 2v3M16 2v3M3 10h18" stroke="#818CF8" strokeWidth={1.6} strokeLinecap="round" />
      <Path d="M8 15l2.5 2.5L16 12" stroke="#818CF8" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
function IconLongTerm() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3a7 7 0 0 1 0 14" stroke="#10B981" strokeWidth={1.6} strokeLinecap="round" />
      <Path d="M12 17a7 7 0 0 1 0-14" stroke="#10B981" strokeWidth={1.6} strokeLinecap="round" strokeDasharray="2.5 2" />
      <Path d="M12 7v4l3 1.5" stroke="#10B981" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M5 20c2-1.5 4.5-2 7-2s5 .5 7 2" stroke="#10B981" strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

type StepOption = {title: string; subtitle: string; Icon: React.FC; iconBg: string};

const STEPS: {title: string; options: StepOption[]}[] = [
  {
    title: 'How would you react if your portfolio dropped 20% in one month?',
    options: [
      {title: 'Sell everything immediately', subtitle: 'I cannot handle significant losses', Icon: IconSellAlert, iconBg: 'rgba(239,68,68,0.12)'},
      {title: 'Hold and wait it out', subtitle: 'I believe it will recover eventually', Icon: IconHoldShield, iconBg: 'rgba(245,158,11,0.12)'},
      {title: "Buy more aggressively", subtitle: "It's a discount buying opportunity", Icon: IconBuyDip, iconBg: 'rgba(16,185,129,0.12)'},
    ],
  },
  {
    title: 'What is your primary investment goal?',
    options: [
      {title: 'Capital Preservation', subtitle: 'Protect what I have with modest growth', Icon: IconPreserve, iconBg: 'rgba(96,165,250,0.12)'},
      {title: 'Steady Income', subtitle: 'Regular passive income from my portfolio', Icon: IconIncome, iconBg: 'rgba(251,191,36,0.12)'},
      {title: 'Maximum Growth', subtitle: 'Aggressive growth over the long term', Icon: IconMaxGrowth, iconBg: 'rgba(16,185,129,0.12)'},
    ],
  },
  {
    title: 'What is your investment time horizon?',
    options: [
      {title: 'Short Term (< 1 year)', subtitle: 'I may need the funds soon', Icon: IconShortTerm, iconBg: 'rgba(244,114,182,0.12)'},
      {title: 'Medium Term (1-5 years)', subtitle: 'Balanced approach to grow wealth', Icon: IconMediumTerm, iconBg: 'rgba(129,140,248,0.12)'},
      {title: "Long Term (5+ years)", subtitle: "I'm building generational wealth", Icon: IconLongTerm, iconBg: 'rgba(16,185,129,0.12)'},
    ],
  },
];

const GOALS = ['House', 'Retirement', 'Wealth', 'Education', 'Business'];

export default function InvestorQuizScreen({navigation}: Props) {
  const {saveQuizResults} = useAuth();

  const [step, setStep] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState<number[]>([]);
  const [riskTolerance, setRiskTolerance] = useState(50);
  const [selectedGoal, setSelectedGoal] = useState('Wealth');
  const [saving, setSaving] = useState(false);

  const isLastStep = step === STEPS.length - 1;
  const isCurrentStepAnswered = selectedOptions[step] !== undefined;

  const handleOptionSelect = useCallback((optionIndex: number) => {
    setSelectedOptions(prev => {
      const next = [...prev];
      next[step] = optionIndex;
      return next;
    });
  }, [step]);

  const handleNext = useCallback(async () => {
    if (isLastStep) {
      // Map step 2 (time horizon) selection to a label
      const timeHorizons = ['short', 'medium', 'long'];
      const timeHorizon = timeHorizons[selectedOptions[2]] || 'medium';

      setSaving(true);
      try {
        await saveQuizResults({
          riskTolerance,
          investmentGoal: selectedGoal,
          timeHorizon,
        });
      } catch {
        // Non-critical — quiz data is nice-to-have, don't block onboarding
      } finally {
        setSaving(false);
      }
      navigation.navigate('ConnectCapital');
    } else {
      setStep(s => s + 1);
    }
  }, [isLastStep, navigation, riskTolerance, selectedGoal, selectedOptions, saveQuizResults]);

  const handleBack = useCallback(() => {
    if (step === 0) navigation.goBack();
    else setStep(s => s - 1);
  }, [step, navigation]);

  const currentStep = STEPS[step];
  const progress = (step + 1) / STEPS.length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
          <ChevronLeftIcon size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.progressInfo}>
          <Text style={styles.stepLabel}>STEP {step + 1} OF {STEPS.length}</Text>
          <Text style={styles.stepPercent}>{Math.round(progress * 100)}% Complete</Text>
        </View>
      </View>
      <ProgressBar progress={progress} style={styles.progressBar} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.question}>{currentStep.title}</Text>

        {currentStep.options.map((option, i) => {
          const isSelected = selectedOptions[step] === i;
          const {Icon, iconBg} = option;
          return (
            <TouchableOpacity
              key={i}
              style={[styles.optionCard, isSelected && styles.optionCardSelected]}
              onPress={() => handleOptionSelect(i)}
              activeOpacity={0.8}>
              <View style={styles.optionLeft}>
                <View style={[styles.optionIconWrap, {backgroundColor: iconBg}]}>
                  <Icon />
                </View>
                <View style={styles.optionText}>
                  <Text style={[styles.optionTitle, isSelected && styles.optionTitleSelected]}>
                    {option.title}
                  </Text>
                  <Text style={styles.optionSubtitle}>{option.subtitle}</Text>
                </View>
              </View>
              {isSelected && <CheckCircleIcon size={20} color="#10B981" />}
            </TouchableOpacity>
          );
        })}

        {step === 0 && (
          <View style={styles.sliderSection}>
            <Text style={styles.sectionLabel}>RISK TOLERANCE</Text>
            <View style={styles.sliderRow}>
              <Text style={styles.sliderMin}>Conservative</Text>
              <Text style={styles.sliderValue}>{riskTolerance}%</Text>
              <Text style={styles.sliderMax}>Aggressive</Text>
            </View>
            <View style={styles.sliderTrackWrapper}>
              <LinearGradient
                colors={['#10B981', '#F59E0B', '#EF4444']}
                style={styles.sliderTrack}
                start={{x: 0, y: 0}}
                end={{x: 1, y: 0}}
              />
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={100}
                value={riskTolerance}
                onValueChange={v => setRiskTolerance(Math.round(v))}
                minimumTrackTintColor="transparent"
                maximumTrackTintColor="transparent"
                thumbTintColor="#FFFFFF"
                thumbImage={require('../../assets/images/slider_thumb.png')}
              />
            </View>
          </View>
        )}

        {step === 1 && (
          <View style={styles.goalsSection}>
            <Text style={styles.sectionLabel}>INVESTMENT GOAL</Text>
            <View style={styles.goalsRow}>
              {GOALS.map(goal => (
                <TouchableOpacity
                  key={goal}
                  style={[styles.goalChip, selectedGoal === goal && styles.goalChipActive]}
                  onPress={() => setSelectedGoal(goal)}
                  activeOpacity={0.7}>
                  <Text style={[styles.goalLabel, selectedGoal === goal && styles.goalLabelActive]}>
                    {goal}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.nextBtn, !isCurrentStepAnswered && styles.nextBtnDisabled]}
          onPress={handleNext}
          disabled={!isCurrentStepAnswered || saving}
          activeOpacity={0.85}>
          <LinearGradient
            colors={isCurrentStepAnswered ? ['#10B981', '#059669'] : ['#2D3748', '#2D3748']}
            style={styles.nextGradient}
            start={{x: 0, y: 0}}
            end={{x: 1, y: 0}}>
            <Text style={styles.nextText}>{saving ? 'Saving...' : isLastStep ? 'Finish' : 'Next Question'}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0F1117'},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 12,
    gap: 12,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  progressInfo: {flex: 1},
  stepLabel: {fontFamily: 'Inter-Medium', fontSize: 10, letterSpacing: 1, color: '#10B981', textTransform: 'uppercase'},
  stepPercent: {fontFamily: 'Inter-Medium', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2},
  progressBar: {marginHorizontal: 20, marginBottom: 4},
  scroll: {paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20},
  question: {fontFamily: 'Inter-Bold', fontSize: 22, color: '#FFFFFF', lineHeight: 30, marginBottom: 20, letterSpacing: -0.3},
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#161B22',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  optionCardSelected: {borderColor: '#10B981', backgroundColor: 'rgba(16,185,129,0.08)'},
  optionLeft: {flexDirection: 'row', alignItems: 'center', flex: 1},
  optionIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  optionText: {flex: 1},
  optionTitle: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF'},
  optionTitleSelected: {color: '#10B981'},
  optionSubtitle: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2},
  sliderSection: {marginTop: 20},
  sectionLabel: {fontFamily: 'Inter-Medium', fontSize: 10, letterSpacing: 1, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 12},
  sliderRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8},
  sliderMin: {fontFamily: 'Inter-Medium', fontSize: 11, color: '#10B981'},
  sliderMax: {fontFamily: 'Inter-Medium', fontSize: 11, color: '#EF4444'},
  sliderValue: {fontFamily: 'Inter-Bold', fontSize: 16, color: '#FFFFFF'},
  sliderTrackWrapper: {position: 'relative', height: 56, justifyContent: 'center'},
  sliderTrack: {position: 'absolute', left: 10, right: 10, height: 6, borderRadius: 6},
  slider: {position: 'absolute', left: 0, right: 0, height: 56},
  goalsSection: {marginTop: 20},
  goalsRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  goalChip: {
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  goalChipActive: {backgroundColor: 'rgba(16,185,129,0.15)', borderColor: 'rgba(16,185,129,0.4)'},
  goalLabel: {fontFamily: 'Inter-Medium', fontSize: 13, color: 'rgba(255,255,255,0.5)'},
  goalLabelActive: {color: '#10B981'},
  footer: {padding: 20, paddingBottom: 32},
  nextBtn: {borderRadius: 14, overflow: 'hidden', height: 56},
  nextBtnDisabled: {opacity: 0.5},
  nextGradient: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  nextText: {fontFamily: 'Inter-SemiBold', fontSize: 16, color: '#FFFFFF'},
});
