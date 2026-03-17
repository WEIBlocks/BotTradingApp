import React, {useEffect, useState} from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, withDelay,
} from 'react-native-reanimated';
import Svg, {Path, Rect, Circle} from 'react-native-svg';
import {RootStackParamList} from '../../types';
import XIcon from '../../components/icons/XIcon';
import {aiApi} from '../../services/ai';

function SuggestionIcon({type}: {type: string}) {
  const size = 18;
  const color = 'rgba(255,255,255,0.7)';
  if (type === 'pause') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Rect x={6} y={5} width={4} height={14} rx={1} stroke={color} strokeWidth={2} />
        <Rect x={14} y={5} width={4} height={14} rx={1} stroke={color} strokeWidth={2} />
      </Svg>
    );
  }
  if (type === 'dollar') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.8} />
        <Path d="M12 7V17" stroke={color} strokeWidth={2} strokeLinecap="round" />
        <Path d="M9 9.5C9 9.5 9.5 8.5 12 8.5C14.5 8.5 15 10 15 10.5C15 12.5 9 12.5 9 14.5C9 15.5 10 16 12 16C14 16 15 15 15 15" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
      </Svg>
    );
  }
  if (type === 'trend') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d="M3 17L9 11L13 15L21 7" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M15 7H21V13" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }
  // briefcase / portfolio
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={9} width={18} height={11} rx={2} stroke={color} strokeWidth={1.8} />
      <Path d="M8 9V7C8 5.9 8.9 5 10 5H14C15.1 5 16 5.9 16 7V9" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M3 14H21" stroke={color} strokeWidth={1.5} />
    </Svg>
  );
}

type Props = NativeStackScreenProps<RootStackParamList, 'VoiceAssistant'>;

const SUGGESTIONS = [
  {iconType: 'pause', text: 'Pause BTC bot'},
  {iconType: 'dollar', text: 'Total profit today?'},
  {iconType: 'trend', text: 'Top performing bot'},
  {iconType: 'portfolio', text: 'Portfolio balance'},
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
  const [transcript, setTranscript] = useState('');
  const [reply, setReply] = useState('');
  const [listening, setListening] = useState(true);
  const [processing, setProcessing] = useState(false);

  const handleSuggestion = async (text: string) => {
    setTranscript(text);
    setListening(false);
    setProcessing(true);
    try {
      const res = await aiApi.voiceCommand(text);
      setReply(res.reply);
    } catch {
      setReply('Sorry, I could not process that command.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Close button */}
      <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
        <XIcon size={20} color="rgba(255,255,255,0.7)" />
      </TouchableOpacity>

      {/* Transcript */}
      <View style={styles.transcriptSection}>
        <Text style={styles.transcript}>{transcript || "Tap a suggestion below..."}</Text>
      </View>

      {/* Waveform */}
      {listening && !reply && (
        <View style={styles.waveformContainer}>
          {BAR_HEIGHTS.map((h, i) => (
            <WaveformBar key={i} delay={DELAYS[i]} height={h} />
          ))}
        </View>
      )}

      {/* Reply */}
      {reply ? (
        <View style={{paddingHorizontal: 20, marginBottom: 24}}>
          <Text style={{fontFamily: 'Inter-Regular', fontSize: 15, color: 'rgba(255,255,255,0.8)', textAlign: 'center', lineHeight: 22}}>{reply}</Text>
        </View>
      ) : null}

      {/* Listening label */}
      <Text style={styles.listeningText}>{processing ? 'PROCESSING...' : listening ? 'LISTENING' : 'DONE'}</Text>

      {/* Suggestions */}
      <View style={styles.suggestionsContainer}>
        {SUGGESTIONS.map(s => (
          <TouchableOpacity key={s.text} style={styles.suggestionPill} activeOpacity={0.7} onPress={() => handleSuggestion(s.text)}>
            <SuggestionIcon type={s.iconType} />
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
