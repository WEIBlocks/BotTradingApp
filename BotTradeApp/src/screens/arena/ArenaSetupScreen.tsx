import React, {useState, useCallback} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import Svg, {Path, Circle, Rect, Ellipse} from 'react-native-svg';
import {RootStackParamList, Gladiator} from '../../types';
import {arenaApi, ArenaSession} from '../../services/arena';
import {useToast} from '../../context/ToastContext';

type NavProp = NativeStackNavigationProp<RootStackParamList>;
const MAX_GLADIATORS = 5;

// Duration presets
const DURATION_OPTIONS = [
  {label: '1 Min',   seconds: 60},
  {label: '5 Min',   seconds: 300},
  {label: '15 Min',  seconds: 900},
  {label: '1 Hour',  seconds: 3600},
  {label: '6 Hours', seconds: 21600},
  {label: '24 Hours', seconds: 86400},
];

// ─── Icons ─────────────────────────────────────────────────────────────────────

function BackArrow() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M15 19l-7-7 7-7" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function InfoCircleIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke="rgba(255,255,255,0.45)" strokeWidth={1.5} />
      <Path d="M12 16v-4M12 8h.01" stroke="rgba(255,255,255,0.45)" strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

function SwordsIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M14.5 17.5L3 6V3h3l11.5 11.5" stroke="#FFFFFF" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M13 19l6-6M2 21l3-3M20.5 3.5l-6 6" stroke="#FFFFFF" strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

// Bot avatar SVG — robot face
function BotFaceAvatar({color, size = 50}: {color: string; size?: number}) {
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: '#1A1F2E',
      borderWidth: 1.5, borderColor: color + '60',
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    }}>
      <Svg width={size * 0.68} height={size * 0.68} viewBox="0 0 64 64" fill="none">
        <Rect x={12} y={18} width={40} height={32} rx={10} fill={color} opacity={0.82} />
        <Ellipse cx={23} cy={32} rx={5} ry={5} fill="#0A0E14" />
        <Ellipse cx={41} cy={32} rx={5} ry={5} fill="#0A0E14" />
        <Ellipse cx={24.5} cy={30.5} rx={2} ry={2} fill="#FFFFFF" />
        <Ellipse cx={42.5} cy={30.5} rx={2} ry={2} fill="#FFFFFF" />
        <Rect x={22} y={40} width={20} height={3.5} rx={1.75} fill="#0A0E14" />
        <Rect x={29} y={8} width={6} height={11} rx={3} fill={color} opacity={0.7} />
        <Circle cx={32} cy={7} r={4} fill={color} />
        <Rect x={4} y={27} width={8} height={11} rx={4} fill={color} opacity={0.5} />
        <Rect x={52} y={27} width={8} height={11} rx={4} fill={color} opacity={0.5} />
      </Svg>
    </View>
  );
}

// Round radio-style select button — filled circle when active, outline when not
function RadioSelect({active}: {active: boolean}) {
  if (active) {
    return (
      <View style={radioSt.activeOuter}>
        <View style={radioSt.activeInner} />
      </View>
    );
  }
  return <View style={radioSt.inactive} />;
}

const radioSt = StyleSheet.create({
  activeOuter: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#10B981',
    alignItems: 'center', justifyContent: 'center',
  },
  activeInner: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#FFFFFF',
  },
  inactive: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
});

// Progress bar
function ProgressBar({progress}: {progress: number}) {
  return (
    <View style={pbSt.track}>
      <View style={[pbSt.fill, {width: `${Math.round(progress * 100)}%`}]} />
    </View>
  );
}

const pbSt = StyleSheet.create({
  track: {
    height: 5, backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 999, overflow: 'hidden', marginBottom: 16,
  },
  fill: {height: 5, backgroundColor: '#10B981', borderRadius: 999},
});

// ─── Screen ────────────────────────────────────────────────────────────────────

