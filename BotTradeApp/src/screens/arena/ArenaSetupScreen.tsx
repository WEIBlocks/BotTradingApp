import React, {useState, useCallback, useRef, useEffect} from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, Modal, FlatList,
  KeyboardAvoidingView, Platform, Dimensions,
} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import Svg, {Path, Circle, Rect, Ellipse} from 'react-native-svg';
import {RootStackParamList, Gladiator} from '../../types';
import {arenaApi, ArenaSession} from '../../services/arena';
import {api} from '../../services/api';
import {useToast} from '../../context/ToastContext';
import {useIAP} from '../../context/IAPContext';
import {useAuth} from '../../context/AuthContext';

const {height: SH} = Dimensions.get('window');

interface ExchangeInfo {
  id: string;
  provider: string;
  assetClass: 'crypto' | 'stocks';
  totalBalance: number;
  status: string;
  sandbox: boolean;
}

type NavProp = NativeStackNavigationProp<RootStackParamList>;
const READINESS_BAR_FULL_AT = 8;
const PAGE_SIZE = 20;

// Duration mode: preset chips OR custom date-based OR unlimited
type DurationMode = 'preset' | 'custom' | 'unlimited';

interface DurationState {
  mode: DurationMode;
  presetSeconds: number;   // used when mode='preset'
  customSeconds: number;   // computed from date picker when mode='custom'
  // date picker fields
  months: string;
  days: string;
  hours: string;
  minutes: string;
}

const PRESETS = [
  {label: '5 Min',   seconds: 300},
  {label: '15 Min',  seconds: 900},
  {label: '1 Hour',  seconds: 3600},
  {label: '6 Hours', seconds: 21600},
  {label: '24 Hours',seconds: 86400},
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
function SearchIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={8} stroke="rgba(255,255,255,0.4)" strokeWidth={1.8} />
      <Path d="M21 21l-4.35-4.35" stroke="rgba(255,255,255,0.4)" strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}
