import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../types';
import type {PaymentMethodData} from '../../types';
import {paymentsApi} from '../../services/payments';
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
  const [methods, setMethods] = useState<PaymentMethodData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [showCardForm, setShowCardForm] = useState(false);
  const [showWalletForm, setShowWalletForm] = useState(false);

  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchMethods = useCallback(() => {
    setLoading(true);
    paymentsApi.getMethods()
      .then(data => {
        setMethods(data);
        if (data.length > 0 && !selectedId) {
          setSelectedId(data.find(m => m.isDefault)?.id || data[0]?.id);
        }
      })
      .catch(() => Alert.alert('Error', 'Failed to load payment methods. Pull down to retry.'))
      .finally(() => setLoading(false));
  }, [selectedId]);

  useEffect(() => {
    fetchMethods();
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeftIcon size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payment Methods</Text>
        <View style={{width: 40}} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {/* Saved methods */}
        <Text style={styles.sectionLabel}>SAVED METHODS</Text>
        {loading ? (
          <ActivityIndicator size="large" color="#10B981" style={{marginTop: 20}} />
        ) : methods.length === 0 ? (
          <Text style={{fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 20, marginBottom: 10}}>
            No payment methods saved yet.
          </Text>
        ) : null}
        {methods.map(method => (
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
            <TouchableOpacity style={styles.saveBtn} activeOpacity={0.85} disabled={saving} onPress={() => {
              // Validate card number (13-19 digits)
              const digits = cardNumber.replace(/\s/g, '');
              if (!digits || digits.length < 13 || digits.length > 19 || !/^\d+$/.test(digits)) {
                Alert.alert('Invalid Card', 'Please enter a valid card number (13-19 digits).');
                return;
              }
              // Validate expiry (MM/YY)
              if (!/^\d{2}\/\d{2}$/.test(expiry)) {
                Alert.alert('Invalid Expiry', 'Please enter expiry in MM/YY format.');
                return;
              }
              const [mm, yy] = expiry.split('/').map(Number);
              if (mm < 1 || mm > 12) {
                Alert.alert('Invalid Expiry', 'Month must be between 01 and 12.');
                return;
              }
              const now = new Date();
              const expDate = new Date(2000 + yy, mm);
              if (expDate <= now) {
                Alert.alert('Card Expired', 'This card has expired. Please use a different card.');
                return;
              }
              // Validate CVV (3-4 digits)
              if (!/^\d{3,4}$/.test(cvv)) {
                Alert.alert('Invalid CVV', 'CVV must be 3 or 4 digits.');
                return;
              }
              setSaving(true);
              paymentsApi.addMethod({type: 'card', label: 'Card', last4: digits.slice(-4)})
                .then(() => {
                  fetchMethods();
                  setShowCardForm(false);
                  setCardNumber(''); setExpiry(''); setCvv('');
                })
                .catch(err => Alert.alert('Save Failed', err?.message || 'Could not save card.'))
                .finally(() => setSaving(false));
            }}>
              <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Card'}</Text>
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
            <TouchableOpacity style={styles.saveBtn} activeOpacity={0.85} disabled={saving} onPress={() => {
              const addr = walletAddress.trim();
              if (!addr) {
                Alert.alert('Missing Address', 'Please enter a wallet address.');
                return;
              }
              // Basic wallet address validation (ETH-like or BTC-like)
              if (addr.length < 26 || addr.length > 62) {
                Alert.alert('Invalid Address', 'Please enter a valid wallet address.');
                return;
              }
              setSaving(true);
              paymentsApi.addMethod({type: 'crypto', label: 'Crypto Wallet', cryptoAddress: addr})
                .then(() => {
                  fetchMethods();
                  setShowWalletForm(false);
                  setWalletAddress('');
                })
                .catch(err => Alert.alert('Save Failed', err?.message || 'Could not save wallet.'))
                .finally(() => setSaving(false));
            }}>
              <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Wallet'}</Text>
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
