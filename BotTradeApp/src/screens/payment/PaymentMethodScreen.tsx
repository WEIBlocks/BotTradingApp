import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../types';
import Svg, {Path, Rect, Circle} from 'react-native-svg';
import ChevronLeftIcon from '../../components/icons/ChevronLeftIcon';
import {useIAP} from '../../context/IAPContext';

type Props = NativeStackScreenProps<RootStackParamList, 'PaymentMethod'>;

const GooglePlayIcon = ({size = 24, color = '#10B981'}: {size?: number; color?: string}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M3 20.5V3.5a1 1 0 011.5-.87l15 8.5a1 1 0 010 1.74l-15 8.5A1 1 0 013 20.5z" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
  </Svg>
);

const ShieldIcon = ({size = 22, color = '#10B981'}: {size?: number; color?: string}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 2l8 4v6c0 5.25-3.5 9.74-8 11-4.5-1.26-8-5.75-8-11V6l8-4z"
      stroke={color}
      strokeWidth={1.5}
      strokeLinejoin="round"
    />
    <Path d="M9 12l2 2 4-4" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const CreditCardIcon = ({size = 22, color = '#FFFFFF'}: {size?: number; color?: string}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="2" y="5" width="20" height="14" rx="3" stroke={color} strokeWidth={1.5} />
    <Path d="M2 10h20" stroke={color} strokeWidth={1.5} />
    <Path d="M6 15h4" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
  </Svg>
);

const RefreshIcon = ({size = 18, color = '#10B981'}: {size?: number; color?: string}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M1 4v6h6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const ExternalLinkIcon = ({size = 14, color = 'rgba(255,255,255,0.4)'}: {size?: number; color?: string}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const CheckIcon = ({size = 16, color = '#10B981'}: {size?: number; color?: string}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="10" fill={color} opacity={0.15} />
    <Path d="M8 12l3 3 5-6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export default function PaymentMethodScreen({navigation}: Props) {
  const {isPro, restorePurchases, processing} = useIAP();
  const [restoring, setRestoring] = useState(false);

  const handleRestore = async () => {
    setRestoring(true);
    await restorePurchases();
    setRestoring(false);
  };

  const handleManageSubscriptions = () => {
    Linking.openURL('https://play.google.com/store/account/subscriptions');
  };

  const handleManagePaymentMethods = () => {
    Linking.openURL('https://pay.google.com/gp/w/home/settings');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeftIcon size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payment Methods</Text>
        <View style={{width: 40}} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Google Play Payment */}
        <Text style={styles.sectionLabel}>PAYMENT PROVIDER</Text>
        <View style={styles.providerCard}>
          <View style={styles.providerIconWrap}>
            <GooglePlayIcon size={24} color="#10B981" />
          </View>
          <View style={styles.providerInfo}>
            <Text style={styles.providerName}>Google Play</Text>
            <Text style={styles.providerSub}>All payments are handled securely through Google Play Billing</Text>
          </View>
        </View>

        {/* Current Status */}
        <Text style={styles.sectionLabel}>SUBSCRIPTION STATUS</Text>
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Plan</Text>
            <View style={[styles.statusBadge, isPro && styles.statusBadgePro]}>
              <Text style={[styles.statusBadgeText, isPro && styles.statusBadgeTextPro]}>
                {isPro ? 'PRO' : 'FREE'}
              </Text>
            </View>
          </View>
          {isPro && (
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Status</Text>
              <View style={styles.activeRow}>
                <View style={styles.activeDot} />
                <Text style={styles.activeText}>Active</Text>
              </View>
            </View>
          )}
        </View>

        {/* How It Works */}
        <Text style={styles.sectionLabel}>HOW PAYMENTS WORK</Text>
        <View style={styles.infoCard}>
          {[
            {icon: <GooglePlayIcon size={18} color="#10B981" />, text: 'All purchases use your Google Play account payment method'},
            {icon: <CreditCardIcon size={18} color="#10B981" />, text: 'Add or change cards directly in Google Play settings'},
            {icon: <ShieldIcon size={18} color="#10B981" />, text: 'Transactions are protected by Google Play Protect'},
          ].map((item, i) => (
            <View key={i} style={styles.infoRow}>
              <View style={styles.infoIconWrap}>{item.icon}</View>
              <Text style={styles.infoText}>{item.text}</Text>
            </View>
          ))}
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionLabel}>MANAGE</Text>

        <TouchableOpacity style={styles.actionCard} activeOpacity={0.7} onPress={handleManagePaymentMethods}>
          <View style={styles.actionIconWrap}>
            <CreditCardIcon size={20} color="#10B981" />
          </View>
          <View style={styles.actionInfo}>
            <Text style={styles.actionTitle}>Payment Methods</Text>
            <Text style={styles.actionSub}>Add, remove, or update cards in Google Pay</Text>
          </View>
          <ExternalLinkIcon size={14} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionCard} activeOpacity={0.7} onPress={handleManageSubscriptions}>
          <View style={styles.actionIconWrap}>
            <GooglePlayIcon size={20} color="#10B981" />
          </View>
          <View style={styles.actionInfo}>
            <Text style={styles.actionTitle}>Manage Subscriptions</Text>
            <Text style={styles.actionSub}>View, cancel, or change subscription plans</Text>
          </View>
          <ExternalLinkIcon size={14} />
        </TouchableOpacity>

        {/* Restore Purchases */}
        <TouchableOpacity
          style={styles.restoreBtn}
          activeOpacity={0.7}
          onPress={handleRestore}
          disabled={restoring || processing}>
          {restoring ? (
            <ActivityIndicator size="small" color="#10B981" />
          ) : (
            <>
              <RefreshIcon size={16} color="#10B981" />
              <Text style={styles.restoreBtnText}>Restore Purchases</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Benefits */}
        <Text style={styles.sectionLabel}>GOOGLE PLAY BENEFITS</Text>
        <View style={styles.benefitsCard}>
          {[
            'Secure payment processing',
            'Family payment methods supported',
            'Purchase history in Play Store',
            'Easy refund requests',
            'Fraud protection included',
          ].map(benefit => (
            <View key={benefit} style={styles.benefitRow}>
              <CheckIcon size={16} color="#10B981" />
              <Text style={styles.benefitText}>{benefit}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
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
  scroll: {paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32},

  sectionLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.35)',
    textTransform: 'uppercase',
    marginBottom: 12,
    marginTop: 20,
  },

  /* Provider card */
  providerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161B22',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.2)',
  },
  providerIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(16,185,129,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  providerInfo: {flex: 1},
  providerName: {fontFamily: 'Inter-SemiBold', fontSize: 16, color: '#FFFFFF', marginBottom: 4},
  providerSub: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 17},

  /* Status card */
  statusCard: {
    backgroundColor: '#161B22',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  statusLabel: {fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.5)'},
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  statusBadgePro: {backgroundColor: 'rgba(16,185,129,0.15)'},
  statusBadgeText: {fontFamily: 'Inter-SemiBold', fontSize: 11, letterSpacing: 0.5, color: 'rgba(255,255,255,0.5)'},
  statusBadgeTextPro: {color: '#10B981'},
  activeRow: {flexDirection: 'row', alignItems: 'center', gap: 6},
  activeDot: {width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981'},
  activeText: {fontFamily: 'Inter-Medium', fontSize: 13, color: '#10B981'},

  /* Info card */
  infoCard: {
    backgroundColor: '#161B22',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: 14,
  },
  infoRow: {flexDirection: 'row', alignItems: 'center', gap: 12},
  infoIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(16,185,129,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoText: {fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.6)', flex: 1, lineHeight: 18},

  /* Action cards */
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161B22',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  actionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(16,185,129,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  actionInfo: {flex: 1},
  actionTitle: {fontFamily: 'Inter-SemiBold', fontSize: 15, color: '#FFFFFF', marginBottom: 2},
  actionSub: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.35)'},

  /* Restore */
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.4)',
    backgroundColor: 'rgba(16,185,129,0.06)',
    marginTop: 12,
  },
  restoreBtnText: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#10B981'},

  /* Benefits */
  benefitsCard: {
    backgroundColor: '#161B22',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: 12,
  },
  benefitRow: {flexDirection: 'row', alignItems: 'center', gap: 10},
  benefitText: {fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.6)'},
});
