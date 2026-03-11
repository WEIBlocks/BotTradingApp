import React, {useState, useCallback} from 'react';
import {View, Text, StyleSheet, FlatList, TouchableOpacity, Switch} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList, Gladiator} from '../../types';
import {mockGladiators} from '../../data/mockGladiators';
import ProgressBar from '../../components/common/ProgressBar';
import ChevronLeftIcon from '../../components/icons/ChevronLeftIcon';
import InfoIcon from '../../components/icons/InfoIcon';
import TrophyIcon from '../../components/icons/TrophyIcon';

type NavProp = NativeStackNavigationProp<RootStackParamList>;
const MAX_GLADIATORS = 5;

export default function ArenaSetupScreen() {
  const navigation = useNavigation<NavProp>();
  const [gladiators, setGladiators] = useState<Gladiator[]>(mockGladiators);

  const selectedCount = gladiators.filter(g => g.selected).length;
  const progress = selectedCount / MAX_GLADIATORS;

  const toggleGladiator = useCallback((id: string) => {
    setGladiators(prev =>
      prev.map(g => {
        if (g.id !== id) return g;
        if (!g.selected && selectedCount >= MAX_GLADIATORS) return g; // max reached
        return {...g, selected: !g.selected};
      }),
    );
  }, [selectedCount]);

  const handleEnterArena = useCallback(() => {
    const ids = gladiators.filter(g => g.selected).map(g => g.id);
    navigation.navigate('ArenaLive', {gladiatorIds: ids});
  }, [gladiators, navigation]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <ChevronLeftIcon size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerCaption}>BOT BATTLE</Text>
          <Text style={styles.headerTitle}>ARENA</Text>
        </View>
        <TouchableOpacity style={styles.iconBtn}>
          <InfoIcon size={20} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
      </View>

      {/* Title section */}
      <View style={styles.titleSection}>
        <Text style={styles.title}>Select Your Bot</Text>
        <Text style={styles.subtitle}>Choose up to {MAX_GLADIATORS} bots to battle in a 30-day simulation</Text>
        <View style={styles.readinessRow}>
          <View style={styles.readinessInfo}>
            <Text style={styles.readinessLabel}>BATTLE SQUAD READINESS</Text>
            <Text style={styles.readinessCount}>{selectedCount}/{MAX_GLADIATORS} Gladiators Selected</Text>
          </View>
          <Text style={styles.readinessPercent}>{Math.round(progress * 100)}%</Text>
        </View>
        <ProgressBar progress={progress} color="#10B981" height={6} />
      </View>

      {/* Gladiator list */}
      <FlatList
        data={gladiators}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({item}) => (
          <View style={[styles.gladiatorRow, item.selected && styles.gladiatorRowSelected]}>
            {/* Level badge */}
            <View style={styles.levelBadge}>
              <Text style={styles.levelText}>L{item.level}</Text>
            </View>
            {/* Avatar */}
            <View style={[styles.avatar, {backgroundColor: item.avatarColor}]}>
              <Text style={styles.avatarText}>{item.name.charAt(0)}</Text>
            </View>
            {/* Info */}
            <View style={styles.gladiatorInfo}>
              <Text style={styles.gladiatorName}>{item.name}</Text>
              <Text style={styles.gladiatorStrategy}>{item.strategy}</Text>
              <Text style={[styles.gladiatorWinRate, {color: '#10B981'}]}>{item.winRate}% Win Rate</Text>
            </View>
            {/* Toggle */}
            <Switch
              value={item.selected}
              onValueChange={() => toggleGladiator(item.id)}
              trackColor={{false: 'rgba(255,255,255,0.1)', true: 'rgba(16,185,129,0.4)'}}
              thumbColor={item.selected ? '#10B981' : 'rgba(255,255,255,0.5)'}
            />
          </View>
        )}
      />

      {/* Enter Arena button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.enterBtn, selectedCount < 2 && styles.enterBtnDisabled]}
          onPress={handleEnterArena}
          disabled={selectedCount < 2}
          activeOpacity={0.85}>
          <TrophyIcon size={20} color="#FFFFFF" />
          <Text style={styles.enterBtnText}>ENTER ARENA</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0F1117'},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12},
  iconBtn: {width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center'},
  headerCenter: {alignItems: 'center'},
  headerCaption: {fontFamily: 'Inter-Medium', fontSize: 9, letterSpacing: 2, color: '#10B981', textTransform: 'uppercase'},
  headerTitle: {fontFamily: 'Inter-Bold', fontSize: 18, color: '#FFFFFF', letterSpacing: 1},
  titleSection: {paddingHorizontal: 20, marginBottom: 8},
  title: {fontFamily: 'Inter-Bold', fontSize: 22, color: '#FFFFFF', marginBottom: 4, letterSpacing: -0.3},
  subtitle: {fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 16, lineHeight: 18},
  readinessRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8},
  readinessInfo: {},
  readinessLabel: {fontFamily: 'Inter-Medium', fontSize: 9, letterSpacing: 0.8, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 2},
  readinessCount: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#FFFFFF'},
  readinessPercent: {fontFamily: 'Inter-Bold', fontSize: 20, color: '#10B981'},
  listContent: {paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20},
  gladiatorRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#161B22', borderRadius: 14, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  gladiatorRowSelected: {borderColor: 'rgba(16,185,129,0.4)', backgroundColor: 'rgba(16,185,129,0.05)'},
  levelBadge: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  levelText: {fontFamily: 'Inter-Bold', fontSize: 11, color: 'rgba(255,255,255,0.7)'},
  avatar: {width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12},
  avatarText: {fontFamily: 'Inter-Bold', fontSize: 16, color: '#FFFFFF'},
  gladiatorInfo: {flex: 1},
  gladiatorName: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF'},
  gladiatorStrategy: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1},
  gladiatorWinRate: {fontFamily: 'Inter-Medium', fontSize: 11, marginTop: 2},
  footer: {paddingHorizontal: 20, paddingBottom: 32, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)'},
  enterBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, height: 56, borderRadius: 14, backgroundColor: '#10B981',
    shadowColor: '#10B981', shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  enterBtnDisabled: {backgroundColor: '#1C2333', shadowOpacity: 0},
  enterBtnText: {fontFamily: 'Inter-Bold', fontSize: 15, color: '#FFFFFF', letterSpacing: 1.5},
});
