import React, {useState, useCallback} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl} from 'react-native';
import {subscriptionApi, SubPlan, CurrentSubscription} from '../../services/subscription';
import {useToast} from '../../context/ToastContext';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../types';
import Svg, {Path, Circle, Line} from 'react-native-svg';
import ChevronLeftIcon from '../../components/icons/ChevronLeftIcon';
import {useIAP} from '../../context/IAPContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Subscription'>;

const CheckIcon = ({size = 16, color = '#10B981'}: {size?: number; color?: string}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="10" fill={color} opacity={0.15} />
    <Path d="M8 12l3 3 5-6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const XMarkIcon = ({size = 16}: {size?: number}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="10" fill="rgba(255,255,255,0.06)" />
    <Path d="M9 9l6 6M15 9l-6 6" stroke="rgba(255,255,255,0.25)" strokeWidth={2} strokeLinecap="round" />
  </Svg>
);

const CrownIcon = () => (
  <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
    <Path d="M2 8l4 10h12l4-10-5 4-5-8-5 8-5-4z" fill="#10B981" opacity={0.2} stroke="#10B981" strokeWidth={1.5} strokeLinejoin="round" />
    <Line x1="6" y1="18" x2="18" y2="18" stroke="#10B981" strokeWidth={1.5} strokeLinecap="round" />
  </Svg>
);

