import React, {useEffect, useCallback, useState} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Dimensions, Pressable, ActivityIndicator,
} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useToast} from '../../context/ToastContext';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring,
  withTiming, interpolate, Extrapolation, runOnJS,
} from 'react-native-reanimated';
import Svg, {Path, Rect, Circle, Defs, LinearGradient, Stop} from 'react-native-svg';
import {RootStackParamList} from '../../types';
import {botsService} from '../../services/bots';

const {width: SW, height: SH} = Dimensions.get('window');
const CARD_W = Math.floor((SW - 48 - 12) / 2); // 2 columns, 24px side padding each, 12px gap

// ─── Icons ─────────────────────────────────────────────────────────────────────

function IconShadow({color}: {color: string}) {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.7} strokeDasharray="4 2.5" />
      <Path d="M12 7.5v5l3.5 3.5" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
function IconArena({color}: {color: string}) {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
function IconWallet({color}: {color: string}) {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Rect x={2} y={6} width={20} height={14} rx={3} stroke={color} strokeWidth={1.7} />
      <Path d="M2 10h20" stroke={color} strokeWidth={1.7} />
      <Circle cx={17} cy={15.5} r={1.8} fill={color} />
      <Path d="M6 6V4a2 2 0 012-2h8a2 2 0 012 2v2" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
    </Svg>
  );
}
function IconTrades({color}: {color: string}) {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Path d="M7 16V4m0 0L3 8m4-4l4 4" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M17 8v12m0 0l4-4m-4 4l-4-4" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
function IconBots({color}: {color: string}) {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Rect x={5} y={8} width={14} height={11} rx={3} stroke={color} strokeWidth={1.7} />
      <Path d="M12 8V5" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
      <Circle cx={12} cy={4} r={1.2} fill={color} />
      <Circle cx={9} cy={13.5} r={1.4} fill={color} />
      <Circle cx={15} cy={13.5} r={1.4} fill={color} />
      <Path d="M5 14.5H3M21 14.5h-2" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
    </Svg>
  );
}
function IconPause({color}: {color: string}) {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={1.7} />
      <Rect x={8.5} y={7} width={3} height={10} rx={1.5} fill={color} />
      <Rect x={12.5} y={7} width={3} height={10} rx={1.5} fill={color} />
    </Svg>
  );
}
function IconStop({color}: {color: string}) {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={1.7} />
      <Rect x={8} y={8} width={8} height={8} rx={2} fill={color} />
    </Svg>
  );
}

// ─── Glow accent line at top of card ──────────────────────────────────────────

