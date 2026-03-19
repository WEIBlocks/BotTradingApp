import React, {useState, useCallback, useEffect} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, Keyboard, Image} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {GoogleSignin, statusCodes} from '@react-native-google-signin/google-signin';
import {AuthStackParamList} from '../../types';
import {useAuth} from '../../context/AuthContext';
import {useToast} from '../../context/ToastContext';
import {ApiError} from '../../services/api';
import {authApi} from '../../services/auth';
import {GOOGLE_WEB_CLIENT_ID} from '../../config/google';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import OAuthButton from '../../components/common/OAuthButton';
import Divider from '../../components/common/Divider';
import ChevronLeftIcon from '../../components/icons/ChevronLeftIcon';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export default function LoginScreen({navigation}: Props) {
  const {login, googleSignIn} = useAuth();
  const {alert: showAlert, showConfirm} = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errors, setErrors] = useState<{email?: string; password?: string; general?: string}>({});

  useEffect(() => {
    GoogleSignin.configure({webClientId: GOOGLE_WEB_CLIENT_ID});
  }, []);

  const handleGoogleSignIn = useCallback(async () => {
    setGoogleLoading(true);
    setErrors({});
    try {
      await GoogleSignin.hasPlayServices({showPlayServicesUpdateDialog: true});
      const response = await GoogleSignin.signIn();
      if (response.type === 'cancelled') {
        setGoogleLoading(false);
        return;
      }
      const idToken = response.data?.idToken;
      if (!idToken) {
        setErrors({general: 'Failed to get Google credentials. Please try again.'});
        setGoogleLoading(false);
        return;
      }
      await googleSignIn(idToken);
      // Navigation happens automatically via AuthContext state change
    } catch (err: any) {
      if (err?.code === statusCodes.SIGN_IN_CANCELLED) {
        // User cancelled — no error to show
      } else if (err?.code === statusCodes.IN_PROGRESS) {
        // Already in progress
      } else if (err?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        setErrors({general: 'Google Play Services is not available on this device.'});
      } else if (err instanceof ApiError) {
        setErrors({general: err.message || 'Server error during Google Sign-In.'});
      } else {
        const msg = err?.message || 'Unknown error';
        setErrors({general: `Google Sign-In failed: ${msg}`});
      }
    } finally {
      setGoogleLoading(false);
    }
  }, [googleSignIn]);

  const validate = useCallback((): boolean => {
    const next: typeof errors = {};

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      next.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      next.email = 'Enter a valid email address';
    }

    if (!password) {
      next.password = 'Password is required';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }, [email, password]);

  const handleLogin = useCallback(async () => {
    if (!validate()) return;

    Keyboard.dismiss();
    setLoading(true);
    setErrors({});

    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setErrors({general: 'Invalid email or password'});
        } else if (err.status === 422 && err.details) {
          setErrors({
            email: err.details.email?.[0],
            password: err.details.password?.[0],
          });
        } else if (err.code === 'NETWORK_ERROR' || err.code === 'TIMEOUT') {
          setErrors({general: err.message});
        } else {
          setErrors({general: err.message});
        }
      } else {
        setErrors({general: 'Something went wrong. Please try again.'});
      }
    } finally {
      setLoading(false);
    }
  }, [email, password, validate, login]);

  const clearFieldError = useCallback((field: 'email' | 'password') => {
    setErrors(prev => {
      if (!prev[field] && !prev.general) return prev;
      return {...prev, [field]: undefined, general: undefined};
    });
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeftIcon size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <View style={styles.logoRow}>
          <Image source={require('../../assets/images/logo.jpg')} style={styles.logoIcon} resizeMode="contain" />
          <Text style={styles.logoText}>BotTrade</Text>
        </View>
        <Text style={styles.title}>Welcome Back</Text>
        <Text style={styles.subtitle}>Sign in to your trading account</Text>

        <OAuthButton provider="google" onPress={handleGoogleSignIn} disabled={googleLoading || loading} loading={googleLoading} />
        <OAuthButton provider="apple" onPress={() => showAlert('Coming Soon', 'Apple Sign-In is not yet available on Android.')} disabled={loading || googleLoading} />

        <Divider label="Or sign in with email" />

        {errors.general ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{errors.general}</Text>
          </View>
        ) : null}

        <Input
          label="Email Address"
          placeholder="you@example.com"
          value={email}
          onChangeText={text => {
            setEmail(text);
            clearFieldError('email');
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          error={errors.email}
        />
        <Input
          label="Password"
          placeholder="Enter your password"
          value={password}
          onChangeText={text => {
            setPassword(text);
            clearFieldError('password');
          }}
          secureTextEntry
          error={errors.password}
        />

        <TouchableOpacity
          style={styles.forgotBtn}
          onPress={() => {
            const trimmedEmail = email.trim().toLowerCase();
            if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
              showAlert('Reset Password', 'Please enter your email address above, then tap "Forgot Password?" again.');
              return;
            }
            showConfirm({
              title: 'Reset Password',
              message: `We'll send a password reset link to:\n${trimmedEmail}`,
              confirmText: 'Send Link',
              onConfirm: async () => {
                try {
                  await authApi.requestPasswordReset(trimmedEmail);
                } catch {
                  // Always show success to prevent email enumeration
                }
                showAlert('Email Sent', 'If an account exists with that email, you will receive a password reset link shortly.');
              },
            });
          }}>
          <Text style={styles.forgotText}>Forgot Password?</Text>
        </TouchableOpacity>

        <Button
          title="Log In"
          onPress={handleLogin}
          loading={loading}
          disabled={loading || googleLoading}
          style={styles.loginBtn}
        />

        <TouchableOpacity
          style={styles.signupRow}
          onPress={() => navigation.navigate('CreateAccount')}>
          <Text style={styles.signupText}>
            Don't have an account? <Text style={styles.signupLink}>Create Account</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0F1117'},
  logoRow: {flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20, alignSelf: 'center'},
  logoIcon: {width: 38, height: 38, borderRadius: 10},
  logoText: {fontFamily: 'Inter-Bold', fontSize: 20, color: '#FFFFFF', letterSpacing: -0.3},
  header: {
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40},
  title: {fontFamily: 'Inter-Bold', fontSize: 28, color: '#FFFFFF', marginBottom: 8, letterSpacing: -0.5},
  subtitle: {fontFamily: 'Inter-Regular', fontSize: 15, color: 'rgba(255,255,255,0.5)', marginBottom: 28},
  errorBanner: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    padding: 14,
    marginBottom: 16,
  },
  errorBannerText: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: '#EF4444',
    textAlign: 'center',
  },
  forgotBtn: {alignSelf: 'flex-end', marginBottom: 24, marginTop: -8},
  forgotText: {fontFamily: 'Inter-Medium', fontSize: 13, color: '#10B981'},
  loginBtn: {marginBottom: 16},
  signupRow: {alignItems: 'center', paddingVertical: 8},
  signupText: {fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.5)'},
  signupLink: {fontFamily: 'Inter-SemiBold', color: '#10B981'},
});
