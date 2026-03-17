import React, {useState, useEffect} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../types';
import type {Bot} from '../../types';
import {marketplaceApi} from '../../services/marketplace';
import {botsService} from '../../services/bots';
import {portfolioApi} from '../../services/portfolio';
import {configApi} from '../../services/config';
import ChevronLeftIcon from '../../components/icons/ChevronLeftIcon';
import CheckCircleIcon from '../../components/icons/CheckCircleIcon';
import LockIcon from '../../components/icons/LockIcon';

type Props = NativeStackScreenProps<RootStackParamList, 'BotPurchase'>;

export default function BotPurchaseScreen({navigation, route}: Props) {
  const [bot, setBot] = useState<Bot | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [availableCapital, setAvailableCapital] = useState(0);
  const [feeRate, setFeeRate] = useState(0.07);

  useEffect(() => {
    Promise.all([
      marketplaceApi.getBotDetails(route.params.botId),
      portfolioApi.getSummary().catch(() => ({totalValue: 0})),
      configApi.getPlatformConfig().catch(() => ({platformFeeRate: 0.07})),
    ])
      .then(([botData, portfolio, config]) => {
        setBot(botData);
        setAvailableCapital(portfolio.totalValue || 0);
        setFeeRate(config.platformFeeRate || 0.07);
      })
      .catch(() => Alert.alert('Error', 'Failed to load bot details'))
      .finally(() => setLoading(false));
  }, [route.params.botId]);

  const handleActivate = async () => {
    if (!bot) return;
    // Balance check: ensure user has enough capital for the bot price
    if (bot.price > 0 && availableCapital < bot.price) {
      Alert.alert(
        'Insufficient Funds',
        `You need at least $${bot.price} to activate this bot. Your available capital is $${availableCapital.toLocaleString()}.`,
        [{text: 'Add Funds', onPress: () => navigation.navigate('WalletFunds')}, {text: 'Cancel', style: 'cancel'}],
      );
      return;
    }
    // Confirmation dialog before financial commitment
    Alert.alert(
      'Confirm Activation',
      `Activate ${bot.name} for ${bot.price === 0 ? 'free' : `$${bot.price}/month`}?\n\nCapital allocated: $${availableCapital > 0 ? availableCapital.toLocaleString() : '0'}`,
      [
        {text: 'Cancel', style: 'cancel'},
        {text: 'Activate', onPress: async () => {
          setActivating(true);
          try {
            await botsService.purchase(bot.id, {mode: 'live', allocatedAmount: availableCapital || undefined});
            navigation.navigate('Main');
          } catch (err: any) {
            const msg = err?.response?.data?.message || err?.message || 'Failed to activate bot. Please try again.';
            Alert.alert('Error', msg);
          } finally {
            setActivating(false);
          }
        }},
      ],
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, {alignItems: 'center', justifyContent: 'center'}]}>
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  if (!bot) {
    return (
      <View style={[styles.container, {alignItems: 'center', justifyContent: 'center'}]}>
        <Text style={{color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter-Regular', fontSize: 15}}>Bot not found</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{marginTop: 16}}>
          <Text style={{color: '#10B981', fontFamily: 'Inter-SemiBold', fontSize: 15}}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const features = [
    '24/7 automated trading',
    'Real-time performance dashboard',
    'Risk management controls',
    'Instant activation & deactivation',
    'Performance analytics & reports',
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeftIcon size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Activate Bot</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Bot summary */}
        <View style={styles.botCard}>
          <View style={[styles.botAvatar, {backgroundColor: bot.avatarColor}]}>
            <Text style={styles.botAvatarText}>{bot.avatarLetter}</Text>
          </View>
          <Text style={styles.botName}>{bot.name}</Text>
          <Text style={styles.botStats}>{bot.returnPercent.toFixed(1)}% 30D • {bot.winRate}% Win Rate</Text>
        </View>

        {/* Plan card */}
        <View style={styles.planCard}>
          <View style={styles.planHeader}>
            <Text style={styles.planName}>Monthly Plan</Text>
            <View style={styles.planPrice}>
              <Text style={styles.priceAmount}>${bot.price}</Text>
              <Text style={styles.priceUnit}>/month</Text>
            </View>
          </View>
          <Text style={styles.platformFee}>+ {Math.round(feeRate * 100)}% platform fee on profits earned</Text>
        </View>

        {/* Features */}
        <Text style={styles.sectionLabel}>WHAT'S INCLUDED</Text>
        {features.map(f => (
          <View key={f} style={styles.featureRow}>
            <CheckCircleIcon size={18} color="#10B981" />
            <Text style={styles.featureText}>{f}</Text>
          </View>
        ))}

        {/* Capital allocation */}
        <View style={styles.capitalCard}>
          <Text style={styles.capitalLabel}>CAPITAL TO ALLOCATE</Text>
          <Text style={styles.capitalValue}>${availableCapital > 0 ? availableCapital.toLocaleString() : '—'}</Text>
          <Text style={styles.capitalSub}>Adjust after activation</Text>
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.secRow}>
          <LockIcon size={12} color="rgba(255,255,255,0.3)" />
          <Text style={styles.secText}>Secured payment • Cancel anytime</Text>
        </View>
        <TouchableOpacity style={styles.activateBtn} onPress={handleActivate} activeOpacity={0.85} disabled={activating}>
          {activating ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.activateBtnText}>
              {bot.price === 0 ? 'Activate Free' : `Pay $${bot.price} & Activate`}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0F1117'},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12},
  backBtn: {width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center'},
  headerTitle: {fontFamily: 'Inter-SemiBold', fontSize: 17, color: '#FFFFFF'},
  scroll: {paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20},
  botCard: {alignItems: 'center', backgroundColor: '#161B22', borderRadius: 20, padding: 24, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)'},
  botAvatar: {width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 10},
  botAvatarText: {fontFamily: 'Inter-Bold', fontSize: 24, color: '#FFFFFF'},
  botName: {fontFamily: 'Inter-Bold', fontSize: 20, color: '#FFFFFF', marginBottom: 4},
  botStats: {fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.4)'},
  planCard: {backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)'},
  planHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6},
  planName: {fontFamily: 'Inter-SemiBold', fontSize: 16, color: '#FFFFFF'},
  planPrice: {flexDirection: 'row', alignItems: 'flex-end'},
  priceAmount: {fontFamily: 'Inter-Bold', fontSize: 28, color: '#10B981'},
  priceUnit: {fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 4, marginLeft: 2},
  platformFee: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.4)'},
  sectionLabel: {fontFamily: 'Inter-Medium', fontSize: 10, letterSpacing: 1, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 12},
  featureRow: {flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10},
  featureText: {fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.7)'},
  capitalCard: {backgroundColor: '#1C2333', borderRadius: 14, padding: 16, marginTop: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)'},
  capitalLabel: {fontFamily: 'Inter-Medium', fontSize: 10, letterSpacing: 1, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 6},
  capitalValue: {fontFamily: 'Inter-Bold', fontSize: 26, color: '#FFFFFF'},
  capitalSub: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.35)'},
  footer: {paddingHorizontal: 20, paddingBottom: 32, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)'},
  secRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 12},
  secText: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.3)'},
  activateBtn: {height: 56, backgroundColor: '#10B981', borderRadius: 14, alignItems: 'center', justifyContent: 'center'},
  activateBtnText: {fontFamily: 'Inter-SemiBold', fontSize: 16, color: '#FFFFFF'},
});
