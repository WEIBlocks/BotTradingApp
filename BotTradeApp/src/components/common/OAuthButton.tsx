import React, {useCallback} from 'react';
import {TouchableOpacity, Text, StyleSheet, View} from 'react-native';
import Animated, {useAnimatedStyle, useSharedValue, withSpring} from 'react-native-reanimated';
import Svg, {Path, G} from 'react-native-svg';

interface OAuthButtonProps {
  provider: 'google' | 'apple';
  onPress?: () => void;
}

const AnimatedTouch = Animated.createAnimatedComponent(TouchableOpacity);

function GoogleLogo() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <G>
        <Path d="M12 11v2.9h4.73c-.2 1.23-1.47 3.6-4.73 3.6-2.84 0-5.16-2.36-5.16-5.25S9.16 7 12 7c1.62 0 2.7.69 3.32 1.29l2.26-2.18C16.08 4.72 14.21 3.75 12 3.75 7.58 3.75 4 7.34 4 11.75s3.58 8 8 8c4.62 0 7.69-3.25 7.69-7.82 0-.52-.06-1.04-.16-1.53H12z" fill="#FFFFFF" />
      </G>
    </Svg>
  );
}

function AppleLogo() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path
        d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.4c1.34.07 2.27.78 3.07.8 1.17-.24 2.29-1 3.55-.84 1.51.24 2.65 1 3.4 2.5-3.12 1.87-2.38 5.98.48 7.13-.57 1.48-1.3 2.95-2.5 3.29zM13 3.5c.73-2.31 3.08-3.5 3.08-3.5s.46 2.87-2.43 3.5H13z"
        fill="#FFFFFF"
      />
    </Svg>
  );
}

export default function OAuthButton({provider, onPress}: OAuthButtonProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({transform: [{scale: scale.value}]}));

  const handlePressIn = useCallback(() => { scale.value = withSpring(0.97); }, [scale]);
  const handlePressOut = useCallback(() => { scale.value = withSpring(1); }, [scale]);

  return (
    <AnimatedTouch
      style={[styles.button, animatedStyle]}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}>
      <View style={styles.logoContainer}>
        {provider === 'google' ? <GoogleLogo /> : <AppleLogo />}
      </View>
      <Text style={styles.label}>
        {provider === 'google' ? 'Continue with Google' : 'Continue with Apple'}
      </Text>
    </AnimatedTouch>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1C2333',
    borderRadius: 12,
    height: 52,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 12,
  },
  logoContainer: {marginRight: 10},
  label: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
    color: '#FFFFFF',
  },
});
