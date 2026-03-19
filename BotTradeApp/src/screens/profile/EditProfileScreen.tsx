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
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../types';
import {useAuth} from '../../context/AuthContext';
import {useToast} from '../../context/ToastContext';
import {userApi} from '../../services/user';
import Svg, {Path} from 'react-native-svg';

type Nav = NativeStackNavigationProp<RootStackParamList>;

// ─── Icons ──────────────────────────────────────────────────────────────────────

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

// ─── Constants ──────────────────────────────────────────────────────────────────

const INVESTMENT_GOALS = [
  'Passive Income',
  'Active Trading',
  'Long-term Growth',
  'Portfolio Diversification',
];

const RISK_LEVELS = [
  {label: 'Conservative', min: 0, max: 33},
  {label: 'Moderate', min: 34, max: 66},
  {label: 'Aggressive', min: 67, max: 100},
];

const AVATAR_COLORS = [
  '#10B981',
  '#0D7FF2',
  '#8B5CF6',
  '#F59E0B',
  '#EF4444',
  '#EC4899',
];

// ─── Screen ─────────────────────────────────────────────────────────────────────

export default function EditProfileScreen() {
  const navigation = useNavigation<Nav>();
  const {user} = useAuth();
  const {alert: showAlert} = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [investmentGoal, setInvestmentGoal] = useState('');
  const [riskTolerance, setRiskTolerance] = useState(50);
  const [avatarColor, setAvatarColor] = useState('#10B981');
  const [showGoalPicker, setShowGoalPicker] = useState(false);

  useEffect(() => {
    userApi
      .getProfile()
      .then(profile => {
        setName(profile.name || '');
        setInvestmentGoal(profile.investmentGoal || '');
        setRiskTolerance(profile.riskTolerance ?? 50);
        setAvatarColor(profile.avatarColor || '#10B981');
      })
      .catch(() => {
        showAlert('Error', 'Failed to load profile data');
      })
      .finally(() => setLoading(false));
  }, []);

  const getRiskLabel = (value: number) => {
    if (value <= 33) return 'Conservative';
    if (value <= 66) return 'Moderate';
    return 'Aggressive';
  };

  const getRiskIndex = (value: number) => {
    if (value <= 33) return 0;
    if (value <= 66) return 1;
    return 2;
  };

  const handleRiskSelect = (index: number) => {
    const values = [15, 50, 85];
    setRiskTolerance(values[index]);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      showAlert('Missing Field', 'Name is required');
      return;
    }

    setSaving(true);
    try {
      await userApi.updateProfile({
        name: name.trim(),
        investment_goal: investmentGoal || undefined,
        risk_tolerance: riskTolerance,
        avatar_color: avatarColor,
      });
      showAlert('Profile Updated', 'Your profile has been saved successfully');
      navigation.goBack();
    } catch (err: any) {
      showAlert('Error', err?.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <BackArrow />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Profile</Text>
          <View style={{width: 36}} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#10B981" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <BackArrow />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <View style={{width: 36}} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        {/* Avatar Preview */}
        <View style={styles.avatarSection}>
          <View style={[styles.avatarCircle, {backgroundColor: avatarColor}]}>
            <Text style={styles.avatarInitials}>
              {name
                .split(' ')
                .map(w => w[0])
                .join('')
                .toUpperCase()
                .slice(0, 2) || '?'}
            </Text>
          </View>
        </View>

        {/* Name */}
        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor="rgba(255,255,255,0.25)"
          autoCapitalize="words"
        />

        {/* Investment Goal */}
        <Text style={styles.label}>Investment Goal</Text>
        <TouchableOpacity
          style={styles.input}
          activeOpacity={0.7}
          onPress={() => setShowGoalPicker(!showGoalPicker)}>
          <Text
            style={[
              styles.inputText,
              !investmentGoal && {color: 'rgba(255,255,255,0.25)'},
            ]}>
            {investmentGoal || 'Select investment goal'}
          </Text>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Path
              d={showGoalPicker ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'}
              stroke="rgba(255,255,255,0.4)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </TouchableOpacity>

        {showGoalPicker && (
          <View style={styles.pickerContainer}>
            {INVESTMENT_GOALS.map(goal => (
              <TouchableOpacity
                key={goal}
                style={[
                  styles.pickerOption,
                  investmentGoal === goal && styles.pickerOptionActive,
                ]}
                activeOpacity={0.7}
                onPress={() => {
                  setInvestmentGoal(goal);
                  setShowGoalPicker(false);
                }}>
                <Text
                  style={[
                    styles.pickerOptionText,
                    investmentGoal === goal && styles.pickerOptionTextActive,
                  ]}>
                  {goal}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Risk Tolerance */}
        <Text style={styles.label}>Risk Tolerance</Text>
        <View style={styles.segmentedContainer}>
          {RISK_LEVELS.map((level, index) => (
            <TouchableOpacity
              key={level.label}
              style={[
                styles.segmentedButton,
                index === 0 && styles.segmentedButtonFirst,
                index === RISK_LEVELS.length - 1 && styles.segmentedButtonLast,
                getRiskIndex(riskTolerance) === index &&
                  styles.segmentedButtonActive,
              ]}
              activeOpacity={0.7}
              onPress={() => handleRiskSelect(index)}>
              <Text
                style={[
                  styles.segmentedText,
                  getRiskIndex(riskTolerance) === index &&
                    styles.segmentedTextActive,
                ]}>
                {level.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.riskValue}>
          Risk Score: {riskTolerance} / 100 ({getRiskLabel(riskTolerance)})
        </Text>

        {/* Avatar Color */}
        <Text style={styles.label}>Avatar Color</Text>
        <View style={styles.colorRow}>
          {AVATAR_COLORS.map(color => (
            <TouchableOpacity
              key={color}
              style={[
                styles.colorCircle,
                {backgroundColor: color},
                avatarColor === color && styles.colorCircleSelected,
              ]}
              activeOpacity={0.7}
              onPress={() => setAvatarColor(color)}>
              {avatarColor === color && (
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                  <Path
                    d="M5 12l5 5L20 7"
                    stroke="#FFFFFF"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          activeOpacity={0.7}
          onPress={handleSave}
          disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>Save Changes</Text>
          )}
        </TouchableOpacity>

        <View style={{height: 40}} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E14',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 54,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Inter-Bold',
    fontSize: 17,
    color: '#FFFFFF',
  },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },

  // Avatar
  avatarSection: {
    alignItems: 'center',
    marginBottom: 28,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontFamily: 'Inter-Bold',
    fontSize: 28,
    color: '#FFFFFF',
  },

  // Labels & Inputs
  label: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 8,
    marginLeft: 2,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    color: '#FFFFFF',
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inputText: {
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    color: '#FFFFFF',
    flex: 1,
  },

  // Goal Picker
  pickerContainer: {
    backgroundColor: '#161B22',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 20,
    marginTop: -12,
    overflow: 'hidden',
  },
  pickerOption: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  pickerOptionActive: {
    backgroundColor: 'rgba(16,185,129,0.1)',
  },
  pickerOptionText: {
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    color: 'rgba(255,255,255,0.6)',
  },
  pickerOptionTextActive: {
    color: '#10B981',
    fontFamily: 'Inter-SemiBold',
  },

  // Segmented Control (Risk Tolerance)
  segmentedContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 8,
    overflow: 'hidden',
  },
  segmentedButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.06)',
  },
  segmentedButtonFirst: {
    borderTopLeftRadius: 11,
    borderBottomLeftRadius: 11,
  },
  segmentedButtonLast: {
    borderTopRightRadius: 11,
    borderBottomRightRadius: 11,
    borderRightWidth: 0,
  },
  segmentedButtonActive: {
    backgroundColor: '#10B981',
  },
  segmentedText: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: 'rgba(255,255,255,0.45)',
  },
  segmentedTextActive: {
    color: '#FFFFFF',
    fontFamily: 'Inter-SemiBold',
  },
  riskValue: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    marginBottom: 20,
    marginLeft: 2,
  },

  // Avatar Color
  colorRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 32,
  },
  colorCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorCircleSelected: {
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },

  // Save Button
  saveButton: {
    backgroundColor: '#10B981',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontFamily: 'Inter-Bold',
    fontSize: 16,
    color: '#FFFFFF',
  },
});
