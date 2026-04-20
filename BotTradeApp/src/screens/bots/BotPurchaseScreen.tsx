import React, {useState, useEffect, useCallback} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../types';
import type {Bot} from '../../types';
import {marketplaceApi} from '../../services/marketplace';
import {botsService} from '../../services/bots';
import {configApi} from '../../services/config';
import ChevronLeftIcon from '../../components/icons/ChevronLeftIcon';
import CheckCircleIcon from '../../components/icons/CheckCircleIcon';
import LockIcon from '../../components/icons/LockIcon';
import {useIAP} from '../../context/IAPContext';
import {useToast} from '../../context/ToastContext';
import {useAuth} from '../../context/AuthContext';
import Svg, {Path, Circle, Rect} from 'react-native-svg';
import {api} from '../../services/api';

type Props = NativeStackScreenProps<RootStackParamList, 'BotPurchase'>;

interface ExchangeInfo {
  id: string;
  provider: string;
  assetClass: 'crypto' | 'stocks';
  totalBalance: number;
  status: string;
  sandbox: boolean;
}

const GooglePlayIcon = ({size = 16}: {size?: number}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M3 20.5V3.5a1 1 0 011.5-.87l15 8.5a1 1 0 010 1.74l-15 8.5A1 1 0 013 20.5z" stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} strokeLinejoin="round" />
  </Svg>
);