function CloseIcon({size = 16, color = 'rgba(255,255,255,0.6)'}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M18 6L6 18M6 6l12 12" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
function FilterIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d="M3 6h18M7 12h10M11 18h2" stroke="rgba(255,255,255,0.6)" strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}
function CheckIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Path d="M20 6L9 17l-5-5" stroke="#FFFFFF" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
function BotFaceAvatar({color, size = 44}: {color: string; size?: number}) {
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

// ─── Balance Input ─────────────────────────────────────────────────────────────

function BalanceInput({label, value, onChange, max, suffix, color = '#10B981'}: {
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
          value={value} onChangeText={onChange} keyboardType="numeric"
          placeholder="0" placeholderTextColor="rgba(255,255,255,0.2)"
        />
        {suffix ? <Text style={{fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.35)', marginLeft: 4}}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

// ─── Duration section ──────────────────────────────────────────────────────────

function DurationSection({dur, setDur}: {dur: DurationState; setDur: (d: DurationState) => void}) {
  const tabs: {key: DurationMode; label: string}[] = [
    {key: 'preset',    label: 'Preset'},
    {key: 'custom',    label: 'Custom'},
    {key: 'unlimited', label: '∞ Unlimited'},
  ];

  // Recompute customSeconds whenever fields change
  const recompute = (m: string, d: string, h: string, min: string) => {
    const secs =
      (parseInt(m, 10) || 0) * 30 * 24 * 3600 +
      (parseInt(d, 10) || 0) * 24 * 3600 +
      (parseInt(h, 10) || 0) * 3600 +
      (parseInt(min, 10) || 0) * 60;
    return Math.max(60, secs);
  };

  const setField = (field: 'months' | 'days' | 'hours' | 'minutes', val: string) => {
    const next = {...dur, [field]: val.replace(/[^0-9]/g, '')};
    next.customSeconds = recompute(next.months, next.days, next.hours, next.minutes);
    setDur(next);
  };

  const formatCustom = () => {
    const parts: string[] = [];
    if (parseInt(dur.months, 10) > 0) parts.push(`${dur.months}mo`);
    if (parseInt(dur.days, 10) > 0) parts.push(`${dur.days}d`);
    if (parseInt(dur.hours, 10) > 0) parts.push(`${dur.hours}h`);
    if (parseInt(dur.minutes, 10) > 0) parts.push(`${dur.minutes}m`);
    return parts.length > 0 ? parts.join(' ') : '—';
  };

  return (
    <View style={{marginBottom: 20}}>
      <Text style={S.sectionLabel}>BATTLE DURATION</Text>

      {/* Tab row */}
      <View style={durSt.tabRow}>
        {tabs.map(t => {
          const active = dur.mode === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[durSt.tab, active && (t.key === 'unlimited' ? durSt.tabUnlimitedActive : durSt.tabActive)]}
              onPress={() => setDur({...dur, mode: t.key})}
              activeOpacity={0.75}>
              <Text style={[durSt.tabText, active && (t.key === 'unlimited' ? durSt.tabUnlimitedText : durSt.tabTextActive)]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Preset chips */}
      {dur.mode === 'preset' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap: 8, paddingBottom: 4}}>
          {PRESETS.map(opt => {
            const active = dur.presetSeconds === opt.seconds;
            return (
              <TouchableOpacity
                key={opt.seconds}
                style={[durSt.chip, active && durSt.chipActive]}
                onPress={() => setDur({...dur, presetSeconds: opt.seconds})}
                activeOpacity={0.7}>
                <Text style={[durSt.chipText, active && durSt.chipTextActive]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Custom duration picker */}
      {dur.mode === 'custom' && (
        <View style={durSt.customCard}>
          <Text style={durSt.customTitle}>Set a custom duration</Text>
          <View style={durSt.customRow}>
            {([
              {field: 'months', label: 'Months', max: 12},
              {field: 'days',   label: 'Days',   max: 31},
              {field: 'hours',  label: 'Hours',  max: 23},
              {field: 'minutes',label: 'Min',    max: 59},
            ] as const).map(({field, label}) => (
              <View key={field} style={durSt.customField}>
                <Text style={durSt.customFieldLabel}>{label}</Text>
                <TextInput
                  style={durSt.customInput}
                  value={dur[field]}
                  onChangeText={v => setField(field, v)}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor="rgba(255,255,255,0.2)"
                  maxLength={2}
                />
              </View>
            ))}
          </View>
          {dur.customSeconds >= 60 && (
            <View style={durSt.customPreview}>
              <Text style={durSt.customPreviewLabel}>Total: </Text>
              <Text style={durSt.customPreviewValue}>{formatCustom()}</Text>
            </View>
          )}
          {dur.customSeconds < 60 && (
            <Text style={durSt.customHint}>Minimum 1 minute</Text>
          )}
        </View>
      )}

      {/* Unlimited */}
      {dur.mode === 'unlimited' && (
        <View style={durSt.unlimitedCard}>
          <View style={durSt.unlimitedIcon}>
            <Text style={{fontSize: 22}}>∞</Text>
          </View>
          <View style={{flex: 1}}>
            <Text style={durSt.unlimitedTitle}>Unlimited Duration</Text>
            <Text style={durSt.unlimitedSub}>Battle runs until you manually stop it. Pause and resume anytime.</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const durSt = StyleSheet.create({
  tabRow: {flexDirection: 'row', gap: 8, marginBottom: 14},
  tab: {flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#161B22', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center'},
  tabActive: {backgroundColor: 'rgba(16,185,129,0.12)', borderColor: '#10B981'},
  tabUnlimitedActive: {backgroundColor: '#10B981', borderColor: '#10B981'},
  tabText: {fontFamily: 'Inter-SemiBold', fontSize: 12, color: 'rgba(255,255,255,0.45)'},
  tabTextActive: {color: '#10B981'},
  tabUnlimitedText: {color: '#FFFFFF'},
  chip: {paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: '#161B22', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)'},
  chipActive: {backgroundColor: 'rgba(16,185,129,0.12)', borderColor: '#10B981'},
  chipText: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: 'rgba(255,255,255,0.45)'},
  chipTextActive: {color: '#10B981'},
  customCard: {backgroundColor: '#111827', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)'},
  customTitle: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#FFFFFF', marginBottom: 14},
  customRow: {flexDirection: 'row', gap: 10},
  customField: {flex: 1, alignItems: 'center'},
  customFieldLabel: {fontFamily: 'Inter-Medium', fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5, marginBottom: 6, textTransform: 'uppercase'},
  customInput: {
    width: '100%', backgroundColor: '#161B22', borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 20,
    textAlign: 'center', paddingVertical: 12,
  },
  customPreview: {flexDirection: 'row', alignItems: 'center', marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)'},
  customPreviewLabel: {fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.5)'},
  customPreviewValue: {fontFamily: 'Inter-Bold', fontSize: 15, color: '#10B981'},
  customHint: {fontFamily: 'Inter-Regular', fontSize: 11, color: '#EF4444', marginTop: 10},
  unlimitedCard: {flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: 'rgba(16,185,129,0.07)', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)'},
  unlimitedIcon: {width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(16,185,129,0.15)', alignItems: 'center', justifyContent: 'center'},
  unlimitedTitle: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#10B981', marginBottom: 4},
  unlimitedSub: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 17},
});

// ─── Bot Picker Modal ──────────────────────────────────────────────────────────

interface BotPickerProps {
  visible: boolean;
  selectedIds: Set<string>;
  onToggle: (bot: Gladiator) => void;
  onDone: () => void;
  onClose: () => void;
}

function BotPickerModal({visible, selectedIds, onToggle, onDone, onClose}: BotPickerProps) {
  const [bots, setBots] = useState<Gladiator[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [assetFilter, setAssetFilter] = useState<'all' | 'crypto' | 'stocks'>('all');
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSearch = useRef('');
  const activeFilter = useRef<'all' | 'crypto' | 'stocks'>('all');

  const load = useCallback(async (newSearch: string, newFilter: 'all' | 'crypto' | 'stocks', newPage: number, append: boolean) => {
    if (newPage === 1) { setLoadingInitial(true); setError(null); } else setLoadingMore(true);
    try {
      const res = await arenaApi.getAvailableBots({
        search: newSearch || undefined,
        page: newPage,
        pageSize: PAGE_SIZE,
        assetClass: newFilter,
      });
      if (append) {
        setBots(prev => {
          const existingIds = new Set(prev.map(b => b.id));
          const fresh = res.bots.filter(b => !existingIds.has(b.id));
          return [...prev, ...fresh];
        });
      } else {
        setBots(res.bots);
      }
      setTotal(res.total);
      setPage(newPage);
      setHasMore(res.hasMore);
    } catch (err: any) {
      const msg = err?.message ?? 'Failed to load bots';
      if (newPage === 1) setError(msg);
    } finally {
      setLoadingInitial(false);
      setLoadingMore(false);
    }
  }, []);

  // Initial load when modal opens
  useEffect(() => {
    if (visible) {
      setSearch('');
      setAssetFilter('all');
      setPage(1);
      activeSearch.current = '';
      activeFilter.current = 'all';
      load('', 'all', 1, false);
    }
  }, [visible, load]);

  const handleSearch = useCallback((text: string) => {
    setSearch(text);
    activeSearch.current = text;
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => {
      setPage(1);
      load(text, activeFilter.current, 1, false);
    }, 350);
  }, [load]);

  const handleFilter = useCallback((f: 'all' | 'crypto' | 'stocks') => {
    setAssetFilter(f);
    activeFilter.current = f;
    setPage(1);
    load(activeSearch.current, f, 1, false);
  }, [load]);

  const handleLoadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    const nextPage = page + 1;
    load(activeSearch.current, activeFilter.current, nextPage, true);
  }, [loadingMore, hasMore, page, load]);

  const selectedCount = selectedIds.size;

  const renderItem = useCallback(({item}: {item: Gladiator}) => {
    const ac = item.assetClass ?? 'crypto';
    const badgeColor = ac === 'stocks' ? '#3B82F6' : '#10B981';
    const badgeLabel = ac === 'stocks' ? 'STOCK' : 'CRYPTO';
    const isSelected = selectedIds.has(item.id);
    return (
      <TouchableOpacity
        style={[botPickSt.row, isSelected && botPickSt.rowSelected]}
        onPress={() => onToggle(item)}
        activeOpacity={0.8}>
        <BotFaceAvatar color={item.avatarColor ?? '#10B981'} size={42} />
        <View style={{flex: 1, marginLeft: 12, minWidth: 0}}>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2}}>
            <Text style={botPickSt.name}>{item.name}</Text>
            <View style={[botPickSt.badge, {backgroundColor: badgeColor + '22'}]}>
              <Text style={[botPickSt.badgeText, {color: badgeColor}]}>{badgeLabel}</Text>
            </View>
          </View>
          <Text style={botPickSt.strategy} numberOfLines={1}>{item.strategy}</Text>
        </View>
        <View style={[botPickSt.check, isSelected && botPickSt.checkActive]}>
          {isSelected && <CheckIcon />}
        </View>
      </TouchableOpacity>
    );
  }, [selectedIds, onToggle]);

  const filters: {key: 'all' | 'crypto' | 'stocks'; label: string}[] = [
    {key: 'all', label: 'All'},
    {key: 'crypto', label: 'Crypto'},
    {key: 'stocks', label: 'Stocks'},
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={botPickSt.overlay}>
        {/* Backdrop tap to close */}
        <TouchableOpacity style={botPickSt.backdrop} activeOpacity={1} onPress={onClose} />

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[botPickSt.sheet, {flex: 1}]}>
          {/* Handle */}
          <View style={botPickSt.handle} />

          {/* Header */}
          <View style={botPickSt.header}>
            <View style={{flex: 1, marginRight: 12}}>
              <Text style={botPickSt.headerTitle}>Select Bots</Text>
              <Text style={botPickSt.headerSub}>
                {selectedCount === 0 ? 'Pick 2 or more to battle' : `${selectedCount} selected · ${total} available`}
              </Text>
            </View>
            <TouchableOpacity
              style={[botPickSt.doneBtn, selectedCount >= 2 && botPickSt.doneBtnActive]}
              onPress={onDone}
              disabled={selectedCount < 2}>
              <Text style={[botPickSt.doneBtnText, selectedCount >= 2 && botPickSt.doneBtnTextActive]}>
                Done {selectedCount >= 2 ? `(${selectedCount})` : ''}
              </Text>
            </TouchableOpacity>
            {/* Close X */}
            <TouchableOpacity onPress={onClose} style={botPickSt.closeBtn} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
              <CloseIcon size={18} color="rgba(255,255,255,0.5)" />
            </TouchableOpacity>
          </View>

          {/* Search bar */}
          <View style={botPickSt.searchRow}>
            <View style={botPickSt.searchBox}>
              <SearchIcon />
              <TextInput
                style={botPickSt.searchInput}
                value={search}
                onChangeText={handleSearch}
                placeholder="Search by name, strategy..."
                placeholderTextColor="rgba(255,255,255,0.3)"
                returnKeyType="search"
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => handleSearch('')}>
                  <CloseIcon size={14} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Asset class filter chips */}
          <View style={botPickSt.filterRow}>
            {filters.map(f => (
              <TouchableOpacity
                key={f.key}
                style={[botPickSt.filterChip, assetFilter === f.key && botPickSt.filterChipActive]}
                onPress={() => handleFilter(f.key)}>
                <Text style={[botPickSt.filterChipText, assetFilter === f.key && botPickSt.filterChipTextActive]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
            {total > 0 && (
              <Text style={botPickSt.totalText}>{total} bots</Text>
            )}
          </View>

          {/* Bot list */}
          {loadingInitial ? (
            <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
              <ActivityIndicator size="large" color="#10B981" />
              <Text style={{fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 12}}>
                Loading bots...
              </Text>
            </View>
          ) : error ? (
            <View style={{flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32}}>
              <Text style={{fontSize: 36, marginBottom: 12}}>⚠️</Text>
              <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 15, color: '#EF4444', textAlign: 'center', marginBottom: 6}}>
                Failed to load bots
              </Text>
              <Text style={{fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginBottom: 20}}>
                {error}
              </Text>
              <TouchableOpacity
                style={{backgroundColor: '#10B981', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10}}
                onPress={() => load(activeSearch.current, activeFilter.current, 1, false)}>
                <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF'}}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : bots.length === 0 ? (
            <View style={{flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32}}>
              <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 15, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginBottom: 6}}>
                No bots found
              </Text>
              <Text style={{fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.3)', textAlign: 'center'}}>
                {search ? `No results for "${search}"` : 'No bots available in this category'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={bots}
              keyExtractor={(item, index) => `${item.id}-${index}`}
              renderItem={renderItem}
              style={{flex: 1}}
              contentContainerStyle={{paddingHorizontal: 16, paddingBottom: 24}}
              showsVerticalScrollIndicator={false}
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.3}
              ListFooterComponent={loadingMore ? (
                <View style={{paddingVertical: 16, alignItems: 'center'}}>
                  <ActivityIndicator size="small" color="#10B981" />
                </View>
              ) : hasMore ? (
                <TouchableOpacity style={botPickSt.loadMoreBtn} onPress={handleLoadMore}>
                  <Text style={botPickSt.loadMoreText}>Load more</Text>
                </TouchableOpacity>
              ) : bots.length > 0 ? (
                <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.2)', textAlign: 'center', paddingVertical: 12}}>
                  All {total} bots loaded
                </Text>
              ) : null}
            />
          )}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const botPickSt = StyleSheet.create({
  overlay: {flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)'},
  backdrop: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0},
  sheet: {backgroundColor: '#0F1117', borderTopLeftRadius: 28, borderTopRightRadius: 28, height: SH * 0.88, paddingTop: 12, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.07)'},
  handle: {width: 40, height: 4, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 2, alignSelf: 'center', marginBottom: 16},
  closeBtn: {width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center', marginLeft: 8},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 14},
  headerTitle: {fontFamily: 'Inter-Bold', fontSize: 18, color: '#FFFFFF'},
  headerSub: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 2},
  doneBtn: {paddingHorizontal: 18, paddingVertical: 9, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)'},
  doneBtnActive: {backgroundColor: '#10B981', borderColor: '#10B981'},
  doneBtnText: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: 'rgba(255,255,255,0.4)'},
  doneBtnTextActive: {color: '#FFFFFF'},
  searchRow: {paddingHorizontal: 16, marginBottom: 12},
  searchBox: {flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#161B22', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 14, height: 44},
  searchInput: {flex: 1, fontFamily: 'Inter-Regular', fontSize: 14, color: '#FFFFFF'},
  filterRow: {flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginBottom: 12},
  filterChip: {paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, backgroundColor: '#161B22', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)'},
  filterChipActive: {backgroundColor: 'rgba(16,185,129,0.12)', borderColor: '#10B981'},
  filterChipText: {fontFamily: 'Inter-SemiBold', fontSize: 12, color: 'rgba(255,255,255,0.45)'},
  filterChipTextActive: {color: '#10B981'},
  totalText: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.3)', marginLeft: 'auto' as any},
  row: {flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)'},
  rowSelected: {backgroundColor: 'rgba(16,185,129,0.05)', borderRadius: 12, marginHorizontal: -4, paddingHorizontal: 4},
  name: {flexShrink: 1, fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF'},
  strategy: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.45)'},
  badge: {flexShrink: 0, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4},
  badgeText: {fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 0.3},
  check: {width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center', justifyContent: 'center', marginLeft: 10, flexShrink: 0},
  checkActive: {backgroundColor: '#10B981', borderColor: '#10B981'},
  loadMoreBtn: {alignItems: 'center', paddingVertical: 14},
  loadMoreText: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#10B981'},
});

// ─── Main Screen ───────────────────────────────────────────────────────────────

export default function ArenaSetupScreen() {
  const navigation = useNavigation<NavProp>();
  const {alert: showAlert, showConfirm} = useToast();
  const {isPro, initialized: iapInitialized} = useIAP();
  const {user} = useAuth();

  React.useEffect(() => {
    if (!iapInitialized) return;
    if (!isPro && user?.role !== 'admin') {
      showAlert('Pro Required', 'Arena battles require an active Pro subscription.');
      navigation.replace('Subscription');
    }
  }, [iapInitialized, isPro, user?.role, navigation, showAlert]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedBotMap, setSelectedBotMap] = useState<Map<string, Gladiator>>(new Map());
  const [activeSessions, setActiveSessions] = useState<ArenaSession[]>([]);
  const [starting, setStarting] = useState(false);
  const [botPickerVisible, setBotPickerVisible] = useState(false);
  const [arenaMode, setArenaMode] = useState<'shadow' | 'live'>('shadow');

  const [dur, setDur] = useState<DurationState>({
    mode: 'preset',
    presetSeconds: 300,
    customSeconds: 300,
    months: '', days: '', hours: '', minutes: '',
  });

  // Shadow balance inputs
  const [cryptoVirtual, setCryptoVirtual] = useState('5000');
  const [stockVirtual, setStockVirtual] = useState('5000');
  const [singleVirtual, setSingleVirtual] = useState('10000');
  const [minOrderInput, setMinOrderInput] = useState('10');

  // Live exchange connections
  const [exchanges, setExchanges] = useState<ExchangeInfo[]>([]);
  const [cryptoLiveInput, setCryptoLiveInput] = useState('');
  const [stockLiveInput, setStockLiveInput] = useState('');
  const [loadingBalances, setLoadingBalances] = useState(false);

  useFocusEffect(useCallback(() => {
    arenaApi.getActiveSessions().catch(() => []).then(setActiveSessions);
  }, []));

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

  // For bot picker: toggle by full Gladiator — keeps both id set and map in sync
  const handlePickerToggle = useCallback((bot: Gladiator) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(bot.id)) { next.delete(bot.id); } else { next.add(bot.id); }
      return next;
    });
    setSelectedBotMap(prev => {
      const next = new Map(prev);
      if (next.has(bot.id)) { next.delete(bot.id); } else { next.set(bot.id, bot); }
      return next;
    });
  }, []);

  const selectedBots = Array.from(selectedBotMap.values()).filter(b => selectedIds.has(b.id));
  const selectedCount = selectedIds.size;

  const hasCrypto = selectedBots.some(g => (g.assetClass ?? 'crypto') !== 'stocks');
  const hasStocks = selectedBots.some(g => (g.assetClass ?? 'crypto') !== 'crypto');
  const isMixed = hasCrypto && hasStocks;
  const cryptoBotCount = selectedBots.filter(g => (g.assetClass ?? 'crypto') !== 'stocks').length;
  const stockBotCount = selectedBots.filter(g => (g.assetClass ?? 'crypto') !== 'crypto').length;
  const progress = Math.min(1, selectedCount / READINESS_BAR_FULL_AT);

  // Resolve final duration
  const getFinalDuration = () => {
    if (dur.mode === 'unlimited') return {seconds: 86400, unlimited: true};
    if (dur.mode === 'custom') return {seconds: dur.customSeconds, unlimited: false};
    return {seconds: dur.presetSeconds, unlimited: false};
  };

  const getDurationLabel = () => {
    if (dur.mode === 'unlimited') return 'Unlimited';
    if (dur.mode === 'custom') {
      const {months, days, hours, minutes} = dur;
      const parts: string[] = [];
      if (parseInt(months, 10) > 0) parts.push(`${months} month${parseInt(months, 10) > 1 ? 's' : ''}`);
      if (parseInt(days, 10) > 0) parts.push(`${days}d`);
      if (parseInt(hours, 10) > 0) parts.push(`${hours}h`);
      if (parseInt(minutes, 10) > 0) parts.push(`${minutes}m`);
      return parts.length > 0 ? parts.join(' ') : '—';
    }
    return PRESETS.find(p => p.seconds === dur.presetSeconds)?.label ?? '5 Min';
  };

  const getPerBotPreview = () => {
    if (selectedCount === 0) return null;
    if (arenaMode === 'shadow') {
      if (isMixed) {
        const perC = cryptoBotCount > 0 ? (parseFloat(cryptoVirtual) || 0) / cryptoBotCount : 0;
        const perS = stockBotCount > 0 ? (parseFloat(stockVirtual) || 0) / stockBotCount : 0;
        return `Crypto: $${perC.toFixed(0)}/bot · Stocks: $${perS.toFixed(0)}/bot`;
      }
      const total = parseFloat(singleVirtual) || 0;
      return `$${(selectedCount > 0 ? total / selectedCount : 0).toFixed(0)} per bot`;
    }
    const cBal = parseFloat(cryptoLiveInput) || 0;
    const sBal = parseFloat(stockLiveInput) || 0;
    const parts: string[] = [];
    if (hasCrypto && cBal > 0) parts.push(`Crypto: $${(cBal / Math.max(1, cryptoBotCount)).toFixed(0)}/bot`);
    if (hasStocks && sBal > 0) parts.push(`Stocks: $${(sBal / Math.max(1, stockBotCount)).toFixed(0)}/bot`);
    return parts.length > 0 ? parts.join(' · ') : null;
  };

  const handleEnterArena = useCallback(async () => {
    const ids = Array.from(selectedIds);
    const {seconds, unlimited} = getFinalDuration();

    if (dur.mode === 'custom' && dur.customSeconds < 60) {
      showAlert('Invalid Duration', 'Custom duration must be at least 1 minute.');
      return;
    }

    let vBalance = 10000, cBalance: number | undefined, sBalance: number | undefined;

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
      if (hasCrypto && (!cBalance || cBalance < 10)) { showAlert('Invalid Balance', 'Enter a valid crypto balance (min $10).'); return; }
      if (hasStocks && (!sBalance || sBalance < 10)) { showAlert('Invalid Balance', 'Enter a valid stock balance (min $10).'); return; }
      const cryptoEx = exchanges.find(c => c.assetClass === 'crypto' && c.status === 'connected');
      const stockEx = exchanges.find(c => c.assetClass === 'stocks' && c.status === 'connected');
      if (hasCrypto && !cryptoEx) { showAlert('No Exchange Connected', 'Connect a crypto exchange first.'); return; }
      if (hasStocks && !stockEx) { showAlert('No Exchange Connected', 'Connect a stock broker first.'); return; }
      if (hasCrypto && cryptoEx && cBalance! > cryptoEx.totalBalance) { showAlert('Insufficient Balance', `Crypto exceeds available $${cryptoEx.totalBalance.toFixed(2)}.`); return; }
      if (hasStocks && stockEx && sBalance! > stockEx.totalBalance) { showAlert('Insufficient Balance', `Stocks exceeds available $${stockEx.totalBalance.toFixed(2)}.`); return; }
    }

    const modeLabel = arenaMode === 'live' ? 'LIVE' : 'Shadow';
    const balLabel = isMixed ? `Crypto: $${(cBalance ?? 0).toLocaleString()} · Stocks: $${(sBalance ?? 0).toLocaleString()}` : `$${vBalance.toLocaleString()} shared`;

    showConfirm({
      title: `${modeLabel} Arena Battle`,
      message: `Start battle with ${ids.length} bots?\n\nBalance: ${balLabel}\nDuration: ${getDurationLabel()}\nPer bot: ${getPerBotPreview() ?? '—'}`,
      confirmText: 'Start Battle',
      onConfirm: async () => {
        setStarting(true);
        navigation.navigate('ArenaLive', {
          gladiatorIds: ids,
          durationSeconds: seconds,
          unlimited,
          mode: arenaMode,
          virtualBalance: vBalance,
          cryptoBalance: cBalance,
          stockBalance: sBalance,
          minOrderValue: parseFloat(minOrderInput) || (hasStocks && !hasCrypto ? 1 : 10),
        } as any);
        setStarting(false);
      },
    });
  }, [selectedIds, dur, arenaMode, cryptoVirtual, stockVirtual, singleVirtual, cryptoLiveInput, stockLiveInput, exchanges, isMixed, hasCrypto, hasStocks]);

  const canStart = selectedCount >= 2 && !starting;

  return (
    <View style={S.container}>
      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.headerBtn}>
          <BackArrow />
        </TouchableOpacity>
        <Text style={S.headerTitle}>BOT BATTLE ARENA</Text>
        <TouchableOpacity style={S.headerBtn} onPress={() => showAlert('Bot Battle Arena', 'Select 2+ bots, set a duration, configure balance, then hit Enter Arena. The balance is shared equally across all bots in the same asset class.')}>
          <InfoCircleIcon />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={S.scroll}>

        {/* Active battles */}
        {activeSessions.length > 0 && (
          <View style={{marginBottom: 20, gap: 8}}>
            <Text style={S.sectionLabel}>ACTIVE BATTLES ({activeSessions.length})</Text>
            {activeSessions.map(s => {
              const isPaused = s.status === 'paused';
              return (
                <TouchableOpacity
                  key={s.id}
                  style={[S.activeBanner, isPaused && {borderColor: 'rgba(245,158,11,0.3)', backgroundColor: 'rgba(245,158,11,0.06)'}]}
                  onPress={() => navigation.navigate('ArenaLive', {gladiatorIds: [], sessionId: s.id})}
                  activeOpacity={0.8}>
                  <View style={[S.activePulse, isPaused && {backgroundColor: 'rgba(245,158,11,0.15)'}]}>
                    <View style={[S.activeDot, isPaused && {backgroundColor: '#F59E0B'}]} />
                  </View>
                  <View style={{flex: 1, marginLeft: 12}}>
                    <Text style={[S.activeBannerTitle, isPaused && {color: '#F59E0B'}]}>
                      {isPaused ? 'Battle Paused' : 'Battle In Progress'}
                    </Text>
                    <Text style={S.activeBannerSub}>
                      {s.gladiators.length} bots · {s.unlimited ? '∞ Unlimited' : `${Math.round((s.progress ?? 0) * 100)}% complete`}
                    </Text>
                  </View>
                  <View style={[S.activeBannerBtn, isPaused && {backgroundColor: 'rgba(245,158,11,0.15)', borderColor: 'rgba(245,158,11,0.3)'}]}>
                    <Text style={[S.activeBannerBtnText, isPaused && {color: '#F59E0B'}]}>
                      {isPaused ? 'RESUME' : 'WATCH'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Battle Mode */}
        <Text style={S.sectionLabel}>BATTLE MODE</Text>
        <View style={{flexDirection: 'row', gap: 10, marginBottom: 20}}>
          <TouchableOpacity
            style={[S.modeChip, arenaMode === 'shadow' && S.modeChipActive]}
            onPress={() => handleModeChange('shadow')} activeOpacity={0.75}>
            <Text style={{fontSize: 20, marginBottom: 4}}>🧪</Text>
            <Text style={[S.modeChipLabel, arenaMode === 'shadow' && S.modeChipLabelActive]}>Shadow</Text>
            <Text style={S.modeChipSub}>Virtual funds</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[S.modeChip, arenaMode === 'live' && {backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.4)'}]}
            onPress={() => handleModeChange('live')} activeOpacity={0.75}>
            <Text style={{fontSize: 20, marginBottom: 4}}>⚡</Text>
            <Text style={[S.modeChipLabel, arenaMode === 'live' && {color: '#EF4444'}]}>Live</Text>
            <Text style={S.modeChipSub}>Real exchange</Text>
          </TouchableOpacity>
        </View>

        {/* Duration */}
        <DurationSection dur={dur} setDur={setDur} />

        {/* Bot Selector */}
        <Text style={S.sectionLabel}>BATTLE BOTS</Text>
        <TouchableOpacity
          style={S.botSelectorBtn}
          onPress={() => setBotPickerVisible(true)}
          activeOpacity={0.8}>
          <View style={S.botSelectorLeft}>
            {selectedCount === 0 ? (
              <>
                <View style={S.botSelectorIconBox}>
                  <FilterIcon />
                </View>
                <View>
                  <Text style={S.botSelectorLabel}>Select Bots</Text>
                  <Text style={S.botSelectorSub}>Pick 2 or more bots to battle</Text>
                </View>
              </>
            ) : (
              <>
                <View style={[S.botSelectorIconBox, {backgroundColor: 'rgba(16,185,129,0.15)'}]}>
                  <Text style={{fontFamily: 'Inter-Bold', fontSize: 16, color: '#10B981'}}>{selectedCount}</Text>
                </View>
                <View>
                  <Text style={[S.botSelectorLabel, {color: '#10B981'}]}>{selectedCount} Bots Selected</Text>
                  <Text style={S.botSelectorSub}>
                    {isMixed ? `${cryptoBotCount} crypto · ${stockBotCount} stock` : hasCrypto ? 'Crypto bots' : 'Stock bots'}
                  </Text>
                </View>
              </>
            )}
          </View>
          <View style={[S.botSelectorArrow, selectedCount >= 2 && {backgroundColor: 'rgba(16,185,129,0.15)', borderColor: 'rgba(16,185,129,0.3)'}]}>
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
              <Path d="M9 18l6-6-6-6" stroke={selectedCount >= 2 ? '#10B981' : 'rgba(255,255,255,0.4)'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </View>
        </TouchableOpacity>

        {/* Selected bot chips */}
        {selectedCount > 0 && (
          <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, marginBottom: 4}}>
            {Array.from(selectedIds).map(id => {
              const bot = selectedBotMap.get(id);
              if (!bot) return null;
              const ac = bot.assetClass ?? 'crypto';
              const color = ac === 'stocks' ? '#3B82F6' : '#10B981';
              return (
                <View key={id} style={[S.botChip, {borderColor: color + '40', backgroundColor: color + '10'}]}>
                  <View style={{width: 6, height: 6, borderRadius: 3, backgroundColor: color}} />
                  <Text style={[S.botChipText, {color}]} numberOfLines={1}>{bot.name}</Text>
                  <TouchableOpacity onPress={() => handlePickerToggle(bot)} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                    <CloseIcon size={12} color={color} />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {/* Balance config */}
        {selectedCount >= 2 && (
          <View style={{marginTop: 20}}>
            {arenaMode === 'shadow' ? (
              <View style={S.balanceCard}>
                <Text style={S.sectionLabel}>VIRTUAL BALANCE (SHARED POOL)</Text>
                {isMixed ? (
                  <>
                    <View style={S.mixedBanner}>
                      <Text style={S.mixedBannerTitle}>Mixed Session — Crypto + Stocks</Text>
                      <Text style={S.mixedBannerSub}>{cryptoBotCount} crypto bot{cryptoBotCount !== 1 ? 's' : ''} share the crypto pool, {stockBotCount} stock bot{stockBotCount !== 1 ? 's' : ''} share the stock pool.</Text>
                    </View>
                    <BalanceInput label={`CRYPTO POOL (÷ ${cryptoBotCount} bots)`} value={cryptoVirtual} onChange={setCryptoVirtual} suffix="virtual" color="#10B981" />
                    <BalanceInput label={`STOCK POOL (÷ ${stockBotCount} bots)`} value={stockVirtual} onChange={setStockVirtual} suffix="virtual" color="#3B82F6" />
                  </>
                ) : hasStocks ? (
                  <BalanceInput label={`STOCK POOL (÷ ${selectedCount} bots)`} value={singleVirtual} onChange={setSingleVirtual} suffix="virtual" color="#3B82F6" />
                ) : (
                  <BalanceInput label={`CRYPTO POOL (÷ ${selectedCount} bots)`} value={singleVirtual} onChange={setSingleVirtual} suffix="virtual" color="#10B981" />
                )}
              </View>
            ) : (
              <View style={[S.balanceCard, {borderColor: 'rgba(239,68,68,0.2)'}]}>
                <Text style={S.sectionLabel}>LIVE BALANCE (SHARED POOL)</Text>
                {loadingBalances ? (
                  <View style={{alignItems: 'center', paddingVertical: 16}}>
                    <ActivityIndicator size="small" color="#EF4444" />
                    <Text style={{fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 8}}>Fetching exchange balances...</Text>
                  </View>
                ) : (
                  <>
                    <View style={S.liveBanner}>
                      <Text style={S.liveBannerTitle}>⚡ Live Mode — Real Money</Text>
                      <Text style={S.liveBannerSub}>Arena bots use your connected exchange balance.</Text>
                    </View>
                    {hasCrypto && (() => {
                      const ex = exchanges.find(c => c.assetClass === 'crypto' && c.status === 'connected');
                      const err = ex && parseFloat(cryptoLiveInput) > ex.totalBalance;
                      return (
                        <View style={{marginBottom: 14}}>
                          <Text style={S.poolLabel}>CRYPTO POOL (÷ {cryptoBotCount} bot{cryptoBotCount !== 1 ? 's' : ''})</Text>
                          {ex ? (
                            <View style={S.exchangeCard}>
                              <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                                <Text style={S.exchangeName}>{ex.provider.charAt(0).toUpperCase() + ex.provider.slice(1)}</Text>
                                <Text style={S.exchangeBal}>${ex.totalBalance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</Text>
                              </View>
                              <Text style={S.exchangeAvail}>Available</Text>
                            </View>
                          ) : (
                            <View style={S.noExchange}>
                              <Text style={{fontFamily: 'Inter-Medium', fontSize: 12, color: '#EF4444', flex: 1}}>No crypto exchange connected.</Text>
                            </View>
                          )}
                          {ex && (
                            <View style={[S.liveInput, {borderColor: err ? '#EF4444' : 'rgba(255,255,255,0.08)'}]}>
                              <Text style={S.dollarSign}>$</Text>
                              <TextInput style={S.liveInputText} value={cryptoLiveInput} onChangeText={setCryptoLiveInput} keyboardType="numeric" placeholder="0" placeholderTextColor="rgba(255,255,255,0.2)" />
                              <TouchableOpacity onPress={() => setCryptoLiveInput(String(Math.floor(ex.totalBalance)))}>
                                <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 11, color: '#10B981'}}>MAX</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                          {err && <Text style={S.inputError}>Exceeds available ${(exchanges.find(c => c.assetClass === 'crypto')?.totalBalance ?? 0).toFixed(2)}</Text>}
                        </View>
                      );
                    })()}
                    {hasStocks && (() => {
                      const ex = exchanges.find(c => c.assetClass === 'stocks' && c.status === 'connected');
                      const err = ex && parseFloat(stockLiveInput) > ex.totalBalance;
                      return (
                        <View>
                          <Text style={S.poolLabel}>STOCK POOL (÷ {stockBotCount} bot{stockBotCount !== 1 ? 's' : ''})</Text>
                          {ex ? (
                            <View style={S.exchangeCard}>
                              <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                                <Text style={S.exchangeName}>{ex.provider.charAt(0).toUpperCase() + ex.provider.slice(1)}</Text>
                                <Text style={S.exchangeBal}>${ex.totalBalance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</Text>
                              </View>
                              <Text style={S.exchangeAvail}>Available</Text>
                            </View>
                          ) : (
                            <View style={S.noExchange}>
                              <Text style={{fontFamily: 'Inter-Medium', fontSize: 12, color: '#EF4444', flex: 1}}>No stock broker connected.</Text>
                            </View>
                          )}
                          {ex && (
                            <View style={[S.liveInput, {borderColor: err ? '#EF4444' : 'rgba(255,255,255,0.08)'}]}>
                              <Text style={S.dollarSign}>$</Text>
                              <TextInput style={S.liveInputText} value={stockLiveInput} onChangeText={setStockLiveInput} keyboardType="numeric" placeholder="0" placeholderTextColor="rgba(255,255,255,0.2)" />
                              <TouchableOpacity onPress={() => setStockLiveInput(String(Math.floor(ex.totalBalance)))}>
                                <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 11, color: '#3B82F6'}}>MAX</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                          {err && <Text style={S.inputError}>Exceeds available ${(exchanges.find(c => c.assetClass === 'stocks')?.totalBalance ?? 0).toFixed(2)}</Text>}
                        </View>
                      );
                    })()}
                  </>
                )}
              </View>
            )}

            {/* Min order */}
            <View style={[S.balanceCard, {marginTop: 12}]}>
              <Text style={S.sectionLabel}>MIN ORDER VALUE (PER TRADE)</Text>
              <View style={S.liveInput}>
                <Text style={S.dollarSign}>$</Text>
                <TextInput
                  style={S.liveInputText}
                  value={minOrderInput}
                  onChangeText={v => setMinOrderInput(v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'))}
                  keyboardType="numeric"
                  placeholder={hasStocks && !hasCrypto ? '1' : '10'}
                  placeholderTextColor="rgba(255,255,255,0.2)"
                />
              </View>
              <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 6}}>
                Min ${hasStocks && !hasCrypto ? '1' : '10'} · bots skip trades below this amount
              </Text>
            </View>

            {/* Per-bot preview */}
            {getPerBotPreview() && (
              <View style={S.allocPreview}>
                <Text style={{fontFamily: 'Inter-Medium', fontSize: 12, color: '#10B981'}}>⚖️ {getPerBotPreview()}</Text>
              </View>
            )}
          </View>
        )}

        <View style={{height: 16}} />
      </ScrollView>

      {/* Footer */}
      <View style={S.footer}>
        <View style={S.readinessRow}>
          <Text style={S.readinessLabel}>SQUAD READINESS</Text>
          <Text style={S.readinessCount}>{selectedCount} bots · {getDurationLabel()}</Text>
        </View>
        {/* Progress bar */}
        <View style={S.progressTrack}>
          <View style={[S.progressFill, {width: `${Math.round(progress * 100)}%` as any}]} />
        </View>
        <TouchableOpacity
          style={[S.enterBtn, !canStart && S.enterBtnDisabled]}
          onPress={handleEnterArena}
          disabled={!canStart}
          activeOpacity={0.85}>
          {starting
            ? <ActivityIndicator size="small" color="#FFFFFF" />
            : <><Text style={S.enterBtnText}>ENTER ARENA</Text><SwordsIcon /></>}
        </TouchableOpacity>
      </View>

      {/* Bot Picker Modal */}
      <BotPickerModal
        visible={botPickerVisible}
        selectedIds={selectedIds}
        onToggle={handlePickerToggle}
        onDone={() => setBotPickerVisible(false)}
        onClose={() => setBotPickerVisible(false)}
      />
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0F1117'},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 54, paddingBottom: 14, backgroundColor: '#0F1117'},
  headerBtn: {width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center'},
  headerTitle: {fontFamily: 'Inter-Bold', fontSize: 14, color: '#FFFFFF', letterSpacing: 1.8, textTransform: 'uppercase'},
  scroll: {paddingHorizontal: 16, paddingBottom: 8},
  sectionLabel: {fontFamily: 'Inter-Medium', fontSize: 11, letterSpacing: 1.2, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', marginBottom: 10},

  // Active battle banners
  activeBanner: {flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(234,179,8,0.07)', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(234,179,8,0.2)'},
  activePulse: {width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(234,179,8,0.15)', alignItems: 'center', justifyContent: 'center'},
  activeDot: {width: 10, height: 10, borderRadius: 5, backgroundColor: '#EAB308'},
  activeBannerTitle: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#EAB308'},
  activeBannerSub: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2},
  activeBannerBtn: {backgroundColor: '#EAB308', borderRadius: 8, paddingHorizontal: 11, paddingVertical: 5},
  activeBannerBtnText: {fontFamily: 'Inter-Bold', fontSize: 10, color: '#0A0E14', letterSpacing: 0.5},

  // Mode chips
  modeChip: {flex: 1, paddingVertical: 16, borderRadius: 14, backgroundColor: '#161B22', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center'},
  modeChipActive: {backgroundColor: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.4)'},
  modeChipLabel: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 2},
  modeChipLabelActive: {color: '#10B981'},
  modeChipSub: {fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.3)'},

  // Bot selector button
  botSelectorBtn: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#161B22', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 4},
  botSelectorLeft: {flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1},
  botSelectorIconBox: {width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center'},
  botSelectorLabel: {fontFamily: 'Inter-SemiBold', fontSize: 15, color: 'rgba(255,255,255,0.6)', marginBottom: 2},
  botSelectorSub: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.35)'},
  botSelectorArrow: {width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center'},

  // Bot chips
  botChip: {flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1},
  botChipText: {fontFamily: 'Inter-Medium', fontSize: 11, maxWidth: 100},

  // Balance card
  balanceCard: {backgroundColor: '#111827', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)'},
  mixedBanner: {backgroundColor: 'rgba(245,158,11,0.08)', borderRadius: 10, padding: 10, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)'},
  mixedBannerTitle: {fontFamily: 'Inter-SemiBold', fontSize: 12, color: '#F59E0B', marginBottom: 2},
  mixedBannerSub: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 16},
  liveBanner: {backgroundColor: 'rgba(239,68,68,0.07)', borderRadius: 10, padding: 10, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)'},
  liveBannerTitle: {fontFamily: 'Inter-SemiBold', fontSize: 12, color: '#EF4444', marginBottom: 2},
  liveBannerSub: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.45)'},
  poolLabel: {fontFamily: 'Inter-Medium', fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5, marginBottom: 8},
  exchangeCard: {backgroundColor: '#0D1117', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', marginBottom: 10},
  exchangeName: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF'},
  exchangeBal: {fontFamily: 'Inter-Bold', fontSize: 15, color: '#FFFFFF'},
  exchangeAvail: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 3},
  noExchange: {backgroundColor: 'rgba(239,68,68,0.07)', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)', marginBottom: 10, flexDirection: 'row', alignItems: 'center'},
  liveInput: {flexDirection: 'row', alignItems: 'center', backgroundColor: '#161B22', borderRadius: 10, borderWidth: 1, paddingHorizontal: 14},
  liveInputText: {flex: 1, color: '#FFFFFF', fontFamily: 'Inter-SemiBold', fontSize: 16, paddingVertical: 12},
  dollarSign: {fontFamily: 'Inter-Bold', fontSize: 16, color: 'rgba(255,255,255,0.4)', marginRight: 4},
  inputError: {fontFamily: 'Inter-Regular', fontSize: 11, color: '#EF4444', marginTop: 4},
  allocPreview: {backgroundColor: 'rgba(16,185,129,0.06)', borderRadius: 10, padding: 12, marginTop: 10, borderWidth: 1, borderColor: 'rgba(16,185,129,0.15)'},

  // Footer
  footer: {paddingHorizontal: 16, paddingTop: 14, paddingBottom: 34, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)', backgroundColor: '#0F1117'},
  readinessRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10},
  readinessLabel: {fontFamily: 'Inter-Medium', fontSize: 11, letterSpacing: 1, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase'},
  readinessCount: {fontFamily: 'Inter-SemiBold', fontSize: 12, color: 'rgba(255,255,255,0.65)'},
  progressTrack: {height: 5, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 999, overflow: 'hidden', marginBottom: 14},
  progressFill: {height: 5, backgroundColor: '#10B981', borderRadius: 999},
  enterBtn: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 54, borderRadius: 14, backgroundColor: '#10B981', shadowColor: '#10B981', shadowOffset: {width: 0, height: 6}, shadowOpacity: 0.4, shadowRadius: 14, elevation: 10},
  enterBtnDisabled: {backgroundColor: '#1C2333', shadowOpacity: 0, elevation: 0},
  enterBtnText: {fontFamily: 'Inter-Bold', fontSize: 15, color: '#FFFFFF', letterSpacing: 2},
});
