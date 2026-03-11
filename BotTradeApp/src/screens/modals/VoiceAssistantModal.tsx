import React, {useEffect} from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, withDelay,
} from 'react-native-reanimated';
import {RootStackParamList} from '../../types';
import XIcon from '../../components/icons/XIcon';

type Props = NativeStackScreenProps<RootStackParamList, 'VoiceAssistant'>;

const SUGGESTIONS = [
  {icon: '⏸', text: 'Pause BTC bot'},
  {icon: '💰', text: 'Total profit today?'},
  {icon: '📈', text: 'Top performing bot'},
  {icon: '💼', text: 'Portfolio balance'},
];

const BAR_HEIGHTS = [24, 36, 52, 44, 60, 44, 32, 48, 36, 24];
const DELAYS = [0, 80, 160, 240, 320, 400, 320, 240, 160, 80];

function WaveformBar({delay, height}: {delay: number; height: number}) {
  const h = useSharedValue(8);

  useEffect(() => {
    h.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(height, {duration: 400}),
          withTiming(8, {duration: 400}),
        ),
        -1,
        false,
      ),
    );
  }, [h, delay, height]);

  const style = useAnimatedStyle(() => ({height: h.value}));

  return <Animated.View style={[styles.waveBar, style]} />;
}

export default function VoiceAssistantModal({navigation}: Props) {
  return (
    <View style={styles.container}>
      {/* Close button */}
      <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
        <XIcon size={20} color="rgba(255,255,255,0.7)" />
      </TouchableOpacity>

      {/* Transcript */}
      <View style={styles.transcriptSection}>
        <Text style={styles.transcript}>"I want to see my top performing bot..."</Text>
      </View>

      {/* Waveform */}
      <View style={styles.waveformContainer}>
        {BAR_HEIGHTS.map((h, i) => (
          <WaveformBar key={i} delay={DELAYS[i]} height={h} />
        ))}
      </View>

      {/* Listening label */}
      <Text style={styles.listeningText}>LISTENING</Text>

      {/* Suggestions */}
      <View style={styles.suggestionsContainer}>
        {SUGGESTIONS.map(s => (
          <TouchableOpacity key={s.text} style={styles.suggestionPill} activeOpacity={0.7}>
            <Text style={styles.suggestionIcon}>{s.icon}</Text>
            <Text style={styles.suggestionText}>{s.text}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0A0E1A', paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center'},
  closeBtn: {
    position: 'absolute', top: 56, right: 20,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  transcriptSection: {paddingHorizontal: 20, marginBottom: 48},
  transcript: {
    fontFamily: 'Inter-Bold', fontSize: 26, color: '#FFFFFF',
    lineHeight: 36, textAlign: 'center', letterSpacing: -0.5,
  },
  waveformContainer: {
    flexDirection: 'row', alignItems: 'center', height: 80, gap: 5, marginBottom: 16,
  },
  waveBar: {
    width: 5, backgroundColor: '#0D7FF2', borderRadius: 3,
    minHeight: 8, alignSelf: 'center',
  },
  listeningText: {
    fontFamily: 'Inter-Bold', fontSize: 11, letterSpacing: 3,
    color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 48,
  },
  suggestionsContainer: {width: '100%', gap: 10},
  suggestionPill: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(13,127,242,0.08)',
    borderRadius: 16, paddingHorizontal: 18, paddingVertical: 14,
    borderWidth: 1, borderColor: 'rgba(13,127,242,0.25)',
  },
  suggestionIcon: {fontSize: 18},
  suggestionText: {fontFamily: 'Inter-Medium', fontSize: 15, color: 'rgba(255,255,255,0.7)'},
});
