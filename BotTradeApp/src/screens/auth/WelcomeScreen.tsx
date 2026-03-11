import React, {useEffect, useCallback} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, Dimensions, Image} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import {AuthStackParamList} from '../../types';

const {width} = Dimensions.get('window');

type Props = NativeStackScreenProps<AuthStackParamList, 'Welcome'>;


export default function WelcomeScreen({navigation}: Props) {
  const glowOpacity = useSharedValue(0.6);
  const glowScale = useSharedValue(1);

  useEffect(() => {
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(1.0, {duration: 2000, easing: Easing.inOut(Easing.sin)}),
        withTiming(0.6, {duration: 2000, easing: Easing.inOut(Easing.sin)}),
      ),
      -1,
      false,
    );
    glowScale.value = withRepeat(
      withSequence(
        withTiming(1.05, {duration: 2200, easing: Easing.inOut(Easing.sin)}),
        withTiming(0.95, {duration: 2200, easing: Easing.inOut(Easing.sin)}),
      ),
      -1,
      false,
    );
  }, [glowOpacity, glowScale]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{scale: glowScale.value}],
  }));

  const handleGetStarted = useCallback(() => {
    navigation.navigate('CreateAccount');
  }, [navigation]);

  const handleLogin = useCallback(() => {
    navigation.navigate('Login');
  }, [navigation]);

  return (
    <View style={styles.container}>
      {/* Logo */}
      <View style={styles.logoRow}>
        <Image source={require('../../assets/icons/growth.png')} style={styles.logoIcon} resizeMode="contain" />
        <Text style={styles.logoText}>Trading App</Text>
      </View>

      {/* Hero content */}
      <View style={styles.heroContent}>
        {/* Container image */}
        <Animated.View style={[styles.imageWrapper, glowStyle]}>
          <Image
            source={require('../../assets/images/Container.png')}
            style={styles.containerImage}
            resizeMode="contain"
          />
        </Animated.View>

        <Text style={styles.heroTitle}>AI-Powered Trading</Text>
        <Text style={styles.heroTitleGreen}>for Everyone</Text>

        <Text style={styles.heroSubtitle}>
          Deploy AI trading bots, track performance, and grow your portfolio automatically — 24/7.
        </Text>
      </View>

      {/* CTA */}
      <View style={styles.ctaSection}>
        <TouchableOpacity style={styles.primaryButton} onPress={handleGetStarted} activeOpacity={0.85}>
          <LinearGradient
            colors={['#10B981', '#059669']}
            style={styles.primaryGradient}
            start={{x: 0, y: 0}}
            end={{x: 1, y: 0}}>
            <Text style={styles.primaryButtonText}>Get Started</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={handleLogin} activeOpacity={0.7}>
          <Text style={styles.secondaryButtonText}>Already have an account? <Text style={styles.loginLink}>Log In</Text></Text>
        </TouchableOpacity>
      </View>

      {/* Bottom trust badges */}
      <View style={styles.trustRow}>
        {['256-bit Encrypted', '50K+ Traders', '$2M+ Profits'].map(label => (
          <View key={label} style={styles.trustBadge}>
            <Text style={styles.trustLabel}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1117',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  imageWrapper: {
    alignItems: 'center',
    marginVertical: 20,
  },
  containerImage: {
    width: width - 48,
    height: (width - 48) * 0.6,
  },
  logoIcon: {
    width: 32,
    height: 32,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',        
    gap: 10,
    zIndex: 1,
  },
  logoText: {
    fontFamily: 'Inter-Bold',
    fontSize: 20,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  heroContent: {
    flex: 1,
    justifyContent: 'center',
    zIndex: 1,
  },
  heroTitle: {
    
    fontFamily: 'Inter-Bold',
    fontSize: 40,
    color: '#FFFFFF',
    lineHeight: 48,
    letterSpacing: -1,
    textAlign: 'center',
  },
  heroTitleGreen: {
    fontFamily: 'Inter-Bold',
    fontSize: 40,
    color: '#10B981',
    lineHeight: 48,
    letterSpacing: -1,
    marginBottom: 8,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 16,
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 24,
    marginTop: 8,
    textAlign: 'center',
  },
  ctaSection: {
    gap: 12,
    zIndex: 1,
    marginBottom: 24,
  },
  primaryButton: {
    borderRadius: 14,
    overflow: 'hidden',
    height: 58,
  },
  primaryGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 17,
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  secondaryButtonText: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
  },
  loginLink: {
    fontFamily: 'Inter-SemiBold',
    color: '#10B981',
  },
  trustRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  trustBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  trustLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
  },
});
        