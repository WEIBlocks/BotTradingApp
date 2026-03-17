import React, {useState, useCallback, useEffect} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import Svg, {Path, Circle, Rect, Ellipse} from 'react-native-svg';
import {RootStackParamList, Gladiator} from '../../types';
import {arenaApi} from '../../services/arena';

type NavProp = NativeStackNavigationProp<RootStackParamList>;
const MAX_GLADIATORS = 5;

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
  const [gladiators, setGladiators] = useState<Gladiator[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    arenaApi.getAvailableBots()
      .then(bots => setGladiators(bots))
      .catch(() => Alert.alert('Error', 'Failed to load arena bots. Please try again.'))
      .finally(() => setLoading(false));
  }, []);

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
    const ids = gladiators.filter(g => g.selected).map(g => g.id);
    Alert.alert(
      'Enter Arena',
      `Start a battle with ${ids.length} bots? This will begin a live trading competition.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {text: 'Enter Arena', onPress: () => navigation.navigate('ArenaLive', {gladiatorIds: ids})},
      ],
    );
  }, [gladiators, navigation]);

  return (
    <View style={styles.container}>

      {/* ── FIXED header — "BOT BATTLE ARENA" stays pinned ── */}
      <View style={styles.stickyHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <BackArrow />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>BOT BATTLE ARENA</Text>
        <TouchableOpacity style={styles.headerBtn} onPress={() => Alert.alert('Bot Battle Arena', 'Select 2-5 bots to compete in a real-time trading arena. Bots trade simultaneously and are ranked by performance. The arena runs until a winner emerges!')}>
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
});