function CryptoIcon({size = 16}: {size?: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} stroke="#F59E0B" strokeWidth={1.5} />
      <Path d="M9 8h4.5a2.5 2.5 0 010 5H9m0-5v8m0-8v8m4.5-3H9" stroke="#F59E0B" strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

function StocksIcon({size = 16}: {size?: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 17l4-4 4 4 4-6 4 2" stroke="#3B82F6" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Rect x={3} y={19} width={18} height={1.5} rx={0.75} fill="#3B82F6" />
    </Svg>
  );
}

function WarningIcon({size = 16}: {size?: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#F97316" strokeWidth={1.5} strokeLinejoin="round" />
      <Path d="M12 9v4M12 17h.01" stroke="#F97316" strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

/** Map bot category to required exchange asset class */
function getRequiredAssetClass(botCategory: string): 'crypto' | 'stocks' {
  return botCategory.toLowerCase() === 'stocks' ? 'stocks' : 'crypto';
}

export default function BotPurchaseScreen({navigation, route}: Props) {
  const [bot, setBot] = useState<Bot | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [feeRate, setFeeRate] = useState(0.07);
  const [exchanges, setExchanges] = useState<ExchangeInfo[]>([]);
  const [allocatedAmount, setAllocatedAmount] = useState('');
  const [amountError, setAmountError] = useState('');
  const [minOrderInput, setMinOrderInput] = useState('');
  const [minOrderError, setMinOrderError] = useState('');

  const {purchaseBot, processing: iapProcessing, isPro} = useIAP();
  const {alert: showAlert, showConfirm} = useToast();
  const {user} = useAuth();
  const isAdmin = user?.role === 'admin';

  // Redirect to Subscription screen if not Pro (guard for direct navigation)
  React.useEffect(() => {
    if (!isAdmin && !isPro) {
      showAlert('Pro Required', 'Live bot trading requires an active Pro subscription.');
      navigation.replace('Subscription');
    }
  }, []); // Run once on mount only

  useEffect(() => {
    Promise.all([
      marketplaceApi.getBotDetails(route.params.botId),
      api.get('/exchange/user/connections').then((r: any) => {
        const list = Array.isArray(r?.data) ? r.data : Array.isArray(r) ? r : [];
        return list as ExchangeInfo[];
      }).catch(() => [] as ExchangeInfo[]),
      configApi.getPlatformConfig().catch(() => ({platformFeeRate: 0.07})),
    ])
      .then(([botData, exchangeList, config]) => {
        setBot(botData);
        setExchanges(exchangeList);
        setFeeRate(config.platformFeeRate || 0.07);

        // Pre-fill amount with available balance for matching exchange
        const required = getRequiredAssetClass(botData.category ?? 'Crypto');
        const match = exchangeList.find((e: ExchangeInfo) => e.assetClass === required && e.status === 'connected');
        if (match) {
          setAllocatedAmount(String(Math.floor(match.totalBalance)));
        }
        // Default min order: $1 for stocks, $10 for crypto (reuse `required` declared above)
        setMinOrderInput(required === 'stocks' ? '1' : '10');
      })
      .catch(() => showAlert('Error', 'Failed to load bot details'))
      .finally(() => setLoading(false));
  }, [route.params.botId]);

  const requiredAssetClass = bot ? getRequiredAssetClass(bot.category ?? 'Crypto') : 'crypto';
  const matchingExchange = exchanges.find(e => e.assetClass === requiredAssetClass && e.status === 'connected');
  const availableBalance = matchingExchange ? matchingExchange.totalBalance : 0;
  const parsedAmount = parseFloat(allocatedAmount) || 0;

  const minFloor = requiredAssetClass === 'stocks' ? 1 : 10;
  const parsedMinOrder = parseFloat(minOrderInput) || minFloor;

  const validateAmount = useCallback((val: string): string => {
    const num = parseFloat(val);
    if (!val || isNaN(num) || num <= 0) return 'Enter a valid amount greater than 0';
    if (availableBalance <= 0) return `No funds available in your ${requiredAssetClass} exchange`;
    if (num > availableBalance) {
      return `Exceeds available ${requiredAssetClass === 'stocks' ? 'stock' : 'crypto'} balance ($${availableBalance.toLocaleString()})`;
    }
    return '';
  }, [availableBalance, requiredAssetClass]);

  const validateMinOrder = useCallback((val: string): string => {
    const num = parseFloat(val);
    if (!val || isNaN(num) || num <= 0) return 'Enter a valid minimum order amount';
    if (num < minFloor) return `Minimum must be at least $${minFloor} for ${requiredAssetClass}`;
    return '';
  }, [minFloor, requiredAssetClass]);

  const handleAmountChange = (val: string) => {
    // Only allow numbers and one decimal point
    const cleaned = val.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    setAllocatedAmount(cleaned);
    setAmountError(validateAmount(cleaned));
  };

  const handleMaxPress = () => {
    const val = String(Math.floor(availableBalance));
    setAllocatedAmount(val);
    setAmountError(validateAmount(val));
  };

  const doActivate = async () => {
    if (!bot) return;
    const err = validateAmount(allocatedAmount);
    if (err) { setAmountError(err); return; }
    const minErr = validateMinOrder(minOrderInput);
    if (minErr) { setMinOrderError(minErr); return; }
    if (!matchingExchange) {
      const label = requiredAssetClass === 'stocks' ? 'stock (Alpaca)' : 'crypto';
      showAlert('No Exchange Connected', `This bot requires a connected ${label} exchange. Please connect one first.`);
      return;
    }
    if (availableBalance <= 0) {
      showAlert('No Funds Available', `Your ${matchingExchange.provider} account has no available balance. Please deposit funds before activating live trading.`);
      return;
    }

    setActivating(true);
    try {
      await botsService.purchase(bot.id, {mode: 'live', allocatedAmount: parsedAmount, minOrderValue: parsedMinOrder});
      showAlert('Bot Activated!', `${bot.name} is now running live with $${parsedAmount.toLocaleString()} allocated.`);
      navigation.navigate('Main');
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to activate bot. Please try again.';
      showAlert('Error', msg);
    } finally {
      setActivating(false);
    }
  };

  const handleActivate = async () => {
    if (!bot) return;
    const err = validateAmount(allocatedAmount);
    if (err) { setAmountError(err); return; }
    const minErr = validateMinOrder(minOrderInput);
    if (minErr) { setMinOrderError(minErr); return; }

    if (bot.price > 0 && !isAdmin) {
      showConfirm({
        title: 'Confirm Purchase',
        message: `Purchase ${bot.name} for $${bot.price}/month?\n\nAllocated capital: $${parsedAmount.toLocaleString()}\nPayment will be handled securely through Google Play.`,
        confirmText: 'Purchase',
        onConfirm: async () => {
          setActivating(true);
          try {
            const success = await purchaseBot(bot.id, bot.price);
            if (success) {
              await botsService.purchase(bot.id, {mode: 'live', allocatedAmount: parsedAmount, minOrderValue: parsedMinOrder});
              showAlert('Bot Activated!', `${bot.name} is now running live with $${parsedAmount.toLocaleString()} allocated.`);
              navigation.navigate('Main');
            }
          } catch (err: any) {
            const msg = err?.response?.data?.message || err?.message || 'Failed to activate bot. Please try again.';
            showAlert('Error', msg);
          } finally {
            setActivating(false);
          }
        },
      });
      return;
    }

    showConfirm({
      title: 'Confirm Activation',
      message: `Activate ${bot.name} for free?\n\nAllocated capital: $${parsedAmount.toLocaleString()} from ${matchingExchange?.provider ?? 'exchange'}`,
      confirmText: 'Activate',
      onConfirm: doActivate,
    });
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

  const isProcessing = activating || iapProcessing;
  const isStockBot = requiredAssetClass === 'stocks';
  const assetColor = isStockBot ? '#3B82F6' : '#F59E0B';
  const assetLabel = isStockBot ? 'Stock' : 'Crypto';
  // Exchange connected but no funds = cannot activate (applies to all users including admin)
  const hasInsufficientBalance = !!matchingExchange && availableBalance <= 0;
  const canActivate = !amountError && !minOrderError && parsedAmount > 0 && parsedMinOrder >= minFloor && !!matchingExchange && !hasInsufficientBalance;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeftIcon size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Activate Bot</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Bot summary */}
        <View style={styles.botCard}>
          <View style={[styles.botAvatar, {backgroundColor: bot.avatarColor}]}>
            <Text style={styles.botAvatarText}>{bot.avatarLetter}</Text>
          </View>
          <Text style={styles.botName}>{bot.name}</Text>
          <Text style={styles.botStats}>{bot.returnPercent.toFixed(1)}% 30D • {bot.winRate}% Win Rate</Text>
          {/* Asset class badge */}
          <View style={[styles.assetBadge, {backgroundColor: `${assetColor}18`, borderColor: `${assetColor}40`}]}>
            {isStockBot ? <StocksIcon size={13} /> : <CryptoIcon size={13} />}
            <Text style={[styles.assetBadgeText, {color: assetColor}]}>{assetLabel} Bot</Text>
          </View>
        </View>

        {/* Plan card */}
        <View style={styles.planCard}>
          <View style={styles.planHeader}>
            <Text style={styles.planName}>Monthly Plan</Text>
            <View style={styles.planPrice}>
              <Text style={styles.priceAmount}>{bot.price === 0 ? 'Free' : `$${bot.price}`}</Text>
              {bot.price > 0 && <Text style={styles.priceUnit}>/month</Text>}
            </View>
          </View>
          <Text style={styles.platformFee}>+ {Math.round(feeRate * 100)}% platform fee on profits earned</Text>
        </View>

        {/* Exchange info */}
        <Text style={styles.sectionLabel}>TRADING CAPITAL</Text>

        {matchingExchange ? (
          <>
            <View style={[styles.exchangeCard, {borderColor: hasInsufficientBalance ? 'rgba(239,68,68,0.3)' : `${assetColor}30`}]}>
              <View style={styles.exchangeRow}>
                <View style={[styles.exchangeDot, {backgroundColor: hasInsufficientBalance ? '#EF4444' : assetColor}]} />
                <Text style={styles.exchangeName}>{matchingExchange.provider}</Text>
                {matchingExchange.sandbox && (
                  <View style={styles.sandboxBadge}>
                    <Text style={styles.sandboxText}>TEST</Text>
                  </View>
                )}
                <Text style={[styles.exchangeBalance, hasInsufficientBalance && {color: '#EF4444'}]}>
                  ${availableBalance.toLocaleString(undefined, {maximumFractionDigits: 2})}
                </Text>
              </View>
              <Text style={styles.exchangeSub}>Available {assetLabel} balance</Text>
            </View>
            {hasInsufficientBalance && (
              <View style={styles.noExchangeCard}>
                <WarningIcon size={18} />
                <View style={{flex: 1}}>
                  <Text style={styles.noExchangeTitle}>No Funds Available</Text>
                  <Text style={styles.noExchangeSub}>
                    Your {matchingExchange.provider} account has $0 balance. Deposit funds to activate live trading.
                  </Text>
                </View>
              </View>
            )}
          </>
        ) : (
          <View style={styles.noExchangeCard}>
            <WarningIcon size={18} />
            <View style={{flex: 1}}>
              <Text style={styles.noExchangeTitle}>No {assetLabel} Exchange Connected</Text>
              <Text style={styles.noExchangeSub}>
                {isStockBot
                  ? 'Connect an Alpaca account to run this stock bot.'
                  : 'Connect Binance or Coinbase to run this crypto bot.'}
              </Text>
            </View>
          </View>
        )}

        {/* Allocated amount input */}
        <View style={[styles.amountCard, amountError ? {borderColor: 'rgba(239,68,68,0.4)'} : {}]}>
          <View style={styles.amountHeader}>
            <Text style={styles.amountLabel}>AMOUNT TO ALLOCATE</Text>
            {matchingExchange && (
              <TouchableOpacity onPress={handleMaxPress} activeOpacity={0.7} style={styles.maxBtn}>
                <Text style={[styles.maxBtnText, {color: assetColor}]}>MAX</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.amountInputRow}>
            <Text style={styles.dollarSign}>$</Text>
            <TextInput
              style={styles.amountInput}
              value={allocatedAmount}
              onChangeText={handleAmountChange}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor="rgba(255,255,255,0.2)"
              editable={!!matchingExchange}
            />
          </View>
          {amountError ? (
            <Text style={styles.amountError}>{amountError}</Text>
          ) : parsedAmount > 0 && availableBalance > 0 ? (
            <Text style={styles.amountSub}>
              {((parsedAmount / availableBalance) * 100).toFixed(0)}% of your {assetLabel.toLowerCase()} balance
            </Text>
          ) : null}
        </View>

        {/* Minimum order value input */}
        <View style={[styles.amountCard, minOrderError ? {borderColor: 'rgba(239,68,68,0.4)'} : {}, {marginTop: 0}]}>
          <View style={styles.amountHeader}>
            <Text style={styles.amountLabel}>MIN ORDER VALUE (PER TRADE)</Text>
          </View>
          <View style={styles.amountInputRow}>
            <Text style={styles.dollarSign}>$</Text>
            <TextInput
              style={[styles.amountInput, {fontSize: 28}]}
              value={minOrderInput}
              onChangeText={v => {
                const cleaned = v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
                setMinOrderInput(cleaned);
                setMinOrderError(validateMinOrder(cleaned));
              }}
              keyboardType="decimal-pad"
              placeholder={String(minFloor)}
              placeholderTextColor="rgba(255,255,255,0.2)"
            />
          </View>
          {minOrderError ? (
            <Text style={styles.amountError}>{minOrderError}</Text>
          ) : (
            <Text style={styles.amountSub}>
              Bot skips any trade below this amount · min ${minFloor} for {requiredAssetClass}
            </Text>
          )}
        </View>

        {/* Features */}
        <Text style={[styles.sectionLabel, {marginTop: 20}]}>WHAT'S INCLUDED</Text>
        {features.map(f => (
          <View key={f} style={styles.featureRow}>
            <CheckCircleIcon size={18} color="#10B981" />
            <Text style={styles.featureText}>{f}</Text>
          </View>
        ))}

        {/* Payment info */}
        {bot.price > 0 && (
          <View style={styles.paymentInfoCard}>
            <GooglePlayIcon size={16} />
            <Text style={styles.paymentInfoText}>
              Payment processed securely via Google Play. Cancel anytime from Play Store.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.secRow}>
          <LockIcon size={12} color="rgba(255,255,255,0.3)" />
          <Text style={styles.secText}>Secured by Google Play • Cancel anytime</Text>
        </View>
        <TouchableOpacity
          style={[styles.activateBtn, (!canActivate || isProcessing) && {opacity: 0.5}]}
          onPress={handleActivate}
          activeOpacity={0.85}
          disabled={!canActivate || isProcessing}>
          {isProcessing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.activateBtnText}>
              {bot.price === 0 ? 'Activate Free' : `Pay $${bot.price} & Activate`}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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
  botStats: {fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 10},
  assetBadge: {flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1},
  assetBadgeText: {fontFamily: 'Inter-SemiBold', fontSize: 11},

  planCard: {backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)'},
  planHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6},
  planName: {fontFamily: 'Inter-SemiBold', fontSize: 16, color: '#FFFFFF'},
  planPrice: {flexDirection: 'row', alignItems: 'flex-end'},
  priceAmount: {fontFamily: 'Inter-Bold', fontSize: 28, color: '#10B981'},
  priceUnit: {fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 4, marginLeft: 2},
  platformFee: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.4)'},

  sectionLabel: {fontFamily: 'Inter-Medium', fontSize: 10, letterSpacing: 1, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 10},

  exchangeCard: {backgroundColor: '#161B22', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1},
  exchangeRow: {flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4},
  exchangeDot: {width: 8, height: 8, borderRadius: 4},
  exchangeName: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF', flex: 1},
  exchangeBalance: {fontFamily: 'Inter-Bold', fontSize: 15, color: '#FFFFFF'},
  exchangeSub: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.35)', marginLeft: 16},
  sandboxBadge: {backgroundColor: 'rgba(251,191,36,0.15)', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2},
  sandboxText: {fontFamily: 'Inter-Bold', fontSize: 9, color: '#FBBF24', letterSpacing: 0.5},

  noExchangeCard: {flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: 'rgba(249,115,22,0.08)', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(249,115,22,0.25)'},
  noExchangeTitle: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#F97316', marginBottom: 3},
  noExchangeSub: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 17},

  amountCard: {backgroundColor: '#161B22', borderRadius: 14, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)'},
  amountHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10},
  amountLabel: {fontFamily: 'Inter-Medium', fontSize: 10, letterSpacing: 1, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase'},
  maxBtn: {backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3},
  maxBtnText: {fontFamily: 'Inter-Bold', fontSize: 11},
  amountInputRow: {flexDirection: 'row', alignItems: 'center'},
  dollarSign: {fontFamily: 'Inter-Bold', fontSize: 28, color: 'rgba(255,255,255,0.3)', marginRight: 4},
  amountInput: {flex: 1, fontFamily: 'Inter-Bold', fontSize: 34, color: '#FFFFFF', padding: 0},
  amountError: {fontFamily: 'Inter-Regular', fontSize: 12, color: '#EF4444', marginTop: 6},
  amountSub: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 6},

  featureRow: {flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10},
  featureText: {fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.7)'},

  paymentInfoCard: {flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 14, marginTop: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)'},
  paymentInfoText: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.35)', flex: 1},

  footer: {paddingHorizontal: 20, paddingBottom: 32, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)'},
  secRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 12},
  secText: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.3)'},
  activateBtn: {height: 56, backgroundColor: '#10B981', borderRadius: 14, alignItems: 'center', justifyContent: 'center'},
  activateBtnText: {fontFamily: 'Inter-SemiBold', fontSize: 16, color: '#FFFFFF'},
});
