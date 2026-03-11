import React from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import Svg, {Path, Rect, Circle} from 'react-native-svg';
import {RootStackParamList} from '../../types';
import {mockPortfolioSummary} from '../../data/mockPortfolio';
import {mockUser} from '../../data/mockUser';
import AllocationBar from '../../components/charts/AllocationBar';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

// ─── Header Icons ────────────────────────────────────────────────────────────

function WalletIcon({size = 20}: {size?: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Rect x={1} y={5} width={18} height={13} rx={2.5} stroke="#FFFFFF" strokeWidth={1.6} />
      <Path d="M1 9 L19 9" stroke="#FFFFFF" strokeWidth={1.6} />
      <Path d="M4 5 L6 2 M14 2 L16 5" stroke="#FFFFFF" strokeWidth={1.5} strokeLinecap="round" />
      <Circle cx={14.5} cy={13} r={1.5} fill="#FFFFFF" />
    </Svg>
  );
}

function BellIconSvg({size = 20, color = 'rgba(255,255,255,0.6)', hasDot = false}: {size?: number; color?: string; hasDot?: boolean}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5.5 15C5.5 15 5 14.3 5 12.5C5 9.46 7.46 7 10.5 7H13.5C16.54 7 19 9.46 19 12.5C19 14.3 18.5 15 18.5 15C18.5 15 20 15.5 20 17H4C4 15.5 5.5 15 5.5 15Z"
        stroke={color} strokeWidth={1.5} strokeLinejoin="round"
      />
      <Path d="M10 17C10 18.1 10.9 19 12 19C13.1 19 14 18.1 14 17" stroke={color} strokeWidth={1.5} />
      {hasDot && <Circle cx="18.5" cy="5.5" r="2.5" fill="#EF4444" />}
    </Svg>
  );
}

// ─── Bot Avatar Icons ─────────────────────────────────────────────────────────

function LightningIcon({size = 18}: {size?: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path d="M10.5 2 L5 10 L9 10 L7.5 16 L13 8 L9 8 Z" fill="#FFFFFF" />
    </Svg>
  );
}

function GridIcon({size = 18}: {size?: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Rect x={2} y={2} width={5.5} height={5.5} rx={1.2} fill="#FFFFFF" />
      <Rect x={10.5} y={2} width={5.5} height={5.5} rx={1.2} fill="#FFFFFF" />
      <Rect x={2} y={10.5} width={5.5} height={5.5} rx={1.2} fill="#FFFFFF" />
      <Rect x={10.5} y={10.5} width={5.5} height={5.5} rx={1.2} fill="#FFFFFF" />
    </Svg>
  );
}