export default function ArenaSetupScreen() {
  const navigation = useNavigation<NavProp>();
  const {alert: showAlert, showConfirm} = useToast();
  const [gladiators, setGladiators] = useState<Gladiator[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSession, setActiveSession] = useState<ArenaSession | null>(null);
  const [selectedDuration, setSelectedDuration] = useState(DURATION_OPTIONS[1]);
  const [arenaMode, setArenaMode] = useState<'shadow' | 'live'>('shadow');
  const [virtualBalance, setVirtualBalance] = useState('10000');

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      Promise.all([
        arenaApi.getAvailableBots(),
        arenaApi.getActiveSession().catch(() => null),
      ])
        .then(([bots, session]) => {
          setGladiators(bots);
          setActiveSession(session);
        })
        .catch(() => showAlert('Error', 'Failed to load arena bots. Please try again.'))
        .finally(() => setLoading(false));
    }, []),
  );

  const selectedCount = gladiators.filter(g => g.selected).length;
  const progress = selectedCount / MAX_GLADIATORS;

  const toggleGladiator = useCallback((id: string) => {
    setGladiators(prev =>
      prev.map(g => {
        if (g.id !== id) return g;
        if (!g.selected && selectedCount >= MAX_GLADIATORS) return g;
        return {...g, selected: !g.selected};
      }),
    );
  }, [selectedCount]);

  const handleEnterArena = useCallback(() => {
    if (activeSession && activeSession.status === 'running') {
      showConfirm({
        title: 'Battle In Progress',
        message: 'You already have an active arena battle running. Watch it or wait for it to finish before starting a new one.',
        confirmText: 'Watch Live',
        onConfirm: () => navigation.navigate('ArenaLive', {gladiatorIds: [], sessionId: activeSession.id}),
      });
      return;
    }
    const ids = gladiators.filter(g => g.selected).map(g => g.id);
    const bal = parseFloat(virtualBalance) || 10000;
    showConfirm({
      title: arenaMode === 'live' ? 'Live Arena Battle' : 'Shadow Arena Battle',
      message: arenaMode === 'live'
        ? `Start a LIVE battle with ${ids.length} bots using real exchange funds?`
        : `Start a shadow battle with ${ids.length} bots using $${bal.toLocaleString()} virtual funds?`,
      confirmText: 'Start Battle',
      onConfirm: () => navigation.navigate('ArenaLive', {
        gladiatorIds: ids,
        durationSeconds: selectedDuration.seconds,
        mode: arenaMode,
        virtualBalance: bal,
      } as any),
    });
  }, [gladiators, navigation, activeSession, selectedDuration, arenaMode, virtualBalance, showConfirm]);

  return (
    <View style={styles.container}>

      {/* ── FIXED header — "BOT BATTLE ARENA" stays pinned ── */}
      <View style={styles.stickyHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <BackArrow />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>BOT BATTLE ARENA</Text>
        <TouchableOpacity style={styles.headerBtn} onPress={() => showAlert('Bot Battle Arena', 'Select 2-5 bots to compete in a real-time trading arena. Bots trade simultaneously and are ranked by performance. The arena runs until a winner emerges!')}>
          <InfoCircleIcon />
        </TouchableOpacity>
      </View>

      {/* ── Scrollable: title + subtitle + cards ── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>

        <Text style={styles.title}>Select Your Bot</Text>
        <Text style={styles.subtitle}>
          Pick up to {MAX_GLADIATORS} bots to compete in the high-stakes trading arena.
        </Text>

        {/* Active battle banner */}
        {activeSession && activeSession.status === 'running' && (
          <TouchableOpacity
            style={styles.activeBattleBanner}
            onPress={() => navigation.navigate('ArenaLive', {gladiatorIds: [], sessionId: activeSession.id})}
            activeOpacity={0.8}>
            <View style={styles.activeBattlePulse}>
              <View style={styles.activeBattleDot} />
            </View>
            <View style={{flex: 1, marginLeft: 12}}>
              <Text style={styles.activeBattleTitle}>Battle In Progress</Text>
              <Text style={styles.activeBattleSub}>
                {activeSession.gladiators.length} bots · {Math.round((activeSession.progress ?? 0) * 100)}% complete
              </Text>
            </View>
            <View style={styles.activeBattleViewBtn}>
              <Text style={styles.activeBattleViewText}>WATCH LIVE</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Duration picker */}
        {/* Battle Mode */}
        <Text style={styles.sectionLabel}>BATTLE MODE</Text>
        <View style={{flexDirection: 'row', gap: 10, marginBottom: 16}}>
          <TouchableOpacity
            style={[styles.durationChip, {flex: 1, paddingVertical: 14}, arenaMode === 'shadow' && styles.durationChipActive]}
            onPress={() => setArenaMode('shadow')} activeOpacity={0.7}>
            <Text style={{fontSize: 18, marginBottom: 4}}>🧪</Text>
            <Text style={[styles.durationChipText, arenaMode === 'shadow' && styles.durationChipTextActive]}>Shadow</Text>
            <Text style={{fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2}}>Virtual funds</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.durationChip, {flex: 1, paddingVertical: 14}, arenaMode === 'live' && {backgroundColor: '#FF6B0020', borderColor: '#FF6B00'}]}
            onPress={() => setArenaMode('live')} activeOpacity={0.7}>
            <Text style={{fontSize: 18, marginBottom: 4}}>⚡</Text>
            <Text style={[styles.durationChipText, arenaMode === 'live' && {color: '#FF6B00'}]}>Live</Text>
            <Text style={{fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2}}>Real exchange</Text>
          </TouchableOpacity>
        </View>

        {/* Virtual Balance (shadow mode only) */}
        {arenaMode === 'shadow' && (
          <>
            <Text style={styles.sectionLabel}>VIRTUAL BALANCE</Text>
            <TextInput
              style={{backgroundColor: '#161B22', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', color: '#FFFFFF', fontFamily: 'Inter-SemiBold', fontSize: 16, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16}}
              value={virtualBalance}
              onChangeText={setVirtualBalance}
              keyboardType="numeric"
              placeholder="10000"
              placeholderTextColor="rgba(255,255,255,0.2)"
            />
          </>
        )}

        {arenaMode === 'live' && (
          <View style={{backgroundColor: '#FF6B0010', borderRadius: 10, borderWidth: 1, borderColor: '#FF6B0030', padding: 14, marginBottom: 16}}>
            <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#FF6B00', marginBottom: 4}}>Live Battle Mode</Text>
            <Text style={{fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 18}}>
              Bots will compete using your real exchange balance. Make sure you have sufficient funds connected.
            </Text>
          </View>
        )}

        <Text style={styles.sectionLabel}>BATTLE DURATION</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.durationScroll}
          contentContainerStyle={styles.durationScrollContent}>
          {DURATION_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.seconds}
              style={[
                styles.durationChip,
                selectedDuration.seconds === opt.seconds && styles.durationChipActive,
              ]}
              onPress={() => setSelectedDuration(opt)}
              activeOpacity={0.7}>
              <Text
                style={[
                  styles.durationChipText,
                  selectedDuration.seconds === opt.seconds && styles.durationChipTextActive,
                ]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {loading ? (
          <ActivityIndicator size="large" color="#10B981" style={{marginTop: 40}} />
        ) : gladiators.length === 0 ? (
          <Text style={{fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 40}}>
            No bots available for arena battles right now.
          </Text>
        ) : null}

        {gladiators.map(item => (
          <TouchableOpacity
            key={item.id}
            style={[
              styles.card,
              item.selected && styles.cardSelected,
            ]}
            onPress={() => toggleGladiator(item.id)}
            activeOpacity={0.8}>

            {/* Avatar + level badge */}
            <View style={styles.avatarWrap}>
              <BotFaceAvatar color={item.avatarColor} size={50} />
              <View style={[styles.levelBadge, {backgroundColor: item.avatarColor}]}>
                <Text style={styles.levelText}>LVL {item.level}</Text>
              </View>
            </View>

            {/* Info */}
            <View style={styles.cardInfo}>
              <Text style={styles.cardName}>{item.name}</Text>
              <View style={styles.cardMeta}>
                <Text style={styles.strategyText}>{item.strategy}</Text>
                {item.statLabel ? (
                  <>
                    <Text style={styles.metaSep}> · </Text>
                    <Text style={styles.statLabelText}>{item.statLabel}</Text>
                  </>
                ) : null}
              </View>
            </View>

            {/* Radio circle */}
            <RadioSelect active={item.selected} />
          </TouchableOpacity>
        ))}

        <View style={{height: 12}} />
      </ScrollView>

      {/* ── Fixed footer ── */}
      <View style={styles.footer}>
        <View style={styles.readinessRow}>
          <Text style={styles.readinessLabel}>BATTLE SQUAD READINESS</Text>
          <Text style={styles.readinessCount}>{selectedCount}/{MAX_GLADIATORS} Bot Selected</Text>
        </View>
        <ProgressBar progress={progress} />
        <TouchableOpacity
          style={[styles.enterBtn, selectedCount < 2 && styles.enterBtnDisabled]}
          onPress={handleEnterArena}
          disabled={selectedCount < 2}
          activeOpacity={0.85}>
          <Text style={styles.enterBtnText}>ENTER ARENA</Text>
          <SwordsIcon />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0A0E14'},

  // Sticky header
  stickyHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 54, paddingBottom: 14,
    backgroundColor: '#0A0E14',
  },
  headerBtn: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'Inter-Bold', fontSize: 14, color: '#FFFFFF',
    letterSpacing: 1.8, textTransform: 'uppercase',
  },

  // Scrollable content
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },

  title: {
    fontFamily: 'Inter-Bold', fontSize: 26, color: '#FFFFFF',
    marginBottom: 8, letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.38)',
    lineHeight: 20, marginBottom: 22,
  },

  // Card
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#111820',
    borderRadius: 22,
    paddingVertical: 14, paddingHorizontal: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  cardSelected: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16,185,129,0.08)',
  },

  // Avatar
  avatarWrap: {marginRight: 14, position: 'relative'},
  levelBadge: {
    position: 'absolute', bottom: -5, left: 0, right: 0,
    borderRadius: 6, paddingVertical: 2,
    alignItems: 'center',
  },
  levelText: {
    fontFamily: 'Inter-Bold', fontSize: 7, color: '#FFFFFF',
    letterSpacing: 0.2, textTransform: 'uppercase',
  },

  // Info
  cardInfo: {flex: 1, marginRight: 10},
  cardName: {fontFamily: 'Inter-SemiBold', fontSize: 15, color: '#FFFFFF', marginBottom: 4},
  cardMeta: {flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap'},
  strategyText: {fontFamily: 'Inter-Regular', fontSize: 12, color: '#10B981'},
  metaSep: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.2)'},
  statLabelText: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.4)'},

  // Footer
  footer: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
    backgroundColor: '#0A0E14',
  },
  readinessRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 10,
  },
  readinessLabel: {
    fontFamily: 'Inter-Medium', fontSize: 10, letterSpacing: 1,
    color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase',
  },
  readinessCount: {
    fontFamily: 'Inter-SemiBold', fontSize: 12, color: 'rgba(255,255,255,0.65)',
  },
  enterBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, height: 54, borderRadius: 14, backgroundColor: '#10B981',
    shadowColor: '#10B981', shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.4, shadowRadius: 14, elevation: 10,
  },
  enterBtnDisabled: {backgroundColor: '#1C2333', shadowOpacity: 0, elevation: 0},
  enterBtnText: {
    fontFamily: 'Inter-Bold', fontSize: 15, color: '#FFFFFF', letterSpacing: 2,
  },

  // Active battle banner
  activeBattleBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(234,179,8,0.08)', borderRadius: 16,
    padding: 14, marginBottom: 18,
    borderWidth: 1, borderColor: 'rgba(234,179,8,0.25)',
  },
  activeBattlePulse: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(234,179,8,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  activeBattleDot: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#EAB308',
  },
  activeBattleTitle: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#EAB308'},
  activeBattleSub: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2},
  activeBattleViewBtn: {
    backgroundColor: '#EAB308', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  activeBattleViewText: {fontFamily: 'Inter-Bold', fontSize: 10, color: '#0A0E14', letterSpacing: 0.5},

  // Duration picker
  sectionLabel: {
    fontFamily: 'Inter-Medium', fontSize: 10, letterSpacing: 1.2,
    color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' as const,
    marginBottom: 10, marginTop: 4,
  },
  durationScroll: {marginBottom: 20},
  durationScrollContent: {gap: 8},
  durationChip: {
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#111820',
  },
  durationChipActive: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16,185,129,0.12)',
  },
  durationChipText: {
    fontFamily: 'Inter-SemiBold', fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
  },
  durationChipTextActive: {
    color: '#10B981',
  },
});