function GlowLine({color}: {color: string}) {
  return (
    <View style={{
      position: 'absolute', top: 0, left: 16, right: 16, height: 1.5,
      borderRadius: 1,
      backgroundColor: color,
      opacity: 0.55,
    }} />
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = NativeStackScreenProps<RootStackParamList, 'QuickActions'>;

interface Action {
  id: string;
  label: string;
  subtitle: string;
  tag?: string;
  Icon: React.FC<{color: string}>;
  color: string;
  bg: string;
  border: string;
  onPress: () => void;
}

// ─── Animated card ────────────────────────────────────────────────────────────

function ActionCard({action, index, ready}: {action: Action; index: number; ready: boolean}) {
  const prog    = useSharedValue(0);
  const pressed = useSharedValue(0);

  useEffect(() => {
    if (ready) prog.value = withTiming(1, {duration: 240 + index * 60});
  }, [ready, index, prog]);

  const anim = useAnimatedStyle(() => ({
    opacity: interpolate(prog.value, [0, 1], [0, 1], Extrapolation.CLAMP),
    transform: [
      {translateY: interpolate(prog.value, [0, 1], [22, 0], Extrapolation.CLAMP)},
      {scale: interpolate(pressed.value, [0, 1], [1, 0.955], Extrapolation.CLAMP)},
    ],
  }));

  return (
    <Animated.View style={[{flex: 1}, anim]}>
      <Pressable
        style={[styles.card, {backgroundColor: action.bg, borderColor: action.border}]}
        onPressIn ={() => { pressed.value = withSpring(1, {damping: 12, stiffness: 350}); }}
        onPressOut={() => { pressed.value = withSpring(0, {damping: 12, stiffness: 350}); }}
        onPress={action.onPress}>

        <GlowLine color={action.color} />

        {/* Top row: icon + optional tag */}
        <View style={styles.cardTop}>
          <View style={[styles.iconBox, {backgroundColor: action.color + '1A'}]}>
            <action.Icon color={action.color} />
          </View>
          {action.tag && (
            <View style={[styles.tag, {backgroundColor: action.color + '22', borderColor: action.color + '44'}]}>
              <Text style={[styles.tagTxt, {color: action.color}]}>{action.tag}</Text>
            </View>
          )}
        </View>

        {/* Labels */}
        <Text style={[styles.cardLabel, {color: '#FFFFFF'}]}>{action.label}</Text>
        <Text style={styles.cardSub}>{action.subtitle}</Text>

        {/* Bottom arrow */}
        <View style={styles.cardArrow}>
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
            <Path d="M5 12h14M13 6l6 6-6 6" stroke={action.color} strokeWidth={2}
              strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
          </Svg>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function QuickActionsModal({navigation}: Props) {
  const {alert: showAlert, showConfirm} = useToast();
  const [pausing,   setPausing]   = useState(false);
  const [ready,     setReady]     = useState(false);
  const translateY  = useSharedValue(SH);
  const backdropO   = useSharedValue(0);

  const handleDismiss = useCallback(() => {
    translateY.value = withSpring(SH, {damping: 24, stiffness: 220});
    backdropO.value  = withTiming(0, {duration: 200}, (fin) => {
      if (fin) runOnJS(navigation.goBack)();
    });
  }, [navigation, translateY, backdropO]);

  const goTo = useCallback((screen: keyof RootStackParamList) => {
    handleDismiss();
    setTimeout(() => navigation.navigate(screen as any), 260);
  }, [handleDismiss, navigation]);

  const handlePauseAll = useCallback(async () => {
    setPausing(true);
    try {
      const res  = await botsService.getActive();
      const subs = (res as any)?.subscriptions ?? (res as any)?.data?.subscriptions ?? [];
      const live = subs.filter((s: any) => s.mode === 'live' && s.status === 'active');
      if (live.length === 0) { showAlert('No Live Bots', 'You have no active live bots to pause.'); return; }
      await Promise.all(live.map((s: any) => botsService.pause(s.id)));
      showAlert('Bots Paused', `${live.length} bot${live.length > 1 ? 's' : ''} paused.`);
      handleDismiss();
    } catch (e: any) {
      showAlert('Error', e?.message ?? 'Could not pause bots.');
    } finally { setPausing(false); }
  }, [showAlert, handleDismiss]);

  const handleEmergencyStop = useCallback(() => {
    showConfirm({
      title: 'Emergency Stop',
      message: 'This will stop all bots and close all live positions immediately. This cannot be undone.',
      confirmText: 'Stop Everything',
      destructive: true,
      onConfirm: async () => {
        try {
          const res  = await botsService.getActive();
          const subs = (res as any)?.subscriptions ?? (res as any)?.data?.subscriptions ?? [];
          if (subs.length === 0) { showAlert('Nothing Running', 'No active bots found.'); return; }
          await Promise.all(subs.map((s: any) => botsService.stop(s.id)));
          showAlert('All Stopped', `${subs.length} bot${subs.length > 1 ? 's' : ''} stopped.`);
          handleDismiss();
        } catch (e: any) { showAlert('Error', e?.message ?? 'Could not stop bots.'); }
      },
    });
  }, [showAlert, showConfirm, handleDismiss]);

  useEffect(() => {
    translateY.value = withSpring(0, {damping: 20, stiffness: 160}, (fin) => {
      if (fin) runOnJS(setReady)(true);
    });
    backdropO.value = withTiming(1, {duration: 260});
  }, [translateY, backdropO]);

  const sheetStyle    = useAnimatedStyle(() => ({transform: [{translateY: translateY.value}]}));
  const backdropStyle = useAnimatedStyle(() => ({opacity: backdropO.value}));

  const ACTIONS: Action[] = [
    {
      id: 'shadow', label: 'Shadow Mode', subtitle: 'Test bots risk-free',
      tag: 'Free', Icon: IconShadow, color: '#A78BFA',
      bg: 'rgba(167,139,250,0.07)', border: 'rgba(167,139,250,0.18)',
      onPress: () => goTo('ShadowMode'),
    },
    {
      id: 'arena', label: 'Bot Arena', subtitle: 'Battle bots head-to-head',
      tag: 'Live', Icon: IconArena, color: '#F59E0B',
      bg: 'rgba(245,158,11,0.07)', border: 'rgba(245,158,11,0.18)',
      onPress: () => goTo('ArenaSetup'),
    },
    {
      id: 'wallet', label: 'Wallet', subtitle: 'Deposit & withdraw funds',
      Icon: IconWallet, color: '#10B981',
      bg: 'rgba(16,185,129,0.07)', border: 'rgba(16,185,129,0.18)',
      onPress: () => goTo('WalletFunds'),
    },
    {
      id: 'trades', label: 'Trade History', subtitle: 'Review all past trades',
      Icon: IconTrades, color: '#38BDF8',
      bg: 'rgba(56,189,248,0.07)', border: 'rgba(56,189,248,0.18)',
      onPress: () => goTo('TradeHistory'),
    },
    {
      id: 'bots', label: 'My Bots', subtitle: 'View & manage bots',
      Icon: IconBots, color: '#F472B6',
      bg: 'rgba(244,114,182,0.07)', border: 'rgba(244,114,182,0.18)',
      onPress: () => goTo('AllBots'),
    },
    {
      id: 'pause',
      label: pausing ? 'Pausing…' : 'Pause All',
      subtitle: 'Pause all live bots',
      Icon: pausing
        ? (({color}) => <ActivityIndicator size={22} color={color} />)
        : IconPause,
      color: '#F97316',
      bg: 'rgba(249,115,22,0.07)', border: 'rgba(249,115,22,0.18)',
      onPress: handlePauseAll,
    },
  ];

  return (
    <View style={styles.root}>
      {/* Dimmed backdrop */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleDismiss} />
      </Animated.View>

      {/* Bottom sheet */}
      <Animated.View style={[styles.sheet, sheetStyle]}>

        {/* Drag handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerDot} />
            <View>
              <Text style={styles.title}>Quick Actions</Text>
              <Text style={styles.subtitle}>What would you like to do?</Text>
            </View>
          </View>
          <TouchableOpacity onPress={handleDismiss} style={styles.closeBtn} activeOpacity={0.75}>
            <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
              <Path d="M18 6L6 18M6 6l12 12" stroke="rgba(255,255,255,0.55)"
                strokeWidth={2.2} strokeLinecap="round" />
            </Svg>
          </TouchableOpacity>
        </View>

        {/* 2×3 grid — explicit rows to guarantee 2 per row */}
        <View style={styles.grid}>
          {[0, 1, 2].map(row => (
            <View key={row} style={styles.gridRow}>
              {ACTIONS.slice(row * 2, row * 2 + 2).map((a, i) => (
                <ActionCard key={a.id} action={a} index={row * 2 + i} ready={ready} />
              ))}
            </View>
          ))}
        </View>

        {/* Emergency stop */}
        <TouchableOpacity
          style={styles.emergencyRow}
          onPress={handleEmergencyStop}
          activeOpacity={0.78}>
          {/* red glow line */}
          <View style={styles.emergencyGlow} />
          <View style={styles.emergencyInner}>
            <View style={styles.emergencyIconBox}>
              <IconStop color="#EF4444" />
            </View>
            <View style={{flex: 1}}>
              <Text style={styles.emergencyLabel}>Emergency Stop</Text>
              <Text style={styles.emergencyHint}>Halts all bots · closes live positions</Text>
            </View>
            <View style={styles.emergencyArrow}>
              <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
                <Path d="M9 18l6-6-6-6" stroke="#EF4444" strokeWidth={2.3}
                  strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </View>
          </View>
        </TouchableOpacity>

        {/* Dismiss pill */}
        <TouchableOpacity onPress={handleDismiss} style={styles.dismissWrap} activeOpacity={0.6}>
          <Text style={styles.dismissTxt}>Dismiss</Text>
        </TouchableOpacity>

      </Animated.View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {flex: 1, justifyContent: 'flex-end'},

  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.72)',
  },

  sheet: {
    backgroundColor: '#0F1318',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    // subtle inner glow at top
    shadowColor: '#10B981',
    shadowOffset: {width: 0, height: -4},
    shadowOpacity: 0.04,
    shadowRadius: 20,
  },

  handle: {
    width: 40, height: 4.5,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 22,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerLeft: {flexDirection: 'row', alignItems: 'center', gap: 12},
  headerDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#10B981',
    shadowColor: '#10B981', shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.9, shadowRadius: 6,
  },
  title:    {fontFamily: 'Inter-Bold',    fontSize: 19, color: '#FFFFFF', letterSpacing: -0.2},
  subtitle: {fontFamily: 'Inter-Regular', fontSize: 12.5, color: 'rgba(255,255,255,0.35)', marginTop: 1},

  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },

  // Grid
  grid: {
    gap: 12,
    marginBottom: 18,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 12,
  },

  card: {
    borderRadius: 20,
    padding: 18,
    paddingBottom: 14,
    borderWidth: 1,
    overflow: 'hidden',
    minHeight: 148,
    justifyContent: 'space-between',
  },

  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  iconBox: {
    width: 50, height: 50, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  tag: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 8, borderWidth: 1,
  },
  tagTxt: {fontFamily: 'Inter-SemiBold', fontSize: 10, letterSpacing: 0.3},

  cardLabel: {fontFamily: 'Inter-SemiBold', fontSize: 15, letterSpacing: -0.1, marginBottom: 4},
  cardSub:   {fontFamily: 'Inter-Regular',  fontSize: 11.5, color: 'rgba(255,255,255,0.38)', lineHeight: 16},

  cardArrow: {marginTop: 10, alignSelf: 'flex-start'},

  // Emergency
  emergencyRow: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    backgroundColor: 'rgba(239,68,68,0.06)',
    overflow: 'hidden',
    marginBottom: 16,
  },
  emergencyGlow: {
    position: 'absolute', top: 0, left: 20, right: 20,
    height: 1.5, borderRadius: 1,
    backgroundColor: '#EF4444', opacity: 0.45,
  },
  emergencyInner: {
    flexDirection: 'row', alignItems: 'center',
    gap: 14, padding: 18,
  },
  emergencyIconBox: {
    width: 50, height: 50, borderRadius: 15,
    backgroundColor: 'rgba(239,68,68,0.14)',
    alignItems: 'center', justifyContent: 'center',
  },
  emergencyLabel: {fontFamily: 'Inter-SemiBold', fontSize: 15, color: '#EF4444', letterSpacing: -0.1},
  emergencyHint:  {fontFamily: 'Inter-Regular',  fontSize: 12, color: 'rgba(239,68,68,0.55)', marginTop: 2},
  emergencyArrow: {
    width: 30, height: 30, borderRadius: 10,
    backgroundColor: 'rgba(239,68,68,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Dismiss
  dismissWrap: {alignItems: 'center', paddingVertical: 4},
  dismissTxt: {fontFamily: 'Inter-Medium', fontSize: 13.5, color: 'rgba(255,255,255,0.25)'},
});
