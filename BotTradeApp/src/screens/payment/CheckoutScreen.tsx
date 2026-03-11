import React from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../types';
import Svg, {Path, Rect, Circle} from 'react-native-svg';
import ChevronLeftIcon from '../../components/icons/ChevronLeftIcon';

type Props = NativeStackScreenProps<RootStackParamList, 'Checkout'>;

const CreditCardSmallIcon = ({size = 20, color = '#10B981'}: {size?: number; color?: string}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="2" y="5" width="20" height="14" rx="3" stroke={color} strokeWidth={1.5} />
    <Path d="M2 10h20" stroke={color} strokeWidth={1.5} />
    <Path d="M6 15h4" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
  </Svg>
);

const LockSmallIcon = ({size = 14, color = 'rgba(255,255,255,0.3)'}: {size?: number; color?: string}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="5" y="11" width="14" height="10" rx="2" stroke={color} strokeWidth={1.5} />
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
  const {type, itemId, amount} = route.params;

  const itemName =
    type === 'subscription' ? 'TradingApp Pro Subscription' : `Bot — ${itemId}`;

  const platformFeeRate = 0.07;
  const subtotal = amount;
  const platformFee = parseFloat((subtotal * platformFeeRate).toFixed(2));
  const discount = type === 'subscription' ? 0 : 0;
  const total = parseFloat((subtotal + platformFee - discount).toFixed(2));

  const handleConfirm = () => {
    Alert.alert('Payment successful!', 'Your payment has been processed.', [
      {text: 'OK', onPress: () => navigation.navigate('Main')},
    ]);
  };

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
          <Text style={styles.itemPrice}>${amount.toFixed(2)}/mo</Text>
        </View>

        {/* Payment Method */}
        <Text style={styles.sectionLabel}>PAYMENT METHOD</Text>
        <View style={styles.card}>
          <View style={styles.paymentRow}>
            <View style={styles.paymentIconWrap}>
              <CreditCardSmallIcon size={20} color="#10B981" />
            </View>
            <View style={styles.paymentInfo}>
              <Text style={styles.paymentLabel}>Visa {'\u2022\u2022\u2022\u2022'} 4242</Text>
              <Text style={styles.paymentSub}>Default payment method</Text>
            </View>
            <TouchableOpacity
              onPress={() => navigation.navigate('PaymentMethod')}
              activeOpacity={0.7}>
              <Text style={styles.changeLink}>Change</Text>
            </TouchableOpacity>
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
            <Text style={styles.breakdownLabel}>Platform Fee (7%)</Text>
            <Text style={styles.breakdownValue}>${platformFee.toFixed(2)}</Text>
          </View>
          {discount > 0 && (
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Discount</Text>
              <Text style={[styles.breakdownValue, {color: '#10B981'}]}>
                -${discount.toFixed(2)}
              </Text>
            </View>
          )}
          <View style={styles.divider} />
          <View style={styles.breakdownRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.secRow}>
          <LockSmallIcon size={13} color="rgba(255,255,255,0.3)" />
          <Text style={styles.secText}>Secure payment {'\u00B7'} 256-bit encryption</Text>
        </View>
        <TouchableOpacity
          style={styles.confirmBtn}
          activeOpacity={0.85}
          onPress={handleConfirm}>
          <Text style={styles.confirmBtnText}>Confirm Payment</Text>
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
  changeLink: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#10B981'},

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