function TrendIcon({size = 18}: {size?: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path d="M2 13 L6 9 L9 11 L13 6 L16 8" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M13 6 L16 6 L16 9" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

// ─── Coin Icon ───────────────────────────────────────────────────────────────

function CoinIcon({symbol, color, size = 40}: {symbol: string; color: string; size?: number}) {
  return (
    <View style={{width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center'}}>
      <Text style={{fontFamily: 'Inter-Bold', fontSize: size * 0.38, color: '#FFFFFF'}}>{symbol.charAt(0)}</Text>
    </View>
  );
}

// ─── Connect Exchange Icon ──────────────────────────────────────────────────

function LinkIcon({size = 18}: {size?: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path d="M7.5 10.5L10.5 7.5" stroke="#10B981" strokeWidth={1.5} strokeLinecap="round" />
      <Path d="M6 12L4.5 13.5C3.67 14.33 3.67 15.67 4.5 16.5C5.33 17.33 6.67 17.33 7.5 16.5L9 15" stroke="#10B981" strokeWidth={1.5} strokeLinecap="round" />
      <Path d="M12 6L13.5 4.5C14.33 3.67 14.33 2.33 13.5 1.5C12.67 0.67 11.33 0.67 10.5 1.5L9 3" stroke="#10B981" strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

// ─── Bot icon map ────────────────────────────────────────────────────────────

const BOT_ICONS: Record<string, React.FC> = {
  bot1: () => <LightningIcon size={18} />,
  bot2: () => <GridIcon size={18} />,
  bot3: () => <TrendIcon size={18} />,
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PortfolioScreen() {
  const navigation = useNavigation<NavProp>();
  const portfolio = mockPortfolioSummary;
  const user = mockUser;

  const isPositive = portfolio.totalChangePercent24h >= 0;
  const profitColor = isPositive ? '#10B981' : '#EF4444';
  const profitSign = isPositive ? '+' : '';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.avatarRow}>
          <View style={styles.avatarWrap}>
            <WalletIcon size={20} />
          </View>
          <View>
            <Text style={styles.appLabel}>TRADINGAPP</Text>
            <Text style={styles.screenTitle}>Portfolio</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => navigation.navigate('Notifications')}>
          <BellIconSvg size={28} hasDot />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Balance Section */}
        <View style={styles.balanceSection}>
          <Text style={styles.balanceLabel}>Total Portfolio Value</Text>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceValue}>
              ${portfolio.totalValue.toLocaleString('en-US', {minimumFractionDigits: 2})}
            </Text>
            <View style={styles.pctBadge}>
              <Text style={styles.pctBadgeText}>
                {profitSign}{portfolio.totalChangePercent24h.toFixed(1)}%
              </Text>
            </View>
          </View>
          <Text style={[styles.todayProfit, {color: profitColor}]}>
            {profitSign}${portfolio.totalChange24h.toFixed(2)} today
          </Text>
        </View>

        {/* Allocation Bar */}
        <View style={styles.allocationCard}>
          <AllocationBar data={portfolio.allocationBreakdown} height={10} />
          <View style={styles.allocationLegend}>
            {portfolio.allocationBreakdown.map(item => (
              <View key={item.label} style={styles.legendItem}>
                <View style={[styles.legendDot, {backgroundColor: item.color}]} />
                <Text style={styles.legendLabel}>{item.label}</Text>
                <Text style={styles.legendPercent}>{item.percent}%</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Assets Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>YOUR ASSETS</Text>
          <View style={styles.assetsCard}>
            {portfolio.assets.map((asset, idx) => {
              const changeColor = asset.change24h >= 0 ? '#10B981' : '#EF4444';
              const changeSign = asset.change24h >= 0 ? '+' : '';
              const isLast = idx === portfolio.assets.length - 1;
              return (
                <View key={asset.symbol} style={[styles.assetRow, !isLast && styles.assetRowBorder]}>
                  <CoinIcon symbol={asset.symbol} color={asset.iconColor} size={40} />
                  <View style={styles.assetInfo}>
                    <Text style={styles.assetSymbol}>{asset.symbol}</Text>
                    <Text style={styles.assetName}>{asset.name}</Text>
                  </View>
                  <View style={styles.assetRight}>
                    <Text style={styles.assetValue}>
                      ${asset.valueUsd.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </Text>
                    <Text style={[styles.assetChange, {color: changeColor}]}>
                      {changeSign}{asset.change24h.toFixed(1)}%
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Active Bots Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>ACTIVE BOTS</Text>
            <TouchableOpacity onPress={() => navigation.navigate('BotDetails', {botId: 'bot1'})}>
              <Text style={styles.sectionAction}>View All</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.botList}>
            {user.activeBots.map(bot => {
              const BotIcon = BOT_ICONS[bot.id] || LightningIcon;
              const returnColor = bot.totalReturn >= 0 ? '#10B981' : '#EF4444';
              const returnSign = bot.totalReturn >= 0 ? '+' : '';
              const accentColor = bot.status === 'live' ? '#10B981' : '#F59E0B';
              return (
                <TouchableOpacity
                  key={bot.id}
                  style={[styles.botCard, {borderLeftColor: accentColor}]}
                  onPress={() => navigation.navigate('BotDetails', {botId: bot.id})}
                  activeOpacity={0.7}>
                  <View style={[styles.botAvatar, {backgroundColor: bot.avatarColor}]}>
                    <BotIcon />
                  </View>
                  <View style={styles.botInfo}>
                    <View style={styles.botNameRow}>
                      <Text style={styles.botName}>{bot.name}</Text>
                      <View style={[styles.liveDot, {backgroundColor: accentColor}]} />
                    </View>
                    <Text style={styles.botPair}>
                      {bot.pair}
                      {'  '}
                      <Text style={{color: returnColor, fontFamily: 'Inter-SemiBold'}}>
                        {returnSign}{bot.totalReturn.toFixed(1)}% ROI
                      </Text>
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Connect Exchange Banner */}
        <TouchableOpacity
          style={styles.connectBanner}
          onPress={() => navigation.navigate('ExchangeConnect')}
          activeOpacity={0.8}>
          <View style={styles.connectLeft}>
            <View style={styles.connectIconWrap}>
              <LinkIcon size={18} />
            </View>
            <View style={styles.connectTextWrap}>
              <Text style={styles.connectTitle}>Connect more exchanges</Text>
              <Text style={styles.connectSubtitle}>Sync your full portfolio across platforms</Text>
            </View>
          </View>
          <View style={styles.connectBtn}>
            <Text style={styles.connectBtnText}>Connect</Text>
          </View>
        </TouchableOpacity>

        <View style={{height: 24}} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0A0D12'},
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16,
  },
  avatarRow: {flexDirection: 'row', alignItems: 'center', gap: 12},
  avatarWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#10B981',
    alignItems: 'center', justifyContent: 'center',
  },
  appLabel: {
    fontFamily: 'Inter-Medium', fontSize: 10, letterSpacing: 1.2,
    color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase',
  },
  screenTitle: {fontFamily: 'Inter-Bold', fontSize: 18, color: '#FFFFFF', letterSpacing: -0.3},
  iconBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  scrollContent: {paddingHorizontal: 20},

  // Balance
  balanceSection: {marginBottom: 20},
  balanceLabel: {fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 6},
  balanceRow: {flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4},
  balanceValue: {fontFamily: 'Inter-Bold', fontSize: 36, color: '#FFFFFF', letterSpacing: -1.2},
  pctBadge: {backgroundColor: 'rgba(16,185,129,0.18)', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4},
  pctBadgeText: {fontFamily: 'Inter-SemiBold', fontSize: 12, color: '#10B981'},
  todayProfit: {fontFamily: 'Inter-Medium', fontSize: 13},

  // Allocation
  allocationCard: {
    backgroundColor: '#161B22', borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    padding: 16, marginBottom: 20,
  },
  allocationLegend: {flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, gap: 4},
  legendItem: {flexDirection: 'row', alignItems: 'center', marginRight: 12, marginBottom: 4},
  legendDot: {width: 8, height: 8, borderRadius: 4, marginRight: 6},
  legendLabel: {fontFamily: 'Inter-Medium', fontSize: 12, color: 'rgba(255,255,255,0.6)', marginRight: 3},
  legendPercent: {fontFamily: 'Inter-SemiBold', fontSize: 12, color: '#FFFFFF'},

  // Sections
  section: {marginBottom: 20},
  sectionHeaderRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10},
  sectionTitle: {fontFamily: 'Inter-Bold', fontSize: 13, color: 'rgba(255,255,255,0.5)', letterSpacing: 1, marginBottom: 10},
  sectionAction: {fontFamily: 'Inter-Medium', fontSize: 13, color: '#10B981'},

  // Assets
  assetsCard: {
    backgroundColor: '#161B22', borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 16,
  },
  assetRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 14},
  assetRowBorder: {borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)'},
  assetInfo: {flex: 1, marginLeft: 12},
  assetSymbol: {fontFamily: 'Inter-SemiBold', fontSize: 15, color: '#FFFFFF', marginBottom: 2},
  assetName: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.4)'},
  assetRight: {alignItems: 'flex-end'},
  assetValue: {fontFamily: 'Inter-SemiBold', fontSize: 15, color: '#FFFFFF', marginBottom: 2},
  assetChange: {fontFamily: 'Inter-Medium', fontSize: 12},

  // Bot list
  botList: {gap: 8},
  botCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#161B22', borderRadius: 14,
    borderTopWidth: 1, borderBottomWidth: 1, borderRightWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
    borderBottomColor: 'rgba(255,255,255,0.07)',
    borderRightColor: 'rgba(255,255,255,0.07)',
    borderLeftWidth: 3,
    paddingVertical: 12, paddingHorizontal: 14,
  },
  botAvatar: {width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12},
  botInfo: {flex: 1},
  botNameRow: {flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3},
  botName: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF'},
  liveDot: {width: 7, height: 7, borderRadius: 4},
  botPair: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.4)'},

  // Connect Exchange Banner
  connectBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(16,185,129,0.06)',
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)',
    padding: 16,
  },
  connectLeft: {flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12},
  connectIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(16,185,129,0.15)',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  connectTextWrap: {flex: 1},
  connectTitle: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#FFFFFF', marginBottom: 2},
  connectSubtitle: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.4)'},
  connectBtn: {
    backgroundColor: '#10B981', borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  connectBtnText: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#FFFFFF'},
});
