import React, {useEffect, useCallback} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, Dimensions, Pressable} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, runOnJS,
} from 'react-native-reanimated';
import Svg, {Path, Rect, Circle, Line} from 'react-native-svg';
import {RootStackParamList} from '../../types';
import EmergencyStopIcon from '../../components/icons/EmergencyStopIcon';
import ChevronRightIcon from '../../components/icons/ChevronRightIcon';
import XIcon from '../../components/icons/XIcon';

function ActionIcon({type, color}: {type: string; color: string}) {
  const size = 24;
  if (type === 'mic') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Rect x={9} y={2} width={6} height={12} rx={3} stroke={color} strokeWidth={1.8} />
        <Path d="M5 10C5 13.87 8.13 17 12 17C15.87 17 19 13.87 19 10" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
        <Path d="M12 17V21" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
        <Path d="M8 21H16" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      </Svg>
    );
  }
  if (type === 'pause') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Rect x={6} y={5} width={4} height={14} rx={1} stroke={color} strokeWidth={2} />
        <Rect x={14} y={5} width={4} height={14} rx={1} stroke={color} strokeWidth={2} />
      </Svg>
    );
  }
  if (type === 'capital') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.8} />
        <Path d="M12 7V17" stroke={color} strokeWidth={2} strokeLinecap="round" />
        <Path d="M9 9.5C9 9.5 9.5 8.5 12 8.5C14.5 8.5 15 10 15 10.5C15 12.5 9 12.5 9 14.5C9 15.5 10 16 12 16C14 16 15 15 15 15" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
      </Svg>
    );
  }
  if (type === 'trades') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Rect x={4} y={14} width={4} height={6} rx={1} stroke={color} strokeWidth={1.8} />
        <Rect x={10} y={9} width={4} height={11} rx={1} stroke={color} strokeWidth={1.8} />
        <Rect x={16} y={4} width={4} height={16} rx={1} stroke={color} strokeWidth={1.8} />
      </Svg>
    );
  }
  // strategies / lightning
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M13 2L4 14H12L11 22L20 10H12L13 2Z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const {height} = Dimensions.get('window');
type Props = NativeStackScreenProps<RootStackParamList, 'QuickActions'>;

const ACTIONS = [
  {label: 'Pause All', subtitle: 'Pause all active bots', iconType: 'pause', bg: 'rgba(249,115,22,0.15)', color: '#F97316', screen: ''},
  {label: 'Add Capital', subtitle: 'Deposit funds to trade', iconType: 'capital', bg: 'rgba(16,185,129,0.15)', color: '#10B981', screen: 'WalletFunds'},
  {label: 'Live Trades', subtitle: 'View open positions', iconType: 'trades', bg: 'rgba(13,127,242,0.15)', color: '#0D7FF2', screen: 'LiveTrades'},
  {label: 'Strategies', subtitle: 'Build & manage bots', iconType: 'strategies', bg: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', screen: 'BotBuilder'},
  {label: 'Voice AI', subtitle: 'Talk to your assistant', iconType: 'mic', bg: 'rgba(168,85,247,0.15)', color: '#A855F7', screen: 'VoiceAssistant'},
];

export default function QuickActionsModal({navigation}: Props) {
  const translateY = useSharedValue(500);

  useEffect(() => {
    translateY.value = withSpring(0, {damping: 22, stiffness: 180});
  }, [translateY]);

  const handleDismiss = useCallback(() => {
    translateY.value = withSpring(500, {damping: 22, stiffness: 180}, (finished) => {
      if (finished) runOnJS(navigation.goBack)();
    });
  }, [navigation, translateY]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{translateY: translateY.value}],
  }));

  return (
    <View style={styles.container}>
      <Pressable style={styles.backdrop} onPress={handleDismiss} />
      <Animated.View style={[styles.sheet, sheetStyle]}>
        {/* Drag handle */}
        <View style={styles.dragHandle} />

        {/* Header */}
        <View style={styles.sheetHeader}>
          <View>
            <Text style={styles.sheetTitle}>Quick Actions</Text>
            <Text style={styles.sheetSubtitle}>Manage your active operations</Text>
          </View>
          <TouchableOpacity onPress={handleDismiss} style={styles.closeBtn}>
            <XIcon size={18} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
        </View>

        {/* 2x2 action grid */}
        <View style={styles.actionGrid}>
          {ACTIONS.map(action => (
            <TouchableOpacity key={action.label} style={[styles.actionCard, {backgroundColor: action.bg}]} activeOpacity={0.7} onPress={() => { if (action.screen) { navigation.goBack(); setTimeout(() => navigation.navigate(action.screen as any), 100); } }}>
              <View style={{marginBottom: 8}}>
                <ActionIcon type={action.iconType} color={action.color} />
              </View>
              <Text style={[styles.actionLabel, {color: action.color}]}>{action.label}</Text>
              <Text style={styles.actionSubtitle}>{action.subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Emergency stop */}
        <TouchableOpacity style={styles.emergencyCard} activeOpacity={0.8}>
          <View style={styles.emergencyLeft}>
            <EmergencyStopIcon size={22} color="#EF4444" />
            <View>
              <Text style={styles.emergencyTitle}>Emergency Stop</Text>
              <Text style={styles.emergencySubtitle}>Liquidate &amp; close all positions</Text>
            </View>
          </View>
          <ChevronRightIcon size={18} color="#EF4444" />
        </TouchableOpacity>

        {/* Dismiss */}
        <TouchableOpacity style={styles.dismissBtn} onPress={handleDismiss}>
          <Text style={styles.dismissText}>Dismiss</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, justifyContent: 'flex-end'},
  backdrop: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)'},
  sheet: {
    backgroundColor: '#161B22', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 40,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  dragHandle: {width: 36, height: 4, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 2, alignSelf: 'center', marginBottom: 20},
  sheetHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20},
  sheetTitle: {fontFamily: 'Inter-Bold', fontSize: 20, color: '#FFFFFF'},
  sheetSubtitle: {fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 2},
  closeBtn: {width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center'},
  actionGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10},
  actionCard: {
    width: '48%', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  actionEmoji: {fontSize: 24, marginBottom: 8},
  actionLabel: {fontFamily: 'Inter-SemiBold', fontSize: 14, marginBottom: 3},
  actionSubtitle: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.35)'},
  emergencyCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 14, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
  },
  emergencyLeft: {flexDirection: 'row', alignItems: 'center', gap: 12},
  emergencyTitle: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#EF4444'},
  emergencySubtitle: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(239,68,68,0.7)', marginTop: 1},
  dismissBtn: {alignItems: 'center', paddingVertical: 8},
  dismissText: {fontFamily: 'Inter-Medium', fontSize: 14, color: 'rgba(255,255,255,0.35)'},
});
