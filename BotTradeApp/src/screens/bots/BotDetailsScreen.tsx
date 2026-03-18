import React, {useCallback, useState} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, ActivityIndicator, RefreshControl, Alert, Modal, TextInput} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';
import {RootStackParamList, Bot} from '../../types';
import {marketplaceApi} from '../../services/marketplace';
import {botsService} from '../../services/bots';
import {useAuth} from '../../context/AuthContext';
import InteractiveChart from '../../components/charts/InteractiveChart';
import MonthlyReturnBars from '../../components/charts/MonthlyReturnBars';
import Badge from '../../components/common/Badge';
import TradeRow from '../../components/common/TradeRow';
import SectionHeader from '../../components/common/SectionHeader';
import ChevronLeftIcon from '../../components/icons/ChevronLeftIcon';
import ShareIcon from '../../components/icons/ShareIcon';
import StarIcon from '../../components/icons/StarIcon';
import XIcon from '../../components/icons/XIcon';

const {width} = Dimensions.get('window');
const CHART_W = width - 40;

type Props = NativeStackScreenProps<RootStackParamList, 'BotDetails'>;

type BotUserStatus = 'none' | 'shadow_running' | 'shadow_completed' | 'shadow_paused' | 'active' | 'paused' | 'stopped';

interface UserBotState {
  status: BotUserStatus;
  subscriptionId?: string;
  shadowSessionId?: string;
  mode?: string;
}

