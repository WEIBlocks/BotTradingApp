import React, {useEffect, useCallback} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, Dimensions, Pressable} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, runOnJS,
} from 'react-native-reanimated';
import {RootStackParamList} from '../../types';
import EmergencyStopIcon from '../../components/icons/EmergencyStopIcon';
import ChevronRightIcon from '../../components/icons/ChevronRightIcon';
import XIcon from '../../components/icons/XIcon';

const {height} = Dimensions.get('window');
type Props = NativeStackScreenProps<RootStackParamList, 'QuickActions'>;

const ACTIONS = [
  {label: 'Pause All', subtitle: 'Pause all active bots', icon: '⏸', bg: 'rgba(249,115,22,0.15)', color: '#F97316'},
  {label: 'Add Capital', subtitle: 'Deposit funds to trade', icon: '💰', bg: 'rgba(16,185,129,0.15)', color: '#10B981'},
  {label: 'Live Trades', subtitle: 'View open positions', icon: '📊', bg: 'rgba(13,127,242,0.15)', color: '#0D7FF2'},
  {label: 'Strategies', subtitle: 'Manage bot strategies', icon: '⚡', bg: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)'},
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
            <TouchableOpacity key={action.label} style={[styles.actionCard, {backgroundColor: action.bg}]} activeOpacity={0.7}>
              <Text style={styles.actionEmoji}>{action.icon}</Text>
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