const RestoreIcon = ({size = 16, color = '#10B981'}: {size?: number; color?: string}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M1 4v6h6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const proFeatures = [
  'Trading Rooms (community space)',
  'Live feed of all trades',
  '3% discount on bot profits',
  'Priority support',
  'Unlimited shadow mode bots',
  'Advanced analytics',
  'Creator Studio access',
];

const comparisonRows: {feature: string; free: string | boolean; pro: string | boolean}[] = [
  {feature: 'Shadow Mode Bots', free: '1', pro: 'Unlimited'},
  {feature: 'Trading Rooms', free: false, pro: true},
  {feature: 'Live Feed', free: false, pro: true},
  {feature: 'Profit Discount', free: '0%', pro: '3%'},
  {feature: 'Support', free: 'Standard', pro: 'Priority'},
];

export default function SubscriptionScreen({navigation}: Props) {
  const {alert: showAlert, showConfirm} = useToast();
  const [plans, setPlans] = useState<SubPlan[]>([]);
  const [current, setCurrent] = useState<CurrentSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<'monthly' | 'yearly'>('monthly');

  const {
    subscriptionProducts,
    purchaseSubscription,
    restorePurchases,
    isPro,
    processing: iapProcessing,
  } = useIAP();

  const fetchData = useCallback(() => {
    Promise.all([
      subscriptionApi.getPlans().catch(() => []),
      subscriptionApi.getCurrent().catch(() => null),
    ]).then(([p, c]) => {
      setPlans(p);
      setCurrent(c);
    }).finally(() => { setLoading(false); setRefreshing(false); });
  }, []);

  React.useEffect(() => { fetchData(); }, [fetchData]);

  const isProActive = isPro || (current?.tier === 'pro' && current?.status === 'active');
  const proPlan = plans.find(p => p.tier === 'pro') || null;
  const proPrice = proPlan?.priceMonthly || 4.94;
  const yearlyPrice = proPlan?.priceYearly || 49.99;

  // Get store prices from Google Play (overrides backend prices when available)
  const monthlySku = 'tradingapp_pro_monthly';
  const yearlySku = 'tradingapp_pro_yearly';
  const monthlyProduct = subscriptionProducts.find(p => p.productId === monthlySku);
  const yearlyProduct = subscriptionProducts.find(p => p.productId === yearlySku);

  const getOfferPrice = (product: any): string | undefined => {
    return product?.subscriptionOfferDetails?.[0]?.pricingPhases?.pricingPhaseList?.[0]?.formattedPrice;
  };
  const getOfferToken = (product: any): string | undefined => {
    return product?.subscriptionOfferDetails?.[0]?.offerToken;
  };

  const displayMonthlyPrice = getOfferPrice(monthlyProduct) || `$${proPrice.toFixed(2)}`;
  const displayYearlyPrice = getOfferPrice(yearlyProduct) || `$${yearlyPrice.toFixed(2)}`;

  const yearlySavings = Math.round(((proPrice * 12 - yearlyPrice) / (proPrice * 12)) * 100);

  const handleSubscribe = async () => {
    const sku = selectedPeriod === 'monthly' ? monthlySku : yearlySku;
    const product = selectedPeriod === 'monthly' ? monthlyProduct : yearlyProduct;

    // Get offer token for Android
    const offerToken = getOfferToken(product);

    const success = await purchaseSubscription(sku, offerToken);
    if (success) {
      // Also register on backend
      if (proPlan?.id) {
        await subscriptionApi.subscribe(proPlan.id).catch(() => {});
      }
      fetchData();
    }
  };

  const handleCancel = () => {
    showConfirm({
      title: 'Cancel Subscription',
      message: 'To cancel your subscription, go to Google Play Store > Subscriptions > TradingApp Pro and cancel from there.\n\nYour access continues until the end of the billing period.',
      confirmText: 'Open Play Store',
      onConfirm: () => {
        const {Linking} = require('react-native');
        Linking.openURL('https://play.google.com/store/account/subscriptions');
      },
    });
  };

  const handleRestore = async () => {
    await restorePurchases();
    fetchData();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeftIcon size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>TradingApp Pro</Text>
        <View style={{width: 40}} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchData(); }}
            tintColor="#10B981"
            colors={['#10B981']}
            progressBackgroundColor="#161B22"
          />
        }>
        {loading && (
          <ActivityIndicator size="large" color="#10B981" style={{marginTop: 40, marginBottom: 20}} />
        )}
        {/* Current plan badge */}
        <View style={styles.badgeRow}>
          <View style={[styles.planBadge, isProActive && styles.planBadgePro]}>
            <Text style={[styles.planBadgeText, isProActive && styles.planBadgeTextPro]}>
              {isProActive ? 'PRO' : 'FREE PLAN'}
            </Text>
          </View>
        </View>

        {/* Pro hero card */}
        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <CrownIcon />
            <Text style={styles.heroTitle}>TradingApp Pro</Text>
          </View>

          {/* Period toggle */}
          {!isProActive && (
            <View style={styles.periodToggle}>
              <TouchableOpacity
                style={[styles.periodBtn, selectedPeriod === 'monthly' && styles.periodBtnActive]}
                onPress={() => setSelectedPeriod('monthly')}>
                <Text style={[styles.periodBtnText, selectedPeriod === 'monthly' && styles.periodBtnTextActive]}>
                  Monthly
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.periodBtn, selectedPeriod === 'yearly' && styles.periodBtnActive]}
                onPress={() => setSelectedPeriod('yearly')}>
                <Text style={[styles.periodBtnText, selectedPeriod === 'yearly' && styles.periodBtnTextActive]}>
                  Yearly
                </Text>
                {yearlySavings > 0 && (
                  <View style={styles.saveBadge}>
                    <Text style={styles.saveBadgeText}>Save {yearlySavings}%</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.priceRow}>
            <Text style={styles.priceAmount}>
              {selectedPeriod === 'monthly' ? displayMonthlyPrice : displayYearlyPrice}
            </Text>
            <Text style={styles.priceUnit}>
              /{selectedPeriod === 'monthly' ? 'month' : 'year'}
            </Text>
          </View>

          <View style={styles.featureList}>
            {proFeatures.map(f => (
              <View key={f} style={styles.featureRow}>
                <CheckIcon size={18} color="#10B981" />
                <Text style={styles.featureText}>{f}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Comparison section */}
        <Text style={styles.sectionLabel}>FREE VS PRO</Text>
        <View style={styles.comparisonCard}>
          <View style={styles.compHeaderRow}>
            <Text style={[styles.compHeaderCell, {flex: 1.4}]}>Feature</Text>
            <Text style={styles.compHeaderCell}>Free</Text>
            <Text style={[styles.compHeaderCell, {color: '#10B981'}]}>Pro</Text>
          </View>

          {comparisonRows.map((row, idx) => (
            <View
              key={row.feature}
              style={[
                styles.compRow,
                idx === comparisonRows.length - 1 && {borderBottomWidth: 0},
              ]}>
              <Text style={[styles.compFeature, {flex: 1.4}]}>{row.feature}</Text>
              <View style={styles.compCell}>
                {typeof row.free === 'boolean' ? (
                  row.free ? <CheckIcon size={16} /> : <XMarkIcon size={16} />
                ) : (
                  <Text style={styles.compValue}>{row.free}</Text>
                )}
              </View>
              <View style={styles.compCell}>
                {typeof row.pro === 'boolean' ? (
                  row.pro ? <CheckIcon size={16} /> : <XMarkIcon size={16} />
                ) : (
                  <Text style={[styles.compValue, {color: '#10B981'}]}>{row.pro}</Text>
                )}
              </View>
            </View>
          ))}
        </View>

        {/* Info text */}
        <View style={styles.infoRow}>
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
            <Circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth={1.5} />
            <Path d="M12 16v-4M12 8h.01" stroke="rgba(255,255,255,0.3)" strokeWidth={2} strokeLinecap="round" />
          </Svg>
          <Text style={styles.infoText}>
            Platform takes 7% of all profit generated by bots. Payment is handled securely via Google Play.
          </Text>
        </View>

        {/* Restore purchases */}
        <TouchableOpacity style={styles.restoreBtn} activeOpacity={0.7} onPress={handleRestore}>
          <RestoreIcon size={14} color="#10B981" />
          <Text style={styles.restoreBtnText}>Restore Purchases</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Subscribe CTA */}
      <View style={styles.footer}>
        {isProActive ? (
          <TouchableOpacity
            style={[styles.subscribeBtn, {backgroundColor: 'rgba(239,68,68,0.15)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)'}]}
            activeOpacity={0.85}
            onPress={handleCancel}>
            <Text style={[styles.subscribeBtnText, {color: '#EF4444'}]}>Manage Subscription</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.subscribeBtn, iapProcessing && {opacity: 0.6}]}
            activeOpacity={0.85}
            disabled={iapProcessing}
            onPress={handleSubscribe}>
            {iapProcessing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.subscribeBtnText}>
                Subscribe — {selectedPeriod === 'monthly' ? displayMonthlyPrice : displayYearlyPrice}/{selectedPeriod === 'monthly' ? 'mo' : 'yr'}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0A0E14'},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 54,
    paddingBottom: 14,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {fontFamily: 'Inter-SemiBold', fontSize: 17, color: '#FFFFFF'},
  scroll: {paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24},

  /* Plan badge */
  badgeRow: {alignItems: 'center', marginBottom: 20},
  planBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  planBadgePro: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16,185,129,0.1)',
  },
  planBadgeText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.5)',
  },
  planBadgeTextPro: {color: '#10B981'},

  /* Hero card */
  heroCard: {
    backgroundColor: '#161B22',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
  },
  heroHeader: {flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12},
  heroTitle: {fontFamily: 'Inter-Bold', fontSize: 20, color: '#FFFFFF'},

  /* Period toggle */
  periodToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 3,
    marginBottom: 16,
  },
  periodBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  periodBtnActive: {
    backgroundColor: 'rgba(16,185,129,0.15)',
  },
  periodBtnText: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
  },
  periodBtnTextActive: {color: '#10B981'},
  saveBadge: {
    backgroundColor: 'rgba(16,185,129,0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  saveBadgeText: {fontFamily: 'Inter-Bold', fontSize: 9, color: '#10B981', letterSpacing: 0.3},

  priceRow: {flexDirection: 'row', alignItems: 'flex-end', marginBottom: 20},
  priceAmount: {fontFamily: 'Inter-Bold', fontSize: 36, color: '#10B981'},
  priceUnit: {
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 5,
    marginLeft: 3,
  },
  featureList: {gap: 10},
  featureRow: {flexDirection: 'row', alignItems: 'center', gap: 10},
  featureText: {fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.75)'},

  /* Comparison */
  sectionLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.35)',
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  comparisonCard: {
    backgroundColor: '#161B22',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  compHeaderRow: {
    flexDirection: 'row',
    paddingBottom: 10,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  compHeaderCell: {
    flex: 1,
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  compRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  compFeature: {
    flex: 1,
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
  },
  compCell: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  compValue: {fontFamily: 'Inter-Medium', fontSize: 13, color: 'rgba(255,255,255,0.5)'},

  /* Info */
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  infoText: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
    flex: 1,
  },

  /* Restore */
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginTop: 8,
  },
  restoreBtnText: {fontFamily: 'Inter-Medium', fontSize: 13, color: '#10B981'},

  /* Footer */
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 34,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  subscribeBtn: {
    height: 56,
    backgroundColor: '#10B981',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscribeBtnText: {fontFamily: 'Inter-SemiBold', fontSize: 16, color: '#FFFFFF'},
});
