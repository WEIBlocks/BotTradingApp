import React, {useState, useCallback} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {AuthStackParamList} from '../../types';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import OAuthButton from '../../components/common/OAuthButton';
import Divider from '../../components/common/Divider';
import ChevronLeftIcon from '../../components/icons/ChevronLeftIcon';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export default function LoginScreen({navigation}: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = useCallback(() => {
    // Navigate to main app (stub)
    navigation.getParent()?.navigate('Main');
  }, [navigation]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeftIcon size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Welcome Back</Text>
        <Text style={styles.subtitle}>Sign in to your trading account</Text>

        <OAuthButton provider="google" onPress={() => {}} />
        <OAuthButton provider="apple" onPress={() => {}} />

        <Divider label="Or sign in with email" />

        <Input
          label="Email Address"
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Input
          label="Password"
          placeholder="Enter your password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity style={styles.forgotBtn}>
          <Text style={styles.forgotText}>Forgot Password?</Text>
        </TouchableOpacity>

        <Button title="Log In" onPress={handleLogin} style={styles.loginBtn} />

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
  forgotBtn: {alignSelf: 'flex-end', marginBottom: 24, marginTop: -8},
  forgotText: {fontFamily: 'Inter-Medium', fontSize: 13, color: '#10B981'},
  loginBtn: {marginBottom: 16},
  signupRow: {alignItems: 'center', paddingVertical: 8},
  signupText: {fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.5)'},
  signupLink: {fontFamily: 'Inter-SemiBold', color: '#10B981'},
});
