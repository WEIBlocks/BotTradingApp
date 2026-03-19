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
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../types';
import {useToast} from '../../context/ToastContext';
import {authApi} from '../../services/auth';
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

function EyeIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M12 15a3 3 0 100-6 3 3 0 000 6z"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth={1.5}
      />
    </Svg>
  );
}

function EyeOffIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 01-4.24-4.24"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M1 1l22 22"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// ─── Screen ─────────────────────────────────────────────────────────────────────

export default function ChangePasswordScreen() {
  const navigation = useNavigation<Nav>();
  const {alert: showAlert} = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleSave = async () => {
    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      showAlert('Missing Fields', 'All password fields are required');
      return;
    }

    if (newPassword.length < 8) {
      showAlert('Invalid Password', 'New password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      showAlert('Mismatch', 'New password and confirmation do not match');
      return;
    }

    setSaving(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      showAlert('Password Changed', 'Your password has been updated successfully');
      navigation.goBack();
    } catch (err: any) {
      showAlert(
        'Error',
        err?.message || 'Failed to change password. Please check your current password.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <BackArrow />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Change Password</Text>
        <View style={{width: 36}} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        {/* Lock icon header */}
        <View style={styles.iconSection}>
          <View style={styles.iconCircle}>
            <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
              <Path
                d="M5 11h14a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2v-7a2 2 0 012-2zM8 11V7a4 4 0 018 0v4"
                stroke="#10B981"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </View>
          <Text style={styles.iconLabel}>
            Enter your current password and choose a new one
          </Text>
        </View>

        {/* Current Password */}
        <Text style={styles.label}>Current Password</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.inputField}
            value={currentPassword}
            onChangeText={setCurrentPassword}
            placeholder="Enter current password"
            placeholderTextColor="rgba(255,255,255,0.25)"
            secureTextEntry={!showCurrent}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={styles.eyeBtn}
            onPress={() => setShowCurrent(!showCurrent)}
            hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
            {showCurrent ? <EyeOffIcon /> : <EyeIcon />}
          </TouchableOpacity>
        </View>

        {/* New Password */}
        <Text style={styles.label}>New Password</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.inputField}
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="Enter new password"
            placeholderTextColor="rgba(255,255,255,0.25)"
            secureTextEntry={!showNew}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={styles.eyeBtn}
            onPress={() => setShowNew(!showNew)}
            hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
            {showNew ? <EyeOffIcon /> : <EyeIcon />}
          </TouchableOpacity>
        </View>
        {newPassword.length > 0 && newPassword.length < 8 && (
          <Text style={styles.validationHint}>Minimum 8 characters required</Text>
        )}

        {/* Confirm New Password */}
        <Text style={styles.label}>Confirm New Password</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.inputField}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Re-enter new password"
            placeholderTextColor="rgba(255,255,255,0.25)"
            secureTextEntry={!showConfirm}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={styles.eyeBtn}
            onPress={() => setShowConfirm(!showConfirm)}
            hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
            {showConfirm ? <EyeOffIcon /> : <EyeIcon />}
          </TouchableOpacity>
        </View>
        {confirmPassword.length > 0 && newPassword !== confirmPassword && (
          <Text style={styles.validationHint}>Passwords do not match</Text>
        )}

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          activeOpacity={0.7}
          onPress={handleSave}
          disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>Update Password</Text>
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

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },

  // Icon section
  iconSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(16,185,129,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  iconLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
  },

  // Labels & Inputs
  label: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 8,
    marginLeft: 2,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    marginBottom: 20,
    paddingRight: 12,
  },
  inputField: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    color: '#FFFFFF',
  },
  eyeBtn: {
    padding: 4,
  },

  validationHint: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: '#EF4444',
    marginTop: -14,
    marginBottom: 16,
    marginLeft: 4,
  },

  // Save Button
  saveButton: {
    backgroundColor: '#10B981',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
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
