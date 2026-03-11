import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../types';
import {mockPaymentMethods} from '../../data/mockSubscription';
import Svg, {Path, Rect, Circle} from 'react-native-svg';
import ChevronLeftIcon from '../../components/icons/ChevronLeftIcon';

type Props = NativeStackScreenProps<RootStackParamList, 'PaymentMethod'>;

const CreditCardIcon = ({size = 24, color = '#FFFFFF'}: {size?: number; color?: string}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="2" y="5" width="20" height="14" rx="3" stroke={color} strokeWidth={1.5} />
    <Path d="M2 10h20" stroke={color} strokeWidth={1.5} />
    <Path d="M6 15h4" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
  </Svg>
);

const WalletCryptoIcon = ({size = 24, color = '#FFFFFF'}: {size?: number; color?: string}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="2" y="4" width="20" height="16" rx="3" stroke={color} strokeWidth={1.5} />
    <Path d="M18 12a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" fill={color} />
    <Path d="M2 8h14a4 4 0 014 4v0" stroke={color} strokeWidth={1.5} />
  </Svg>
);

const RadioIcon = ({selected}: {selected: boolean}) => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
    <Circle
      cx="12"
      cy="12"
      r="10"
      stroke={selected ? '#10B981' : 'rgba(255,255,255,0.2)'}
      strokeWidth={1.5}
    />
    {selected && <Circle cx="12" cy="12" r="5" fill="#10B981" />}
  </Svg>
);

const PlusSmallIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <Path d="M12 5v14M5 12h14" stroke="#10B981" strokeWidth={2} strokeLinecap="round" />
  </Svg>
);

export default function PaymentMethodScreen({navigation}: Props) {
  const [selectedId, setSelectedId] = useState(
    mockPaymentMethods.find(m => m.isDefault)?.id || mockPaymentMethods[0]?.id,
  );
  const [showCardForm, setShowCardForm] = useState(false);
  const [showWalletForm, setShowWalletForm] = useState(false);

  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [walletAddress, setWalletAddress] = useState('');

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
        {/* Saved methods */}
        <Text style={styles.sectionLabel}>SAVED METHODS</Text>
        {mockPaymentMethods.map(method => (
          <TouchableOpacity
            key={method.id}
            style={styles.methodCard}
            activeOpacity={0.7}
            onPress={() => setSelectedId(method.id)}>
            <View style={styles.methodIconWrap}>
              {method.type === 'card' ? (
                <CreditCardIcon size={22} color="#10B981" />
              ) : (
                <WalletCryptoIcon size={22} color="#10B981" />
              )}
            </View>
            <View style={styles.methodInfo}>
              <View style={styles.methodLabelRow}>
                <Text style={styles.methodLabel}>
                  {method.type === 'card'
                    ? `${method.label} \u2022\u2022\u2022\u2022 ${method.last4}`
                    : method.label}
                </Text>
                {method.isDefault && (
                  <View style={styles.defaultBadge}>
                    <Text style={styles.defaultBadgeText}>DEFAULT</Text>
                  </View>
                )}
              </View>
              {method.type === 'crypto' && method.last4 && (
                <Text style={styles.methodSub}>{method.last4}</Text>
              )}
            </View>
            <RadioIcon selected={selectedId === method.id} />
          </TouchableOpacity>
        ))}

        {/* Add Card */}
        <TouchableOpacity
          style={styles.addBtn}
          activeOpacity={0.7}
          onPress={() => {
            setShowCardForm(!showCardForm);
            if (showWalletForm) setShowWalletForm(false);
          }}>
          <PlusSmallIcon />
          <Text style={styles.addBtnText}>Add New Card</Text>
        </TouchableOpacity>

        {showCardForm && (
          <View style={styles.formCard}>
            <Text style={styles.inputLabel}>Card Number</Text>
            <TextInput
              style={styles.input}
              placeholder="1234 5678 9012 3456"
              placeholderTextColor="rgba(255,255,255,0.2)"
              keyboardType="number-pad"
              value={cardNumber}
              onChangeText={setCardNumber}
              maxLength={19}
            />
            <View style={styles.formRow}>
              <View style={{flex: 1}}>
                <Text style={styles.inputLabel}>Expiry</Text>
                <TextInput
                  style={styles.input}
                  placeholder="MM/YY"
                  placeholderTextColor="rgba(255,255,255,0.2)"
                  keyboardType="number-pad"
                  value={expiry}
                  onChangeText={setExpiry}
                  maxLength={5}
                />
              </View>
              <View style={{width: 12}} />
              <View style={{flex: 1}}>
                <Text style={styles.inputLabel}>CVV</Text>
                <TextInput
                  style={styles.input}
                  placeholder="123"
                  placeholderTextColor="rgba(255,255,255,0.2)"
                  keyboardType="number-pad"
                  secureTextEntry
                  value={cvv}
                  onChangeText={setCvv}
                  maxLength={4}
                />
              </View>
            </View>
            <TouchableOpacity style={styles.saveBtn} activeOpacity={0.85}>
              <Text style={styles.saveBtnText}>Save Card</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Add Crypto Wallet */}
        <TouchableOpacity
          style={[styles.addBtn, {marginTop: 12}]}
          activeOpacity={0.7}
          onPress={() => {
            setShowWalletForm(!showWalletForm);
            if (showCardForm) setShowCardForm(false);
          }}>
          <PlusSmallIcon />
          <Text style={styles.addBtnText}>Add Crypto Wallet</Text>
        </TouchableOpacity>

        {showWalletForm && (
          <View style={styles.formCard}>
            <Text style={styles.inputLabel}>Wallet Address</Text>
            <TextInput
              style={styles.input}
              placeholder="0x..."
              placeholderTextColor="rgba(255,255,255,0.2)"
              autoCapitalize="none"
              value={walletAddress}
              onChangeText={setWalletAddress}
            />
            <TouchableOpacity style={styles.saveBtn} activeOpacity={0.85}>
              <Text style={styles.saveBtnText}>Save Wallet</Text>
            </TouchableOpacity>
          </View>
        )}
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
  },

  /* Method cards */
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161B22',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  methodIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(16,185,129,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  methodInfo: {flex: 1},
  methodLabelRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  methodLabel: {fontFamily: 'Inter-SemiBold', fontSize: 15, color: '#FFFFFF'},
  methodSub: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 2},
  defaultBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(16,185,129,0.15)',
  },
  defaultBadgeText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 9,
    letterSpacing: 0.5,
    color: '#10B981',
  },

  /* Add buttons */
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.4)',
    backgroundColor: 'rgba(16,185,129,0.06)',
    marginTop: 16,
  },
  addBtnText: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#10B981'},

  /* Form card */
  formCard: {
    backgroundColor: '#161B22',
    borderRadius: 16,
    padding: 16,
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  inputLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 6,
  },
  input: {
    height: 48,
    backgroundColor: '#161B22',
    borderRadius: 12,
    paddingHorizontal: 14,
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 14,
  },
  formRow: {flexDirection: 'row'},
  saveBtn: {
    height: 48,
    backgroundColor: '#10B981',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  saveBtnText: {fontFamily: 'Inter-SemiBold', fontSize: 15, color: '#FFFFFF'},
});
