import React, {useState} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Dimensions} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../types';
import {mockBots} from '../../data/mockBots';
import BotCard from '../../components/common/BotCard';
import TabChip from '../../components/common/TabChip';
import Badge from '../../components/common/Badge';
import SectionHeader from '../../components/common/SectionHeader';
import SearchIcon from '../../components/icons/SearchIcon';
import BellIcon from '../../components/icons/BellIcon';

const {width} = Dimensions.get('window');
const CARD_WIDTH = (width - 48 - 8) / 2;

const FILTERS = ['All Bots', 'Crypto', 'Stocks', 'Top Performers'];

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function MarketplaceScreen() {
  const navigation = useNavigation<NavProp>();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All Bots');

  const featuredBot = mockBots[0];
  const filteredBots = mockBots.filter(b => {
    const matchSearch = b.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchFilter = activeFilter === 'All Bots' ||
      (activeFilter === 'Crypto' && b.category === 'Crypto') ||
      (activeFilter === 'Stocks' && b.category === 'Stocks') ||
      (activeFilter === 'Top Performers' && b.returnPercent > 20);
    return matchSearch && matchFilter;
  });

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.caption}>MARKETPLACE</Text>
          <Text style={styles.title}>Discover Bots</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Notifications')}>
            <BellIcon size={20} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Search bar */}
        <View style={styles.searchRow}>
          <SearchIcon size={18} color="rgba(255,255,255,0.3)" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search AI trading bots..."
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersScroll} contentContainerStyle={styles.filtersContent}>
          {FILTERS.map(f => (
            <TabChip key={f} label={f} active={activeFilter === f} onPress={() => setActiveFilter(f)} />
          ))}
        </ScrollView>

        {/* Featured Bot Card */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.featuredCard}
            onPress={() => navigation.navigate('BotDetails', {botId: featuredBot.id})}
            activeOpacity={0.9}>
            <View style={styles.featuredHeader}>
              <Badge label="EDITORS CHOICE" variant="green" size="sm" />
              <Text style={styles.featuredReturn}>+{featuredBot.returnPercent.toFixed(1)}%</Text>
            </View>
            <View style={[styles.featuredAvatar, {backgroundColor: featuredBot.avatarColor}]}>
              <Text style={styles.featuredAvatarText}>{featuredBot.avatarLetter}</Text>
            </View>
            <Text style={styles.featuredName}>{featuredBot.name}</Text>
            <Text style={styles.featuredStrategy}>{featuredBot.strategy}</Text>
            <View style={styles.featuredStats}>
              <View style={styles.featuredStat}>
                <Text style={styles.statValue}>{featuredBot.winRate}%</Text>
                <Text style={styles.statLabel}>Win Rate</Text>
              </View>
              <View style={styles.featuredStat}>
                <Text style={styles.statValue}>{featuredBot.activeUsers.toLocaleString()}</Text>
                <Text style={styles.statLabel}>Active Users</Text>
              </View>
              <View style={styles.featuredStat}>
                <Text style={styles.statValue}>{featuredBot.sharpeRatio}</Text>
                <Text style={styles.statLabel}>Sharpe</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.activateBtn}
              onPress={() => navigation.navigate('BotDetails', {botId: featuredBot.id})}
              activeOpacity={0.85}>
              <Text style={styles.activateBtnText}>Activate Now →</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </View>

        {/* Bot grid */}
        <View style={styles.section}>
          <SectionHeader title="All Strategies" />
          <View style={styles.grid}>
            {filteredBots.map((bot, i) => (
              <BotCard
                key={bot.id}
                bot={bot}
                style={{width: CARD_WIDTH}}
                onPress={() => navigation.navigate('BotDetails', {botId: bot.id})}
              />
            ))}
          </View>
        </View>

        <View style={{height: 32}} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0F1117'},
  header: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12,
  },
  caption: {fontFamily: 'Inter-Medium', fontSize: 10, letterSpacing: 1, color: '#10B981', textTransform: 'uppercase'},
  title: {fontFamily: 'Inter-Bold', fontSize: 24, color: '#FFFFFF', letterSpacing: -0.3},
  headerActions: {flexDirection: 'row', gap: 8},
  iconBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 20, marginBottom: 12,
    backgroundColor: '#1C2333', borderRadius: 12, paddingHorizontal: 14,
    height: 46, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  searchInput: {flex: 1, fontFamily: 'Inter-Regular', fontSize: 14, color: '#FFFFFF', marginLeft: 8},
  filtersScroll: {marginBottom: 16},
  filtersContent: {paddingHorizontal: 20},
  section: {paddingHorizontal: 20, marginBottom: 8},
  featuredCard: {
    backgroundColor: '#161B22', borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)', marginBottom: 8,
  },
  featuredHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16},
  featuredReturn: {fontFamily: 'Inter-Bold', fontSize: 22, color: '#10B981'},
  featuredAvatar: {
    width: 52, height: 52, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  featuredAvatarText: {fontFamily: 'Inter-Bold', fontSize: 20, color: '#FFFFFF'},
  featuredName: {fontFamily: 'Inter-Bold', fontSize: 18, color: '#FFFFFF', marginBottom: 2},
  featuredStrategy: {fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 16},
  featuredStats: {flexDirection: 'row', gap: 16, marginBottom: 16},
  featuredStat: {},
  statValue: {fontFamily: 'Inter-Bold', fontSize: 16, color: '#FFFFFF'},
  statLabel: {fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.4)'},
  activateBtn: {
    height: 44, backgroundColor: '#10B981', borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  activateBtnText: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF'},
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
});