export default function BotDetailsScreen({navigation, route}: Props) {
  const {user} = useAuth();
  const [bot, setBot] = useState<Bot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userBotState, setUserBotState] = useState<UserBotState>({status: 'none'});
  const [actionLoading, setActionLoading] = useState(false);
  const [shadowModalVisible, setShadowModalVisible] = useState(false);
  const [selectedDurationIdx, setSelectedDurationIdx] = useState<number | null>(null);
  const [customDays, setCustomDays] = useState('');
  const [virtualBalance, setVirtualBalance] = useState('10000');

  const DURATION_OPTIONS: {label: string; minutes?: number; days?: number}[] = [
    {label: '1 Min', minutes: 1},
    {label: '2 Min', minutes: 2},
    {label: '5 Min', minutes: 5},
    {label: '1 Day', days: 1},
    {label: '7 Days', days: 7},
    {label: '15 Days', days: 15},
    {label: '1 Month', days: 30},
  ];

  const fetchData = useCallback(async () => {
    try {
      const [botData, activeBots, shadowSessions] = await Promise.all([
        marketplaceApi.getBotDetails(route.params.botId).catch(() => null),
        botsService.getActive().then((res: any) => {
          const items = Array.isArray(res?.data) ? res.data : Array.isArray(res?.subscriptions) ? res.subscriptions : [];
          return items;
        }).catch(() => []),
        botsService.getShadowSessions().then((res: any) => {
          return Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        }).catch(() => []),
      ]);

      if (botData) setBot(botData);

      // Determine user's relationship with this bot
      const botId = route.params.botId;

      // Check active subscription
      const sub = activeBots.find((s: any) => s.botId === botId);
      // Check shadow sessions — find the most relevant one
      const shadowRunning = shadowSessions.find(
        (s: any) => s.botId === botId && s.status === 'running',
      );
      const shadowCompleted = shadowSessions.find(
        (s: any) => s.botId === botId && s.status === 'completed',
      );
      const shadowPaused = shadowSessions.find(
        (s: any) => s.botId === botId && s.status === 'paused',
      );

      if (sub && (sub.subscriptionStatus === 'active' || sub.status === 'active')) {
        setUserBotState({status: 'active', subscriptionId: sub.subscriptionId || sub.id, mode: sub.subscriptionMode || sub.mode});
      } else if (sub && (sub.subscriptionStatus === 'paused' || sub.status === 'paused')) {
        setUserBotState({status: 'paused', subscriptionId: sub.subscriptionId || sub.id});
      } else if (sub && (sub.subscriptionStatus === 'shadow' || sub.status === 'shadow') || shadowRunning || shadowCompleted || shadowPaused) {
        // Determine shadow sub-status
        if (shadowRunning) {
          setUserBotState({status: 'shadow_running', subscriptionId: sub?.subscriptionId || sub?.id, shadowSessionId: shadowRunning.id});
        } else if (shadowPaused) {
          setUserBotState({status: 'shadow_paused', subscriptionId: sub?.subscriptionId || sub?.id, shadowSessionId: shadowPaused.id});
        } else if (shadowCompleted) {
          setUserBotState({status: 'shadow_completed', subscriptionId: sub?.subscriptionId || sub?.id, shadowSessionId: shadowCompleted.id});
        } else {
          setUserBotState({status: 'shadow_running', subscriptionId: sub?.subscriptionId || sub?.id});
        }
      } else if (sub && (sub.subscriptionStatus === 'stopped' || sub.status === 'stopped')) {
        setUserBotState({status: 'stopped', subscriptionId: sub.subscriptionId || sub.id});
      } else {
        setUserBotState({status: 'none'});
      }
    } catch {
      // Bot details fetch failed
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [route.params.botId]);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  // ─── Actions ─────────────────────────────────────────────────────────────

  const handleStartShadow = useCallback(() => {
    if (!bot) return;
    if (userBotState.status === 'shadow_running') {
      Alert.alert('Shadow Mode Active', 'This bot already has a shadow session running. View or stop the current session first.');
      return;
    }
    if (userBotState.status === 'active') {
      Alert.alert('Bot Already Active', 'This bot is already live trading. Stop it first to start shadow mode.');
      return;
    }
    setSelectedDurationIdx(null);
    setCustomDays('');
    setVirtualBalance('10000');
    setShadowModalVisible(true);
  }, [bot, userBotState.status]);

  const handleConfirmShadow = useCallback(() => {
    if (!bot) return;
    if (selectedDurationIdx === null) {
      Alert.alert('Select Duration', 'Please select how long to run shadow mode.');
      return;
    }
    const balance = parseFloat(virtualBalance) || 10000;
    if (balance < 100) {
      Alert.alert('Invalid Balance', 'Virtual balance must be at least $100.');
      return;
    }

    let apiConfig: {virtualBalance: number; durationDays?: number; durationMinutes?: number};

    if (selectedDurationIdx === -1) {
      // Custom days
      const days = parseInt(customDays, 10);
      if (!days || days <= 0) {
        Alert.alert('Invalid Duration', 'Please enter a valid number of days.');
        return;
      }
      apiConfig = {virtualBalance: balance, durationDays: days};
    } else {
      const opt = DURATION_OPTIONS[selectedDurationIdx];
      if (opt.minutes) {
        apiConfig = {virtualBalance: balance, durationMinutes: opt.minutes};
      } else {
        apiConfig = {virtualBalance: balance, durationDays: opt.days!};
      }
    }

    setShadowModalVisible(false);
    setActionLoading(true);
    botsService
      .startShadowMode(bot.id, apiConfig)
      .then(() => navigation.navigate('ShadowMode'))
      .catch(() => Alert.alert('Error', 'Failed to start shadow mode.'))
      .finally(() => setActionLoading(false));
  }, [navigation, bot, selectedDurationIdx, customDays, virtualBalance, DURATION_OPTIONS]);

  const handleActivate = useCallback(() => {
    if (!bot) return;
    if (userBotState.status === 'active') {
      Alert.alert('Already Active', 'This bot is already active and trading.');
      return;
    }
    navigation.navigate('BotPurchase', {botId: bot.id});
  }, [navigation, bot, userBotState.status]);

  const handleViewShadow = useCallback(() => {
    navigation.navigate('ShadowMode');
  }, [navigation]);

  const handlePause = useCallback(() => {
    if (!userBotState.subscriptionId) return;
    Alert.alert('Pause Bot', 'This will pause the bot. No new trades will be placed.', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Pause',
        onPress: () => {
          setActionLoading(true);
          botsService.pause(userBotState.subscriptionId!)
            .then(() => fetchData())
            .catch(() => Alert.alert('Error', 'Failed to pause bot.'))
            .finally(() => setActionLoading(false));
        },
      },
    ]);
  }, [userBotState.subscriptionId, fetchData]);

  const handleResume = useCallback(() => {
    if (!userBotState.subscriptionId) return;
    setActionLoading(true);
    botsService.resume(userBotState.subscriptionId)
      .then(() => fetchData())
      .catch(() => Alert.alert('Error', 'Failed to resume bot.'))
      .finally(() => setActionLoading(false));
  }, [userBotState.subscriptionId, fetchData]);

  const handleStop = useCallback(() => {
    if (!userBotState.subscriptionId) return;
    Alert.alert('Stop Bot', 'This will stop the bot and close all positions. This cannot be undone.', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Stop',
        style: 'destructive',
        onPress: () => {
          setActionLoading(true);
          botsService.stop(userBotState.subscriptionId!)
            .then(() => fetchData())
            .catch(() => Alert.alert('Error', 'Failed to stop bot.'))
            .finally(() => setActionLoading(false));
        },
      },
    ]);
  }, [userBotState.subscriptionId, fetchData]);

  // ─── Render ──────────────────────────────────────────────────────────────

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
        <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 16, color: 'rgba(255,255,255,0.5)', marginBottom: 8}}>Bot not found</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{fontFamily: 'Inter-Medium', fontSize: 14, color: '#10B981'}}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isCreator = !!user && !!bot.creatorId && user.id === bot.creatorId;

  const statCells = [
    {label: '30D RETURN', value: `${bot.returnPercent >= 0 ? '+' : ''}${bot.returnPercent.toFixed(1)}%`, color: bot.returnPercent >= 0 ? '#10B981' : '#EF4444'},
    {label: 'WIN RATE', value: `${bot.winRate}%`, color: '#0D7FF2'},
    {label: 'MAX DRAWDOWN', value: `${bot.maxDrawdown.toFixed(1)}%`, color: '#EF4444'},
    {label: 'SHARPE RATIO', value: `${bot.sharpeRatio.toFixed(2)}`, color: '#10B981'},
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <ChevronLeftIcon size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{bot.name}</Text>
        <TouchableOpacity style={styles.iconBtn}>
          <ShareIcon size={20} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchData(); }}
            tintColor="#10B981"
            colors={['#10B981']}
            progressBackgroundColor="#161B22"
          />
        }>
        {/* Bot hero */}
        <View style={styles.heroSection}>
          <View style={[styles.botAvatar, {backgroundColor: bot.avatarColor}]}>
            <Text style={styles.botAvatarText}>{bot.avatarLetter}</Text>
          </View>

          {/* Status badges row */}
          <View style={styles.badgesRow}>
            {isCreator && <Badge label="YOUR BOT" variant="purple" size="sm" />}
            {userBotState.status === 'active' && <Badge label="LIVE" variant="green" size="sm" dot />}
            {userBotState.status === 'shadow_running' && <Badge label="SHADOW RUNNING" variant="blue" size="sm" dot />}
            {userBotState.status === 'shadow_paused' && <Badge label="SHADOW PAUSED" variant="orange" size="sm" />}
            {userBotState.status === 'shadow_completed' && <Badge label="SHADOW COMPLETE" variant="green" size="sm" />}
            {userBotState.status === 'paused' && <Badge label="PAUSED" variant="orange" size="sm" />}
          </View>

          <Text style={styles.botName}>{bot.name}</Text>
          <Text style={styles.botCreator}>{isCreator ? 'Created by you' : bot.subtitle}</Text>
          <View style={styles.ratingRow}>
            {[1,2,3,4,5].map(i => (
              <StarIcon key={i} size={14} filled={i <= Math.round(bot.rating)} color="#EAB308" />
            ))}
            <Text style={styles.ratingText}> {bot.rating.toFixed(1)} ({bot.reviewCount} reviews)</Text>
          </View>
          <Text style={styles.activeUsers}>{bot.activeUsers.toLocaleString()} active traders</Text>
        </View>

        {/* Stats 2x2 grid */}
        <View style={styles.statsGrid}>
          {statCells.map(cell => (
            <View key={cell.label} style={styles.statCell}>
              <Text style={styles.statCellLabel}>{cell.label}</Text>
              <Text style={[styles.statCellValue, {color: cell.color}]}>{cell.value}</Text>
            </View>
          ))}
        </View>

        {/* Equity chart */}
        <View style={styles.chartSection}>
          <InteractiveChart
            data={bot.equityData}
            width={CHART_W}
            height={200}
            label="PERFORMANCE"
            timeframes={['1D', '1W', '1M', '3M', 'ALL']}
            showGrid
            showCrosshair
            showYLabels
            showXLabels
          />
        </View>

        {/* Bot Overview Card */}
        <View style={styles.overviewCard}>
          <View style={styles.overviewRow}>
            <View style={styles.overviewItem}>
              <Text style={styles.overviewLabel}>CATEGORY</Text>
              <Text style={styles.overviewValue}>{bot.category}</Text>
            </View>
            <View style={styles.overviewDivider} />
            <View style={styles.overviewItem}>
              <Text style={styles.overviewLabel}>RISK LEVEL</Text>
              <Text style={[styles.overviewValue, {color: bot.risk === 'Very High' || bot.risk === 'High' ? '#EF4444' : bot.risk === 'Med' ? '#F59E0B' : '#10B981'}]}>
                {bot.risk}
              </Text>
            </View>
            <View style={styles.overviewDivider} />
            <View style={styles.overviewItem}>
              <Text style={styles.overviewLabel}>PRICE</Text>
              <Text style={styles.overviewValue}>{bot.price === 0 ? 'Free' : `$${bot.price}/mo`}</Text>
            </View>
          </View>
        </View>

        {/* Bot DNA */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>BOT DNA</Text>
          <View style={styles.tagsRow}>
            {bot.tags.map(tag => (
              <Badge key={tag} label={tag} variant="outline" size="sm" style={styles.tag} />
            ))}
          </View>
        </View>

        {/* Strategy */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>STRATEGY</Text>
          <Text style={styles.strategyText}>{bot.description}</Text>
        </View>

        {/* Key Metrics */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>KEY METRICS</Text>
          <View style={styles.metricsCard}>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Total Return (30D)</Text>
              <Text style={[styles.metricValue, {color: bot.returnPercent >= 0 ? '#10B981' : '#EF4444'}]}>
                {bot.returnPercent >= 0 ? '+' : ''}{bot.returnPercent.toFixed(2)}%
              </Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Win Rate</Text>
              <Text style={styles.metricValue}>{bot.winRate.toFixed(1)}%</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Max Drawdown</Text>
              <Text style={[styles.metricValue, {color: '#EF4444'}]}>{bot.maxDrawdown.toFixed(2)}%</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Sharpe Ratio</Text>
              <Text style={[styles.metricValue, {color: bot.sharpeRatio >= 1 ? '#10B981' : '#F59E0B'}]}>{bot.sharpeRatio.toFixed(2)}</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Active Users</Text>
              <Text style={styles.metricValue}>{bot.activeUsers.toLocaleString()}</Text>
            </View>
            <View style={[styles.metricRow, {borderBottomWidth: 0}]}>
              <Text style={styles.metricLabel}>Average Rating</Text>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
                <StarIcon size={12} filled color="#EAB308" />
                <Text style={styles.metricValue}>{bot.rating.toFixed(1)} ({bot.reviewCount})</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Creator Info */}
        {bot.creatorName ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>CREATOR</Text>
            <View style={styles.creatorCard}>
              <View style={[styles.creatorAvatar, {backgroundColor: bot.avatarColor}]}>
                <Text style={styles.creatorAvatarText}>{bot.creatorName.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.creatorInfo}>
                <Text style={styles.creatorName}>{bot.creatorName}</Text>
                <Text style={styles.creatorSub}>{isCreator ? 'You' : 'Bot Creator'}</Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Monthly Returns */}
        {bot.monthlyReturns.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>MONTHLY RETURNS</Text>
            <MonthlyReturnBars data={bot.monthlyReturns} />
          </View>
        )}

        {/* Recent Trades */}
        {bot.recentTrades.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Recent Trades" />
            <View style={styles.card}>
              {bot.recentTrades.slice(0, 3).map(trade => (
                <TradeRow key={trade.id} trade={trade} />
              ))}
            </View>
          </View>
        )}

        {/* Reviews */}
        {bot.reviews.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Reviews" />
            {bot.reviews.map(review => (
              <View key={review.id} style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  <View style={[styles.reviewAvatar, {backgroundColor: '#10B981'}]}>
                    <Text style={styles.reviewAvatarText}>{review.userInitials}</Text>
                  </View>
                  <View>
                    <Text style={styles.reviewName}>{review.userName}</Text>
                    <View style={styles.reviewStars}>
                      {[1,2,3,4,5].map(i => (
                        <StarIcon key={i} size={10} filled={i <= review.rating} color="#EAB308" />
                      ))}
                    </View>
                  </View>
                  <Text style={styles.reviewDate}>{review.date}</Text>
                </View>
                <Text style={styles.reviewText}>{review.text}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={{height: 120}} />
      </ScrollView>

      {/* ─── Shadow Mode Confirmation Modal ─────────────────────────── */}
      <Modal
        visible={shadowModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setShadowModalVisible(false)}>
        <View style={modalStyles.overlay}>
          <View style={modalStyles.sheet}>
            <View style={modalStyles.handle} />
            <View style={modalStyles.headerRow}>
              <Text style={modalStyles.title}>Start Shadow Mode</Text>
              <TouchableOpacity onPress={() => setShadowModalVisible(false)} style={modalStyles.closeBtn}>
                <XIcon size={18} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            </View>
            <Text style={modalStyles.desc}>
              Run {bot?.name ?? 'this bot'} with virtual funds. No real trades will be executed.
            </Text>

            {/* Duration picker */}
            <Text style={modalStyles.label}>DURATION</Text>
            <View style={modalStyles.durationGrid}>
              {DURATION_OPTIONS.map((opt, idx) => (
                <TouchableOpacity
                  key={opt.label}
                  style={[modalStyles.durationChip, selectedDurationIdx === idx && modalStyles.durationChipActive]}
                  onPress={() => { setSelectedDurationIdx(idx); setCustomDays(''); }}
                  activeOpacity={0.7}>
                  <Text style={[modalStyles.durationChipText, selectedDurationIdx === idx && modalStyles.durationChipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[modalStyles.durationChip, selectedDurationIdx === -1 && modalStyles.durationChipActive]}
                onPress={() => setSelectedDurationIdx(-1)}
                activeOpacity={0.7}>
                <Text style={[modalStyles.durationChipText, selectedDurationIdx === -1 && modalStyles.durationChipTextActive]}>Custom</Text>
              </TouchableOpacity>
            </View>

            {selectedDurationIdx === -1 && (
              <View style={modalStyles.customRow}>
                <TextInput
                  style={modalStyles.customInput}
                  value={customDays}
                  onChangeText={setCustomDays}
                  placeholder="Days"
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  keyboardType="number-pad"
                  maxLength={3}
                />
                <Text style={modalStyles.customLabel}>days</Text>
              </View>
            )}

            {/* Virtual balance */}
            <Text style={modalStyles.label}>VIRTUAL BALANCE</Text>
            <View style={modalStyles.balanceRow}>
              <Text style={modalStyles.dollarSign}>$</Text>
              <TextInput
                style={modalStyles.balanceInput}
                value={virtualBalance}
                onChangeText={setVirtualBalance}
                keyboardType="number-pad"
                maxLength={8}
              />
            </View>

            {/* Confirm button */}
            <TouchableOpacity style={modalStyles.confirmBtn} onPress={handleConfirmShadow} activeOpacity={0.85}>
              <Text style={modalStyles.confirmText}>Start Shadow Mode</Text>
            </TouchableOpacity>
            <Text style={modalStyles.disclaimer}>No real money will be used. You can pause or stop anytime.</Text>
          </View>
        </View>
      </Modal>

      {/* ─── Dynamic Footer ────────────────────────────────────────────── */}
      <View style={styles.footer}>
        {actionLoading ? (
          <View style={styles.footerLoading}>
            <ActivityIndicator size="small" color="#10B981" />
          </View>
        ) : userBotState.status === 'none' || userBotState.status === 'stopped' ? (
          /* No active relationship — show Shadow + Activate */
          <>
            <TouchableOpacity style={styles.shadowBtn} onPress={handleStartShadow} activeOpacity={0.8}>
              <Text style={styles.shadowBtnText}>Shadow Mode</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.activateBtn} onPress={handleActivate} activeOpacity={0.85}>
              <Text style={styles.activateBtnText}>
                {bot.price === 0 ? 'Activate Free' : `Activate — $${bot.price}/mo`}
              </Text>
            </TouchableOpacity>
          </>
        ) : userBotState.status === 'shadow_running' ? (
          /* Shadow mode running */
          <>
            <View style={styles.statusCard}>
              <View style={styles.statusDot} />
              <View style={styles.statusTextCol}>
                <Text style={styles.statusTitle}>Shadow Mode Running</Text>
                <Text style={styles.statusSub}>Virtual trades in progress</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.viewShadowBtn} onPress={handleViewShadow} activeOpacity={0.8}>
              <Text style={styles.viewShadowText}>View</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.goLiveSmallBtn} onPress={handleActivate} activeOpacity={0.85}>
              <Text style={styles.goLiveSmallText}>Go Live</Text>
            </TouchableOpacity>
          </>
        ) : userBotState.status === 'shadow_paused' ? (
          /* Shadow mode paused */
          <>
            <View style={styles.statusCard}>
              <View style={[styles.statusDot, {backgroundColor: '#F97316'}]} />
              <View style={styles.statusTextCol}>
                <Text style={styles.statusTitle}>Shadow Mode Paused</Text>
                <Text style={styles.statusSub}>Virtual trades paused</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.viewShadowBtn} onPress={handleViewShadow} activeOpacity={0.8}>
              <Text style={styles.viewShadowText}>View</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.goLiveSmallBtn} onPress={handleActivate} activeOpacity={0.85}>
              <Text style={styles.goLiveSmallText}>Go Live</Text>
            </TouchableOpacity>
          </>
        ) : userBotState.status === 'shadow_completed' ? (
          /* Shadow mode completed — two-row layout */
          <View style={styles.shadowCompleteFooter}>
            <View style={styles.shadowCompleteBanner}>
              <View style={styles.shadowCompleteCheck}>
                <Text style={{fontSize: 14}}>✓</Text>
              </View>
              <Text style={styles.shadowCompleteText}>Shadow Mode Complete</Text>
            </View>
            <View style={styles.shadowCompleteBtns}>
              <TouchableOpacity style={styles.shadowCompleteResultsBtn} onPress={handleViewShadow} activeOpacity={0.8}>
                <Text style={styles.shadowCompleteResultsText}>View Results</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shadowCompleteGoLiveBtn} onPress={handleActivate} activeOpacity={0.85}>
                <Text style={styles.shadowCompleteGoLiveText}>Go Live</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : userBotState.status === 'active' ? (
          /* Bot is live — show status + pause/stop */
          <>
            <View style={styles.statusCard}>
              <View style={[styles.statusDot, {backgroundColor: '#10B981'}]} />
              <View style={styles.statusTextCol}>
                <Text style={styles.statusTitle}>Bot is Live</Text>
                <Text style={styles.statusSub}>Trading with real funds</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.pauseBtn} onPress={handlePause} activeOpacity={0.8}>
              <Text style={styles.pauseBtnText}>Pause</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.stopBtn} onPress={handleStop} activeOpacity={0.8}>
              <Text style={styles.stopBtnText}>Stop</Text>
            </TouchableOpacity>
          </>
        ) : userBotState.status === 'paused' ? (
          /* Bot is paused — show resume + stop */
          <>
            <View style={styles.statusCard}>
              <View style={[styles.statusDot, {backgroundColor: '#F97316'}]} />
              <View style={styles.statusTextCol}>
                <Text style={styles.statusTitle}>Bot Paused</Text>
                <Text style={styles.statusSub}>No trades being placed</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.resumeBtn} onPress={handleResume} activeOpacity={0.85}>
              <Text style={styles.resumeBtnText}>Resume</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.stopBtn} onPress={handleStop} activeOpacity={0.8}>
              <Text style={styles.stopBtnText}>Stop</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0F1117'},
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {flex: 1, fontFamily: 'Inter-SemiBold', fontSize: 16, color: '#FFFFFF', textAlign: 'center', marginHorizontal: 8},
  scroll: {paddingHorizontal: 20},
  heroSection: {alignItems: 'center', paddingVertical: 16},
  botAvatar: {width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 12},
  botAvatarText: {fontFamily: 'Inter-Bold', fontSize: 28, color: '#FFFFFF'},
  badgesRow: {flexDirection: 'row', gap: 6, marginBottom: 8},
  botName: {fontFamily: 'Inter-Bold', fontSize: 22, color: '#FFFFFF', marginBottom: 4, letterSpacing: -0.3},
  botCreator: {fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 8},
  ratingRow: {flexDirection: 'row', alignItems: 'center', marginBottom: 4},
  ratingText: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.4)'},
  activeUsers: {fontFamily: 'Inter-Medium', fontSize: 12, color: 'rgba(255,255,255,0.35)'},
  statsGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16},
  statCell: {
    flex: 1, minWidth: '45%',
    backgroundColor: '#161B22', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  statCellLabel: {fontFamily: 'Inter-Medium', fontSize: 9, letterSpacing: 0.8, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 6},
  statCellValue: {fontFamily: 'Inter-Bold', fontSize: 22, letterSpacing: -0.5},
  chartSection: {marginBottom: 16},

  // Overview card
  overviewCard: {
    backgroundColor: '#161B22', borderRadius: 16, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  overviewRow: {flexDirection: 'row', alignItems: 'center'},
  overviewItem: {flex: 1, alignItems: 'center'},
  overviewDivider: {width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.08)'},
  overviewLabel: {
    fontFamily: 'Inter-Medium', fontSize: 9, letterSpacing: 0.8,
    color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 4,
  },
  overviewValue: {fontFamily: 'Inter-Bold', fontSize: 14, color: '#FFFFFF'},

  // Key Metrics
  metricsCard: {
    backgroundColor: '#161B22', borderRadius: 16, paddingHorizontal: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  metricRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  metricLabel: {fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.5)'},
  metricValue: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF'},

  // Creator
  creatorCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#161B22', borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  creatorAvatar: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  creatorAvatarText: {fontFamily: 'Inter-Bold', fontSize: 18, color: '#FFFFFF'},
  creatorInfo: {flex: 1},
  creatorName: {fontFamily: 'Inter-SemiBold', fontSize: 15, color: '#FFFFFF'},
  creatorSub: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 2},

  section: {marginBottom: 20},
  sectionLabel: {fontFamily: 'Inter-Medium', fontSize: 10, letterSpacing: 1, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 10},
  tagsRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 6},
  tag: {marginBottom: 4},
  strategyText: {fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 22},
  card: {backgroundColor: '#161B22', borderRadius: 16, paddingHorizontal: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)'},
  reviewCard: {
    backgroundColor: '#161B22', borderRadius: 14, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  reviewHeader: {flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8},
  reviewAvatar: {width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center'},
  reviewAvatarText: {fontFamily: 'Inter-Bold', fontSize: 12, color: '#FFFFFF'},
  reviewName: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#FFFFFF'},
  reviewStars: {flexDirection: 'row', gap: 2, marginTop: 2},
  reviewDate: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.3)', marginLeft: 'auto'},
  reviewText: {fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 20},

  // ─── Footer ──────────────────────────────────────────────────────────────
  footer: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32,
    backgroundColor: '#0F1117', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
  },
  footerLoading: {
    flex: 1, height: 52, alignItems: 'center', justifyContent: 'center',
  },

  // No subscription — default buttons
  shadowBtn: {
    flex: 1, height: 52, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#161B22', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  shadowBtnText: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF'},
  activateBtn: {
    flex: 2, height: 52, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#10B981',
  },
  activateBtnText: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF'},

  // Status card (shared)
  statusCard: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#161B22', borderRadius: 12, paddingHorizontal: 12, height: 52,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  statusDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#0D7FF2',
  },
  statusTextCol: {flex: 1},
  statusTitle: {fontFamily: 'Inter-SemiBold', fontSize: 12, color: '#FFFFFF'},
  statusSub: {fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 1},

  // Shadow running buttons
  viewShadowBtn: {
    height: 52, paddingHorizontal: 16, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(13,127,242,0.15)', borderWidth: 1, borderColor: 'rgba(13,127,242,0.3)',
  },
  viewShadowText: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#0D7FF2'},
  goLiveSmallBtn: {
    height: 52, paddingHorizontal: 16, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#10B981',
  },
  goLiveSmallText: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#FFFFFF'},

  // Live buttons
  pauseBtn: {
    height: 52, paddingHorizontal: 16, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(249,115,22,0.15)', borderWidth: 1, borderColor: 'rgba(249,115,22,0.3)',
  },
  pauseBtnText: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#F97316'},
  stopBtn: {
    height: 52, paddingHorizontal: 16, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(239,68,68,0.15)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
  },
  stopBtnText: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#EF4444'},

  // Paused buttons
  resumeBtn: {
    height: 52, paddingHorizontal: 20, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#10B981',
  },
  resumeBtnText: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#FFFFFF'},

  // Shadow completed footer — vertical layout
  shadowCompleteFooter: {
    flex: 1, flexDirection: 'column', gap: 10,
  },
  shadowCompleteBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(16,185,129,0.08)', borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 12,
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)',
  },
  shadowCompleteCheck: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#10B981',
    alignItems: 'center', justifyContent: 'center',
  },
  shadowCompleteText: {
    fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#10B981',
  },
  shadowCompleteBtns: {
    flexDirection: 'row', gap: 10,
  },
  shadowCompleteResultsBtn: {
    flex: 1, height: 48, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(13,127,242,0.12)', borderWidth: 1, borderColor: 'rgba(13,127,242,0.3)',
  },
  shadowCompleteResultsText: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#0D7FF2'},
  shadowCompleteGoLiveBtn: {
    flex: 1, height: 48, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#10B981',
  },
  shadowCompleteGoLiveText: {fontFamily: 'Inter-Bold', fontSize: 14, color: '#FFFFFF'},
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#161B22', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12,
    maxHeight: '85%',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center', marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {fontFamily: 'Inter-Bold', fontSize: 20, color: '#FFFFFF', letterSpacing: -0.3},
  closeBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  desc: {fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 19, marginBottom: 20},
  label: {
    fontFamily: 'Inter-Medium', fontSize: 10, letterSpacing: 1,
    color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 10,
  },
  durationGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16,
  },
  durationChip: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  durationChipActive: {
    backgroundColor: 'rgba(13,127,242,0.15)', borderColor: '#0D7FF2',
  },
  durationChipText: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: 'rgba(255,255,255,0.5)'},
  durationChipTextActive: {color: '#0D7FF2'},
  customRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16,
  },
  customInput: {
    flex: 1, height: 44, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10,
    paddingHorizontal: 14, fontFamily: 'Inter-SemiBold', fontSize: 16, color: '#FFFFFF',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  customLabel: {fontFamily: 'Inter-Medium', fontSize: 14, color: 'rgba(255,255,255,0.4)'},
  balanceRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10,
    paddingHorizontal: 14, height: 48, marginBottom: 24,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  dollarSign: {fontFamily: 'Inter-Bold', fontSize: 18, color: 'rgba(255,255,255,0.4)', marginRight: 4},
  balanceInput: {
    flex: 1, fontFamily: 'Inter-Bold', fontSize: 18, color: '#FFFFFF', padding: 0,
  },
  confirmBtn: {
    height: 54, borderRadius: 14, backgroundColor: '#10B981',
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  confirmText: {fontFamily: 'Inter-SemiBold', fontSize: 16, color: '#FFFFFF'},
  disclaimer: {
    fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.25)',
    textAlign: 'center',
  },
});
