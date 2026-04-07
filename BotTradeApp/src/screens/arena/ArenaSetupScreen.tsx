import React, {useState, useCallback} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Alert} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import Svg, {Path, Circle, Rect, Ellipse} from 'react-native-svg';
import {RootStackParamList, Gladiator} from '../../types';
import {arenaApi, ArenaSession} from '../../services/arena';
import {api} from '../../services/api';
import {useToast} from '../../context/ToastContext';

interface ExchangeInfo {
  id: string;
  provider: string;
  assetClass: 'crypto' | 'stocks';
  totalBalance: number;
  status: string;
  sandbox: boolean;
}

type NavProp = NativeStackNavigationProp<RootStackParamList>;
const MAX_GLADIATORS = 5;

const DURATION_OPTIONS = [
  {label: '1 Min',    seconds: 60},
  {label: '5 Min',    seconds: 300},
  {label: '15 Min',   seconds: 900},
  {label: '1 Hour',   seconds: 3600},
  {label: '6 Hours',  seconds: 21600},
  {label: '24 Hours', seconds: 86400},
];

// ─── Icons ───────────────────────────────────────────────────────────────────

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
function BotFaceAvatar({color, size = 50}: {color: string; size?: number}) {
  return (
    <View style={{width: size, height: size, borderRadius: size / 2, backgroundColor: '#1A1F2E', borderWidth: 1.5, borderColor: color + '60', alignItems: 'center', justifyContent: 'center', overflow: 'hidden'}}>
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
function RadioSelect({active}: {active: boolean}) {
  if (active) return <View style={radioSt.activeOuter}><View style={radioSt.activeInner} /></View>;
  return <View style={radioSt.inactive} />;
}
const radioSt = StyleSheet.create({
  activeOuter: {width: 26, height: 26, borderRadius: 13, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center'},
  activeInner: {width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFFFFF'},
  inactive: {width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.04)'},
});
function ProgressBar({progress}: {progress: number}) {
  return (
    <View style={pbSt.track}>
      <View style={[pbSt.fill, {width: `${Math.round(progress * 100)}%`}]} />
    </View>
  );
}
const pbSt = StyleSheet.create({
  track: {height: 5, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 999, overflow: 'hidden', marginBottom: 16},
  fill: {height: 5, backgroundColor: '#10B981', borderRadius: 999},
});

// ─── Balance input ────────────────────────────────────────────────────────────

function BalanceInput({
  label, value, onChange, max, suffix, color = '#10B981',
}: {
  label: string; value: string; onChange: (v: string) => void;
  max?: number; suffix?: string; color?: string;
}) {
  return (
    <View style={{marginBottom: 14}}>
      <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6}}>
        <Text style={{fontFamily: 'Inter-Medium', fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5}}>{label}</Text>
        {max != null && (
          <TouchableOpacity onPress={() => onChange(String(Math.floor(max)))}>
            <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 11, color}}>MAX ${max.toLocaleString()}</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#161B22', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 14}}>
        <Text style={{fontFamily: 'Inter-Bold', fontSize: 16, color: 'rgba(255,255,255,0.4)', marginRight: 4}}>$</Text>
        <TextInput
          style={{flex: 1, color: '#FFFFFF', fontFamily: 'Inter-SemiBold', fontSize: 16, paddingVertical: 12}}
          value={value}
          onChangeText={onChange}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor="rgba(255,255,255,0.2)"
        />
        {suffix ? <Text style={{fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.3)', marginLeft: 4}}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

// ─── Screen ─────────────────────────────────────────────────────────────────

export default function ArenaSetupScreen() {
  const navigation = useNavigation<NavProp>();
  const {alert: showAlert, showConfirm} = useToast();

  const [gladiators, setGladiators] = useState<Gladiator[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [activeSession, setActiveSession] = useState<ArenaSession | null>(null);
  const [selectedDuration, setSelectedDuration] = useState(DURATION_OPTIONS[1]);
  const [arenaMode, setArenaMode] = useState<'shadow' | 'live'>('shadow');

  // Shadow balance inputs
  const [cryptoVirtual, setCryptoVirtual] = useState('5000');
  const [stockVirtual, setStockVirtual] = useState('5000');
  const [singleVirtual, setSingleVirtual] = useState('10000');

  // Live exchange connections (fetched)
  const [exchanges, setExchanges] = useState<ExchangeInfo[]>([]);
  const [cryptoLiveInput, setCryptoLiveInput] = useState('');
  const [stockLiveInput, setStockLiveInput] = useState('');
  const [loadingBalances, setLoadingBalances] = useState(false);

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

  // When switching to live mode, fetch real exchange connections
  const handleModeChange = useCallback(async (mode: 'shadow' | 'live') => {
    setArenaMode(mode);
    if (mode === 'live' && exchanges.length === 0) {
      setLoadingBalances(true);
      api.get<{data: ExchangeInfo[]}>('/exchange/user/connections')
        .then(res => {
          const conns: ExchangeInfo[] = Array.isArray((res as any)?.data) ? (res as any).data : [];
          setExchanges(conns);
          const cryptoEx = conns.find(c => c.assetClass === 'crypto' && c.status === 'connected');
          const stockEx = conns.find(c => c.assetClass === 'stocks' && c.status === 'connected');
          if (cryptoEx) setCryptoLiveInput(String(Math.floor(cryptoEx.totalBalance * 0.5)));
          if (stockEx) setStockLiveInput(String(Math.floor(stockEx.totalBalance * 0.5)));
        })
        .catch(() => setExchanges([]))
        .finally(() => setLoadingBalances(false));
    }
  }, [exchanges]);

  const selectedBots = gladiators.filter(g => g.selected);
  const selectedCount = selectedBots.length;
  const progress = selectedCount / MAX_GLADIATORS;

  // Detect session type from selected bots
  const hasCrypto = selectedBots.some(g => (g.assetClass ?? 'crypto') !== 'stocks');
  const hasStocks = selectedBots.some(g => (g.assetClass ?? 'crypto') !== 'crypto');
  const isMixed = hasCrypto && hasStocks;
  const cryptoBotCount = selectedBots.filter(g => (g.assetClass ?? 'crypto') !== 'stocks').length;
  const stockBotCount = selectedBots.filter(g => (g.assetClass ?? 'crypto') !== 'crypto').length;

  const toggleGladiator = useCallback((id: string) => {
    setGladiators(prev =>
      prev.map(g => {
        if (g.id !== id) return g;
        if (!g.selected && selectedCount >= MAX_GLADIATORS) return g;
        return {...g, selected: !g.selected};
      }),
    );
  }, [selectedCount]);

  // Per-bot allocation preview
  const getPerBotPreview = () => {
    if (selectedCount === 0) return null;
    if (arenaMode === 'shadow') {
      if (isMixed) {
        const cBal = parseFloat(cryptoVirtual) || 0;
        const sBal = parseFloat(stockVirtual) || 0;
        const perC = cryptoBotCount > 0 ? cBal / cryptoBotCount : 0;
        const perS = stockBotCount > 0 ? sBal / stockBotCount : 0;
        return `Crypto bots: $${perC.toFixed(0)}/bot · Stock bots: $${perS.toFixed(0)}/bot`;
      }
      const total = parseFloat(singleVirtual) || 0;
      const per = selectedCount > 0 ? total / selectedCount : 0;
      return `$${per.toFixed(0)} per bot (shared from $${total.toLocaleString()})`;
    } else {
      const cBal = parseFloat(cryptoLiveInput) || 0;
      const sBal = parseFloat(stockLiveInput) || 0;
      const parts: string[] = [];
      if (hasCrypto && cBal > 0) parts.push(`Crypto: $${(cBal / Math.max(1, cryptoBotCount)).toFixed(0)}/bot`);
      if (hasStocks && sBal > 0) parts.push(`Stocks: $${(sBal / Math.max(1, stockBotCount)).toFixed(0)}/bot`);
      return parts.length > 0 ? parts.join(' · ') : null;
    }
  };

  const handleEnterArena = useCallback(async () => {
    if (activeSession?.status === 'running') {
      showConfirm({
        title: 'Battle In Progress',
        message: 'You already have an active arena battle. Watch it or wait for it to finish.',
        confirmText: 'Watch Live',
        onConfirm: () => navigation.navigate('ArenaLive', {gladiatorIds: [], sessionId: activeSession.id}),
      });
      return;
    }

    const ids = selectedBots.map(g => g.id);

    // Build balance params
    let vBalance = 10000;
    let cBalance: number | undefined;
    let sBalance: number | undefined;

    if (arenaMode === 'shadow') {
      if (isMixed) {
        cBalance = parseFloat(cryptoVirtual) || 5000;
        sBalance = parseFloat(stockVirtual) || 5000;
        vBalance = cBalance + sBalance;
      } else {
        vBalance = parseFloat(singleVirtual) || 10000;
      }
    } else {
      if (hasCrypto) cBalance = parseFloat(cryptoLiveInput) || 0;
      if (hasStocks) sBalance = parseFloat(stockLiveInput) || 0;
      vBalance = (cBalance ?? 0) + (sBalance ?? 0);
      // Validate
      if (hasCrypto && (!cBalance || cBalance < 10)) {
        showAlert('Invalid Balance', 'Enter a valid crypto balance (min $10).');
        return;
      }
      if (hasStocks && (!sBalance || sBalance < 10)) {
        showAlert('Invalid Balance', 'Enter a valid stock balance (min $10).');
        return;
      }
      const cryptoEx = exchanges.find(c => c.assetClass === 'crypto' && c.status === 'connected');
      const stockEx = exchanges.find(c => c.assetClass === 'stocks' && c.status === 'connected');
      if (hasCrypto && !cryptoEx) {
        showAlert('No Exchange Connected', 'Please connect a crypto exchange before running a live arena battle.');
        return;
      }
      if (hasStocks && !stockEx) {
        showAlert('No Exchange Connected', 'Please connect a stock broker before running a live arena battle.');
        return;
      }
      if (hasCrypto && cryptoEx && cBalance! > cryptoEx.totalBalance) {
        showAlert('Insufficient Balance', `Crypto amount exceeds available $${cryptoEx.totalBalance.toFixed(2)}.`);
        return;
      }
      if (hasStocks && stockEx && sBalance! > stockEx.totalBalance) {
        showAlert('Insufficient Balance', `Stock amount exceeds available $${stockEx.totalBalance.toFixed(2)}.`);
        return;
      }
    }

    const modeLabel = arenaMode === 'live' ? 'LIVE' : 'Shadow';
    const balLabel = isMixed
      ? `Crypto: $${(cBalance ?? 0).toLocaleString()} · Stocks: $${(sBalance ?? 0).toLocaleString()}`
      : `$${vBalance.toLocaleString()} shared`;

    showConfirm({
      title: `${modeLabel} Arena Battle`,
      message: `Start battle with ${ids.length} bots?\n\nBalance: ${balLabel}\nDuration: ${selectedDuration.label}\nPer bot: ${getPerBotPreview() ?? '—'}`,
      confirmText: 'Start Battle',
      onConfirm: async () => {
        setStarting(true);
        navigation.navigate('ArenaLive', {
          gladiatorIds: ids,
          durationSeconds: selectedDuration.seconds,
          mode: arenaMode,
          virtualBalance: vBalance,
          cryptoBalance: cBalance,
          stockBalance: sBalance,
        } as any);
        setStarting(false);
      },
    });
  }, [gladiators, navigation, activeSession, selectedDuration, arenaMode, cryptoVirtual, stockVirtual, singleVirtual, cryptoLiveInput, stockLiveInput, exchanges, isMixed, hasCrypto, hasStocks, selectedBots]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.stickyHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <BackArrow />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>BOT BATTLE ARENA</Text>
        <TouchableOpacity style={styles.headerBtn} onPress={() => showAlert('Bot Battle Arena', 'Select 2–5 bots to compete in a real-time trading arena. The balance is shared equally across all bots in the same asset class. Winner = highest % return from their allocation.')}>
          <InfoCircleIcon />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Select Your Bots</Text>
        <Text style={styles.subtitle}>Pick 2–{MAX_GLADIATORS} bots. The shared balance is split equally between them based on asset class.</Text>

        {/* Active battle banner */}
        {activeSession?.status === 'running' && (
          <TouchableOpacity style={styles.activeBattleBanner} onPress={() => navigation.navigate('ArenaLive', {gladiatorIds: [], sessionId: activeSession.id})} activeOpacity={0.8}>
            <View style={styles.activeBattlePulse}><View style={styles.activeBattleDot} /></View>
            <View style={{flex: 1, marginLeft: 12}}>
              <Text style={styles.activeBattleTitle}>Battle In Progress</Text>
              <Text style={styles.activeBattleSub}>{activeSession.gladiators.length} bots · {Math.round((activeSession.progress ?? 0) * 100)}% complete</Text>
            </View>
            <View style={styles.activeBattleViewBtn}><Text style={styles.activeBattleViewText}>WATCH LIVE</Text></View>
          </TouchableOpacity>
        )}

        {/* Battle Mode */}
        <Text style={styles.sectionLabel}>BATTLE MODE</Text>
        <View style={{flexDirection: 'row', gap: 10, marginBottom: 16}}>
          <TouchableOpacity style={[styles.durationChip, {flex: 1, paddingVertical: 14}, arenaMode === 'shadow' && styles.durationChipActive]} onPress={() => handleModeChange('shadow')} activeOpacity={0.7}>
            <Text style={{fontSize: 18, marginBottom: 4}}>🧪</Text>
            <Text style={[styles.durationChipText, arenaMode === 'shadow' && styles.durationChipTextActive]}>Shadow</Text>
            <Text style={{fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2}}>Virtual funds</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.durationChip, {flex: 1, paddingVertical: 14}, arenaMode === 'live' && {backgroundColor: '#FF6B0020', borderColor: '#FF6B00'}]} onPress={() => handleModeChange('live')} activeOpacity={0.7}>
            <Text style={{fontSize: 18, marginBottom: 4}}>⚡</Text>
            <Text style={[styles.durationChipText, arenaMode === 'live' && {color: '#FF6B00'}]}>Live</Text>
            <Text style={{fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2}}>Real exchange</Text>
          </TouchableOpacity>
        </View>

        {/* ── SHADOW: Balance inputs ── */}
        {arenaMode === 'shadow' && selectedCount >= 2 && (
          <View style={{backgroundColor: '#111827', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)'}}>
            <Text style={styles.sectionLabel}>VIRTUAL BALANCE (SHARED POOL)</Text>
            {isMixed ? (
              <>
                <View style={{backgroundColor: 'rgba(245,158,11,0.08)', borderRadius: 8, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)'}}>
                  <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 12, color: '#F59E0B', marginBottom: 2}}>Mixed Session — Crypto + Stocks</Text>
                  <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 16}}>
                    Set separate pools: {cryptoBotCount} crypto bot{cryptoBotCount !== 1 ? 's' : ''} share the crypto pool, {stockBotCount} stock bot{stockBotCount !== 1 ? 's' : ''} share the stock pool.
                  </Text>
                </View>
                <BalanceInput label={`CRYPTO POOL (÷ ${cryptoBotCount} bots)`} value={cryptoVirtual} onChange={setCryptoVirtual} suffix="virtual" color="#F59E0B" />
                <BalanceInput label={`STOCK POOL (÷ ${stockBotCount} bots)`} value={stockVirtual} onChange={setStockVirtual} suffix="virtual" color="#3B82F6" />
              </>
            ) : hasStocks ? (
              <BalanceInput label={`STOCK POOL (÷ ${selectedCount} bots)`} value={singleVirtual} onChange={setSingleVirtual} suffix="virtual" color="#3B82F6" />
            ) : (
              <BalanceInput label={`CRYPTO POOL (÷ ${selectedCount} bots)`} value={singleVirtual} onChange={setSingleVirtual} suffix="virtual" color="#10B981" />
            )}
          </View>
        )}

        {/* ── LIVE: Exchange cards with real balances ── */}
        {arenaMode === 'live' && selectedCount >= 2 && (
          <View style={{backgroundColor: '#111827', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,107,0,0.15)'}}>
            <Text style={styles.sectionLabel}>LIVE BALANCE (SHARED POOL)</Text>
            {loadingBalances ? (
              <View style={{alignItems: 'center', paddingVertical: 16}}>
                <ActivityIndicator size="small" color="#FF6B00" />
                <Text style={{fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 8}}>Fetching exchange balances...</Text>
              </View>
            ) : (
              <>
                <View style={{backgroundColor: '#FF6B0010', borderRadius: 8, padding: 10, marginBottom: 14, borderWidth: 1, borderColor: '#FF6B0030'}}>
                  <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 12, color: '#FF6B00', marginBottom: 2}}>⚡ Live Mode — Real Money</Text>
                  <Text style={{fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 16}}>
                    Arena bots use your connected exchange balance. Amount cannot exceed what's available.
                  </Text>
                </View>

                {/* Crypto exchange block */}
                {hasCrypto && (() => {
                  const cryptoEx = exchanges.find(c => c.assetClass === 'crypto' && c.status === 'connected');
                  const parsedCrypto = parseFloat(cryptoLiveInput) || 0;
                  const cryptoError = cryptoEx && parsedCrypto > cryptoEx.totalBalance;
                  return (
                    <View style={{marginBottom: 14}}>
                      <Text style={{fontFamily: 'Inter-Medium', fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5, marginBottom: 8}}>CRYPTO POOL (÷ {cryptoBotCount} bot{cryptoBotCount !== 1 ? 's' : ''})</Text>
                      {cryptoEx ? (
                        <View style={{backgroundColor: '#0D1117', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 10}}>
                          <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
                            <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                              <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981'}} />
                              <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF'}}>{cryptoEx.provider.charAt(0).toUpperCase() + cryptoEx.provider.slice(1)}</Text>
                              {cryptoEx.sandbox && (
                                <View style={{backgroundColor: 'rgba(245,158,11,0.15)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2}}>
                                  <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 9, color: '#F59E0B', letterSpacing: 0.5}}>TEST</Text>
                                </View>
                              )}
                            </View>
                            <Text style={{fontFamily: 'Inter-Bold', fontSize: 15, color: '#FFFFFF'}}>${cryptoEx.totalBalance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</Text>
                          </View>
                          <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 4}}>Available balance</Text>
                        </View>
                      ) : (
                        <View style={{backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)', marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 10}}>
                          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                            <Path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#EF4444" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                          </Svg>
                          <Text style={{fontFamily: 'Inter-Medium', fontSize: 12, color: '#EF4444', flex: 1}}>No crypto exchange connected. Go to Exchange Settings to connect one.</Text>
                        </View>
                      )}
                      {cryptoEx && (
                        <>
                          <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#161B22', borderRadius: 10, borderWidth: 1, borderColor: cryptoError ? '#EF4444' : 'rgba(255,255,255,0.08)', paddingHorizontal: 14}}>
                            <Text style={{fontFamily: 'Inter-Bold', fontSize: 16, color: 'rgba(255,255,255,0.4)', marginRight: 4}}>$</Text>
                            <TextInput
                              style={{flex: 1, color: '#FFFFFF', fontFamily: 'Inter-SemiBold', fontSize: 16, paddingVertical: 12}}
                              value={cryptoLiveInput}
                              onChangeText={setCryptoLiveInput}
                              keyboardType="numeric"
                              placeholder="0"
                              placeholderTextColor="rgba(255,255,255,0.2)"
                            />
                            <TouchableOpacity onPress={() => setCryptoLiveInput(String(Math.floor(cryptoEx.totalBalance)))}>
                              <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 11, color: '#F59E0B'}}>MAX</Text>
                            </TouchableOpacity>
                          </View>
                          {cryptoError && <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: '#EF4444', marginTop: 4}}>Exceeds available balance of ${cryptoEx.totalBalance.toFixed(2)}</Text>}
                        </>
                      )}
                    </View>
                  );
                })()}

                {/* Stock exchange block */}
                {hasStocks && (() => {
                  const stockEx = exchanges.find(c => c.assetClass === 'stocks' && c.status === 'connected');
                  const parsedStock = parseFloat(stockLiveInput) || 0;
                  const stockError = stockEx && parsedStock > stockEx.totalBalance;
                  return (
                    <View style={{marginBottom: 6}}>
                      <Text style={{fontFamily: 'Inter-Medium', fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5, marginBottom: 8}}>STOCK POOL (÷ {stockBotCount} bot{stockBotCount !== 1 ? 's' : ''})</Text>
                      {stockEx ? (
                        <View style={{backgroundColor: '#0D1117', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 10}}>
                          <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
                            <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                              <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981'}} />
                              <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF'}}>{stockEx.provider.charAt(0).toUpperCase() + stockEx.provider.slice(1)}</Text>
                              {stockEx.sandbox && (
                                <View style={{backgroundColor: 'rgba(245,158,11,0.15)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2}}>
                                  <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 9, color: '#F59E0B', letterSpacing: 0.5}}>TEST</Text>
                                </View>
                              )}
                            </View>
                            <Text style={{fontFamily: 'Inter-Bold', fontSize: 15, color: '#FFFFFF'}}>${stockEx.totalBalance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</Text>
                          </View>
                          <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 4}}>Available balance</Text>
                        </View>
                      ) : (
                        <View style={{backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)', marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 10}}>
                          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                            <Path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#EF4444" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                          </Svg>
                          <Text style={{fontFamily: 'Inter-Medium', fontSize: 12, color: '#EF4444', flex: 1}}>No stock broker connected. Go to Exchange Settings to connect one.</Text>
                        </View>
                      )}
                      {stockEx && (
                        <>
                          <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#161B22', borderRadius: 10, borderWidth: 1, borderColor: stockError ? '#EF4444' : 'rgba(255,255,255,0.08)', paddingHorizontal: 14}}>
                            <Text style={{fontFamily: 'Inter-Bold', fontSize: 16, color: 'rgba(255,255,255,0.4)', marginRight: 4}}>$</Text>
                            <TextInput
                              style={{flex: 1, color: '#FFFFFF', fontFamily: 'Inter-SemiBold', fontSize: 16, paddingVertical: 12}}
                              value={stockLiveInput}
                              onChangeText={setStockLiveInput}
                              keyboardType="numeric"
                              placeholder="0"
                              placeholderTextColor="rgba(255,255,255,0.2)"
                            />
                            <TouchableOpacity onPress={() => setStockLiveInput(String(Math.floor(stockEx.totalBalance)))}>
                              <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 11, color: '#3B82F6'}}>MAX</Text>
                            </TouchableOpacity>
                          </View>
                          {stockError && <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: '#EF4444', marginTop: 4}}>Exceeds available balance of ${stockEx.totalBalance.toFixed(2)}</Text>}
                        </>
                      )}
                    </View>
                  );
                })()}

                {!hasCrypto && !hasStocks && (
                  <Text style={{fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center', paddingVertical: 8}}>Select bots above to configure balances.</Text>
                )}
              </>
            )}
          </View>
        )}

        {/* Per-bot allocation preview */}
        {selectedCount >= 2 && getPerBotPreview() && (
          <View style={{backgroundColor: 'rgba(16,185,129,0.06)', borderRadius: 10, padding: 10, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(16,185,129,0.15)', flexDirection: 'row', alignItems: 'center', gap: 8}}>
            <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: '#10B981'}}>⚖️ Allocation: {getPerBotPreview()}</Text>
          </View>
        )}

        {/* Duration */}
        <Text style={styles.sectionLabel}>BATTLE DURATION</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.durationScroll} contentContainerStyle={styles.durationScrollContent}>
          {DURATION_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.seconds}
              style={[styles.durationChip, selectedDuration.seconds === opt.seconds && styles.durationChipActive]}
              onPress={() => setSelectedDuration(opt)}
              activeOpacity={0.7}>
              <Text style={[styles.durationChipText, selectedDuration.seconds === opt.seconds && styles.durationChipTextActive]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Bot list */}
        {loading ? (
          <ActivityIndicator size="large" color="#10B981" style={{marginTop: 40}} />
        ) : gladiators.length === 0 ? (
          <Text style={{fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 40}}>No bots available for arena battles.</Text>
        ) : null}

        {gladiators.map(item => {
          const ac = item.assetClass ?? 'crypto';
          const assetBadgeColor = ac === 'stocks' ? '#3B82F6' : ac === 'mixed' ? '#F59E0B' : '#10B981';
          const assetLabel = ac === 'stocks' ? 'STOCK' : ac === 'mixed' ? 'MIXED' : 'CRYPTO';
          return (
            <TouchableOpacity key={item.id} style={[styles.card, item.selected && styles.cardSelected]} onPress={() => toggleGladiator(item.id)} activeOpacity={0.8}>
              <View style={styles.avatarWrap}>
                <BotFaceAvatar color={item.avatarColor} size={50} />
                <View style={[styles.levelBadge, {backgroundColor: item.avatarColor}]}>
                  <Text style={styles.levelText}>LVL {item.level}</Text>
                </View>
              </View>
              <View style={styles.cardInfo}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3}}>
                  <Text style={styles.cardName}>{item.name}</Text>
                  <View style={{backgroundColor: assetBadgeColor + '22', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4}}>
                    <Text style={{fontFamily: 'Inter-Bold', fontSize: 8, color: assetBadgeColor, letterSpacing: 0.3}}>{assetLabel}</Text>
                  </View>
                </View>
                <View style={styles.cardMeta}>
                  <Text style={styles.strategyText}>{item.strategy}</Text>
                  {item.statLabel ? <><Text style={styles.metaSep}> · </Text><Text style={styles.statLabelText}>{item.statLabel}</Text></> : null}
                </View>
              </View>
              <RadioSelect active={item.selected} />
            </TouchableOpacity>
          );
        })}

        <View style={{height: 12}} />
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.readinessRow}>
          <Text style={styles.readinessLabel}>BATTLE SQUAD READINESS</Text>
          <Text style={styles.readinessCount}>{selectedCount}/{MAX_GLADIATORS} Selected</Text>
        </View>
        <ProgressBar progress={progress} />
        {/* Selection summary */}
        {selectedCount >= 2 && (
          <View style={{flexDirection: 'row', gap: 6, marginBottom: 10, flexWrap: 'wrap'}}>
            {isMixed && <View style={{backgroundColor: 'rgba(245,158,11,0.15)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3}}><Text style={{fontFamily: 'Inter-Medium', fontSize: 10, color: '#F59E0B'}}>Mixed: {cryptoBotCount}C + {stockBotCount}S</Text></View>}
            {!isMixed && hasCrypto && <View style={{backgroundColor: 'rgba(16,185,129,0.12)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3}}><Text style={{fontFamily: 'Inter-Medium', fontSize: 10, color: '#10B981'}}>Crypto only</Text></View>}
            {!isMixed && hasStocks && <View style={{backgroundColor: 'rgba(59,130,246,0.12)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3}}><Text style={{fontFamily: 'Inter-Medium', fontSize: 10, color: '#3B82F6'}}>Stocks only</Text></View>}
            <View style={{backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3}}><Text style={{fontFamily: 'Inter-Medium', fontSize: 10, color: 'rgba(255,255,255,0.5)'}}>{selectedDuration.label}</Text></View>
          </View>
        )}
        <TouchableOpacity
          style={[styles.enterBtn, (selectedCount < 2 || starting) && styles.enterBtnDisabled]}
          onPress={handleEnterArena}
          disabled={selectedCount < 2 || starting}
          activeOpacity={0.85}>
          {starting ? <ActivityIndicator size="small" color="#FFFFFF" /> : <><Text style={styles.enterBtnText}>ENTER ARENA</Text><SwordsIcon /></>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0A0E14'},
  stickyHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 54, paddingBottom: 14, backgroundColor: '#0A0E14'},
  headerBtn: {width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center'},
  headerTitle: {fontFamily: 'Inter-Bold', fontSize: 14, color: '#FFFFFF', letterSpacing: 1.8, textTransform: 'uppercase'},
  scrollContent: {paddingHorizontal: 16, paddingBottom: 8},
  title: {fontFamily: 'Inter-Bold', fontSize: 26, color: '#FFFFFF', marginBottom: 8, letterSpacing: -0.5},
  subtitle: {fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.38)', lineHeight: 20, marginBottom: 22},
  sectionLabel: {fontFamily: 'Inter-Medium', fontSize: 10, letterSpacing: 1.2, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 10},
  card: {flexDirection: 'row', alignItems: 'center', backgroundColor: '#111820', borderRadius: 22, paddingVertical: 14, paddingHorizontal: 14, marginBottom: 10, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.07)'},
  cardSelected: {borderColor: '#10B981', backgroundColor: 'rgba(16,185,129,0.08)'},
  avatarWrap: {marginRight: 14, position: 'relative'},
  levelBadge: {position: 'absolute', bottom: -5, left: 0, right: 0, borderRadius: 6, paddingVertical: 2, alignItems: 'center'},
  levelText: {fontFamily: 'Inter-Bold', fontSize: 7, color: '#FFFFFF', letterSpacing: 0.2, textTransform: 'uppercase'},
  cardInfo: {flex: 1, marginRight: 10},
  cardName: {fontFamily: 'Inter-SemiBold', fontSize: 15, color: '#FFFFFF'},
  cardMeta: {flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap'},
  strategyText: {fontFamily: 'Inter-Regular', fontSize: 12, color: '#10B981'},
  metaSep: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.2)'},
  statLabelText: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.4)'},
  footer: {paddingHorizontal: 20, paddingTop: 14, paddingBottom: 34, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)', backgroundColor: '#0A0E14'},
  readinessRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10},
  readinessLabel: {fontFamily: 'Inter-Medium', fontSize: 10, letterSpacing: 1, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase'},
  readinessCount: {fontFamily: 'Inter-SemiBold', fontSize: 12, color: 'rgba(255,255,255,0.65)'},
  enterBtn: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 54, borderRadius: 14, backgroundColor: '#10B981', shadowColor: '#10B981', shadowOffset: {width: 0, height: 6}, shadowOpacity: 0.4, shadowRadius: 14, elevation: 10},
  enterBtnDisabled: {backgroundColor: '#1C2333', shadowOpacity: 0, elevation: 0},
  enterBtnText: {fontFamily: 'Inter-Bold', fontSize: 15, color: '#FFFFFF', letterSpacing: 2},
  activeBattleBanner: {flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(234,179,8,0.08)', borderRadius: 16, padding: 14, marginBottom: 18, borderWidth: 1, borderColor: 'rgba(234,179,8,0.25)'},
  activeBattlePulse: {width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(234,179,8,0.15)', alignItems: 'center', justifyContent: 'center'},
  activeBattleDot: {width: 12, height: 12, borderRadius: 6, backgroundColor: '#EAB308'},
  activeBattleTitle: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#EAB308'},
  activeBattleSub: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2},
  activeBattleViewBtn: {backgroundColor: '#EAB308', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6},
  activeBattleViewText: {fontFamily: 'Inter-Bold', fontSize: 10, color: '#0A0E14', letterSpacing: 0.5},
  durationScroll: {marginBottom: 16},
  durationScrollContent: {gap: 8, paddingBottom: 4},
  durationChip: {paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: '#161B22', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center'},
  durationChipActive: {backgroundColor: 'rgba(16,185,129,0.12)', borderColor: '#10B981'},
  durationChipText: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: 'rgba(255,255,255,0.4)'},
  durationChipTextActive: {color: '#10B981'},
});
