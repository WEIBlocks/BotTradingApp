import React, {useState, useEffect} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../types';
import {useToast} from '../../context/ToastContext';
import Svg, {Path, Circle} from 'react-native-svg';
import ChevronLeftIcon from '../../components/icons/ChevronLeftIcon';
import {configApi} from '../../services/config';
import {subscriptionApi} from '../../services/subscription';
import {botsService} from '../../services/bots';
import {useIAP} from '../../context/IAPContext';
import {SUB_SKUS} from '../../services/iap';

type Props = NativeStackScreenProps<RootStackParamList, 'Checkout'>;

const GooglePlayIcon = ({size = 20}: {size?: number}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M3 20.5V3.5a1 1 0 011.5-.87l15 8.5a1 1 0 010 1.74l-15 8.5A1 1 0 013 20.5z" stroke="#10B981" strokeWidth={1.5} strokeLinejoin="round" />
  </Svg>
);

const LockSmallIcon = ({size = 14, color = 'rgba(255,255,255,0.3)'}: {size?: number; color?: string}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M5 11h14v10H5z" stroke={color} strokeWidth={1.5} />
    <Path d="M8 11V7a4 4 0 018 0v4" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    <Circle cx="12" cy="16" r="1.5" fill={color} />
  </Svg>
);

const ShieldIcon = () => (
  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 2l8 4v6c0 5.25-3.5 9.74-8 11-4.5-1.26-8-5.75-8-11V6l8-4z"
      stroke="rgba(255,255,255,0.25)"
      strokeWidth={1.5}
      strokeLinejoin="round"
    />
    <Path d="M9 12l2 2 4-4" stroke="rgba(255,255,255,0.25)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export default function CheckoutScreen({navigation, route}: Props) {
  const {alert: showAlert} = useToast();
  const {type, itemId, amount} = route.params;
  const [processing, setProcessing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [platformFeeRate, setPlatformFeeRate] = useState(0.07);
  const [proDiscount, setProDiscount] = useState(0);

  const {
    purchaseSubscription,
    purchaseBot,
    subscriptionProducts,
    isPro,
    processing: iapProcessing,
  } = useIAP();

  useEffect(() => {
    Promise.all([
      configApi.getPlatformConfig().catch(() => ({platformFeeRate: 0.07, proDiscountRate: 0.03})),
      subscriptionApi.getCurrent().catch(() => null),
    ]).then(([config, sub]) => {
      setPlatformFeeRate(config.platformFeeRate ?? 0.07);
      const isProSub = isPro || (sub?.tier === 'pro' && sub?.status === 'active');
      if (isProSub && type !== 'subscription') {
        setProDiscount(config.proDiscountRate ?? 0.03);
      }
    }).finally(() => setLoading(false));
  }, [type, isPro]);

  const itemName =
    type === 'subscription' ? 'TradingApp Pro Subscription' : `Bot — ${itemId}`;

  const subtotal = amount;
  const effectiveFeeRate = Math.max(0, platformFeeRate - proDiscount);
  const platformFee = parseFloat((subtotal * effectiveFeeRate).toFixed(2));
  const total = parseFloat((subtotal + platformFee).toFixed(2));

  // Get store product info
  const isSub = type === 'subscription';
  const monthlySku = SUB_SKUS[0] || 'tradingapp_pro_monthly';
  const subProduct = subscriptionProducts.find(p => p.productId === monthlySku);
  const subOfferDetails = subProduct && 'subscriptionOfferDetails' in subProduct
    ? (subProduct as any).subscriptionOfferDetails : undefined;
  const storePrice = isSub && subOfferDetails
    ? subOfferDetails[0]?.pricingPhases?.pricingPhaseList?.[0]?.formattedPrice
    : null;

  const handleConfirm = async () => {
    if (processing || iapProcessing) return;
    setProcessing(true);

    try {
      if (isSub) {
        // Subscription via Google Play
        const offerToken = subOfferDetails?.[0]?.offerToken;
        const success = await purchaseSubscription(monthlySku, offerToken);
        if (success) {
          // Also register on backend
          await subscriptionApi.subscribe(itemId).catch(() => {});
          showAlert('Subscription Active!', 'Welcome to TradingApp Pro!');
          navigation.navigate('Main');
        }
      } else {
        // Bot purchase via Google Play
        const success = await purchaseBot(itemId, amount);
        if (success) {
          // Activate bot on backend
          await botsService.purchase(itemId, {mode: 'live'});
          showAlert('Purchase Complete!', 'Your bot is now active.');
          navigation.navigate('Main');
        }
      }
    } catch (e: any) {
      showAlert('Payment Failed', e?.message || 'Could not process payment.');
    } finally {
      setProcessing(false);
    }
  };

  const isProcessing = processing || iapProcessing;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeftIcon size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Checkout</Text>
        <View style={{width: 40}} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Order Summary */}
        <Text style={styles.sectionLabel}>ORDER SUMMARY</Text>
        <View style={styles.card}>
          <Text style={styles.itemName}>{itemName}</Text>
          <Text style={styles.itemPrice}>
            {storePrice || `$${amount.toFixed(2)}`}{isSub ? '/mo' : ''}
          </Text>
        </View>

        {/* Payment Method — Google Play */}
        <Text style={styles.sectionLabel}>PAYMENT METHOD</Text>
        <View style={styles.card}>
          <View style={styles.paymentRow}>
            <View style={styles.paymentIconWrap}>
              <GooglePlayIcon size={20} />
            </View>
            <View style={styles.paymentInfo}>
              {loading ? (
                <ActivityIndicator size="small" color="#10B981" />
              ) : (
                <>
                  <Text style={styles.paymentLabel}>Google Play</Text>
                  <Text style={styles.paymentSub}>Payment managed by Google Play Store</Text>
                </>
              )}
            </View>
            <ShieldIcon />
          </View>
        </View>

        {/* Breakdown */}
        <Text style={styles.sectionLabel}>BREAKDOWN</Text>
        <View style={styles.card}>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Subtotal</Text>
            <Text style={styles.breakdownValue}>${subtotal.toFixed(2)}</Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Platform Fee ({Math.round(effectiveFeeRate * 100)}%)</Text>
            <Text style={styles.breakdownValue}>${platformFee.toFixed(2)}</Text>
          </View>
          {proDiscount > 0 && (
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Pro Discount</Text>
              <Text style={[styles.breakdownValue, {color: '#10B981'}]}>
                -{Math.round(proDiscount * 100)}% fee reduction
              </Text>
            </View>
          )}
          <View style={styles.divider} />
          <View style={styles.breakdownRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{storePrice || `$${total.toFixed(2)}`}</Text>
          </View>
        </View>

        {/* Info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            {isSub
              ? 'Your subscription will auto-renew monthly. You can cancel anytime from Google Play Store > Subscriptions.'
              : 'One-time purchase processed through Google Play. Refunds handled per Google Play refund policy.'}
          </Text>
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.secRow}>
          <LockSmallIcon size={13} color="rgba(255,255,255,0.3)" />
          <Text style={styles.secText}>Secured by Google Play • 256-bit encryption</Text>
        </View>
        <TouchableOpacity
          style={[styles.confirmBtn, isProcessing && {opacity: 0.6}]}
          activeOpacity={0.85}
          onPress={handleConfirm}
          disabled={isProcessing}>
          {isProcessing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.confirmBtnText}>
              {isSub ? `Subscribe — ${storePrice || `$${total.toFixed(2)}/mo`}` : `Pay ${storePrice || `$${total.toFixed(2)}`}`}
            </Text>
          )}
        </TouchableOpacity>
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

  sectionLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.35)',
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 20,
  },

  card: {
    backgroundColor: '#161B22',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },

  /* Order summary */
  itemName: {fontFamily: 'Inter-SemiBold', fontSize: 16, color: '#FFFFFF', marginBottom: 6},
  itemPrice: {fontFamily: 'Inter-Bold', fontSize: 22, color: '#10B981'},

  /* Payment method */
  paymentRow: {flexDirection: 'row', alignItems: 'center'},
  paymentIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(16,185,129,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  paymentInfo: {flex: 1},
  paymentLabel: {fontFamily: 'Inter-SemiBold', fontSize: 15, color: '#FFFFFF'},
  paymentSub: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 2},

  /* Breakdown */
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  breakdownLabel: {fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.55)'},
  breakdownValue: {fontFamily: 'Inter-Medium', fontSize: 14, color: 'rgba(255,255,255,0.75)'},
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 6,
  },
  totalLabel: {fontFamily: 'Inter-Bold', fontSize: 16, color: '#FFFFFF'},
  totalValue: {fontFamily: 'Inter-Bold', fontSize: 18, color: '#FFFFFF'},

  /* Info */
  infoCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: 14,
    marginTop: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  infoText: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.35)', lineHeight: 18},

  /* Footer */
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 34,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  secRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 12,
  },
  secText: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.3)'},
  confirmBtn: {
    height: 56,
    backgroundColor: '#10B981',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {fontFamily: 'Inter-SemiBold', fontSize: 16, color: '#FFFFFF'},
});
