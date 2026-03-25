import React, {useState, useCallback, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Keyboard,
  Platform,
  ActivityIndicator,
  Animated,
  Modal,
  Dimensions,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../types';
import Svg, {Path, Rect, Circle, Defs, LinearGradient, Stop} from 'react-native-svg';
import {subscriptionApi} from '../../services/subscription';
import {tradingRoomApi, TradingRoomMessage, TradingRoomMember} from '../../services/tradingRoom';
import {useToast} from '../../context/ToastContext';
import {useAuth} from '../../context/AuthContext';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const {width: SCREEN_W} = Dimensions.get('window');

// ─── Icons ──────────────────────────────────────────────────────────────────────

function BackArrow() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M15 19l-7-7 7-7" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function LockIcon() {
  return (
    <Svg width={56} height={56} viewBox="0 0 24 24" fill="none">
      <Defs>
        <LinearGradient id="lockGrad" x1="12" y1="3" x2="12" y2="21">
          <Stop offset="0" stopColor="#10B981" stopOpacity={0.8} />
          <Stop offset="1" stopColor="#059669" stopOpacity={0.4} />
        </LinearGradient>
      </Defs>
      <Rect x={5} y={11} width={14} height={10} rx={2} stroke="url(#lockGrad)" strokeWidth={1.5} />
      <Path d="M8 11V7a4 4 0 018 0v4" stroke="url(#lockGrad)" strokeWidth={1.5} strokeLinecap="round" />
      <Circle cx={12} cy={16} r={1.5} fill="#10B981" />
    </Svg>
  );
}

function SendArrow() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function UsersIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Circle cx={9} cy={7} r={4} stroke="#FFFFFF" strokeWidth={1.5} />
      <Path d="M2 21v-2a4 4 0 014-4h6a4 4 0 014 4v2" stroke="#FFFFFF" strokeWidth={1.5} strokeLinecap="round" />
      <Circle cx={19} cy={7} r={3} stroke="rgba(255,255,255,0.5)" strokeWidth={1.5} />
      <Path d="M19 15a4 4 0 013 4v2" stroke="rgba(255,255,255,0.5)" strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

function CloseIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M18 6L6 18M6 6l12 12" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function CrownIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Path d="M2 20h20M4 17l2-12 6 5 6-5 2 12H4z" fill="#F59E0B" />
    </Svg>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Empty State Animated ───────────────────────────────────────────────────────

function EmptyState() {
  const pulse1 = useRef(new Animated.Value(0.3)).current;
  const pulse2 = useRef(new Animated.Value(0.5)).current;
  const pulse3 = useRef(new Animated.Value(0.2)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, {toValue: 1, duration: 1500, useNativeDriver: true}),
          Animated.timing(val, {toValue: 0.2, duration: 1500, useNativeDriver: true}),
        ]),
      );
    animate(pulse1, 0).start();
    animate(pulse2, 500).start();
    animate(pulse3, 1000).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {toValue: -8, duration: 2000, useNativeDriver: true}),
        Animated.timing(floatAnim, {toValue: 0, duration: 2000, useNativeDriver: true}),
      ]),
    ).start();
  }, []);

  return (
    <View style={emptyStyles.container}>
      <Animated.View style={{transform: [{translateY: floatAnim}]}}>
        <View style={emptyStyles.iconWrap}>
          <Svg width={44} height={44} viewBox="0 0 24 24" fill="none">
            <Path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"
              stroke="#10B981" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </View>
      </Animated.View>
      <View style={emptyStyles.dotsRow}>
        <Animated.View style={[emptyStyles.dot, {opacity: pulse1, backgroundColor: '#10B981'}]} />
        <Animated.View style={[emptyStyles.dot, {opacity: pulse2, backgroundColor: '#0D7FF2'}]} />
        <Animated.View style={[emptyStyles.dot, {opacity: pulse3, backgroundColor: '#8B5CF6'}]} />
      </View>
      <Text style={emptyStyles.title}>Welcome to Trading Room</Text>
      <Text style={emptyStyles.subtitle}>
        Start the conversation. Share trades,{'\n'}analysis, and ideas with the community.
      </Text>
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  container: {alignItems: 'center', justifyContent: 'center', paddingVertical: 80, paddingHorizontal: 40},
  iconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(16,185,129,0.08)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.15)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  dotsRow: {flexDirection: 'row', gap: 8, marginBottom: 20},
  dot: {width: 8, height: 8, borderRadius: 4},
  title: {fontFamily: 'Inter-Bold', fontSize: 20, color: '#FFFFFF', marginBottom: 8, textAlign: 'center'},
  subtitle: {fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.35)', textAlign: 'center', lineHeight: 20},
});

// ─── Members Modal ──────────────────────────────────────────────────────────────

function MembersModal({visible, onClose, members, loading}: {visible: boolean; onClose: () => void; members: TradingRoomMember[]; loading: boolean}) {
  const onlineCount = members.filter(m => m.isOnline).length;
  const offlineCount = members.filter(m => !m.isOnline).length;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={memberStyles.overlay}>
        <View style={memberStyles.sheet}>
          <View style={memberStyles.handleBar} />
          <View style={memberStyles.header}>
            <Text style={memberStyles.headerTitle}>Members</Text>
            <Text style={memberStyles.headerCount}>
              <Text style={{color: '#10B981'}}>{onlineCount} online</Text>
              {'  ·  '}
              <Text style={{color: 'rgba(255,255,255,0.3)'}}>{offlineCount} offline</Text>
            </Text>
            <TouchableOpacity onPress={onClose} style={memberStyles.closeBtn}>
              <CloseIcon />
            </TouchableOpacity>
          </View>
          {loading ? (
            <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
              <ActivityIndicator color="#10B981" size="large" />
            </View>
          ) : (
            <FlatList
              data={members}
              keyExtractor={item => item.id}
              contentContainerStyle={{paddingHorizontal: 20, paddingBottom: 30}}
              renderItem={({item}) => {
                const initials = item.avatarInitials || item.name?.charAt(0)?.toUpperCase() || '?';
                const color = item.avatarColor || '#3B82F6';
                return (
                  <View style={memberStyles.row}>
                    <View style={[memberStyles.avatar, {backgroundColor: color}]}>
                      <Text style={memberStyles.avatarText}>{initials}</Text>
                      <View style={[memberStyles.statusDot, {backgroundColor: item.isOnline ? '#10B981' : '#4B5563'}]} />
                    </View>
                    <View style={{flex: 1}}>
                      <Text style={memberStyles.name}>
                        {item.name}
                        {item.role === 'admin' && <Text style={{color: '#F59E0B', fontSize: 11}}> ADMIN</Text>}
                        {item.role === 'creator' && <Text style={{color: '#8B5CF6', fontSize: 11}}> CREATOR</Text>}
                      </Text>
                      <Text style={memberStyles.status}>{item.isOnline ? 'Online' : 'Offline'}</Text>
                    </View>
                  </View>
                );
              }}
              ListEmptyComponent={
                <View style={{paddingVertical: 40, alignItems: 'center'}}>
                  <Text style={{color: 'rgba(255,255,255,0.3)', fontSize: 14}}>No members yet</Text>
                </View>
              }
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const memberStyles = StyleSheet.create({
  overlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end'},
  sheet: {
    backgroundColor: '#0F1117', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '80%', minHeight: '50%',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  handleBar: {width: 40, height: 4, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 2, alignSelf: 'center', marginTop: 12},
  header: {paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)'},
  headerTitle: {fontFamily: 'Inter-Bold', fontSize: 20, color: '#FFFFFF', marginBottom: 4},
  headerCount: {fontFamily: 'Inter-Regular', fontSize: 13},
  closeBtn: {position: 'absolute', right: 16, top: 16, width: 36, height: 36, alignItems: 'center', justifyContent: 'center'},
  row: {flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)'},
  avatar: {width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12},
  avatarText: {fontFamily: 'Inter-Bold', fontSize: 15, color: '#FFFFFF'},
  statusDot: {position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#0F1117'},
  name: {fontFamily: 'Inter-SemiBold', fontSize: 15, color: '#FFFFFF'},
  status: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 1},
});

// ─── Screen ─────────────────────────────────────────────────────────────────────

export default function TradingRoomScreen() {
  const navigation = useNavigation<Nav>();
  const {user} = useAuth();
  const {alert: showAlert} = useToast();

  const [isPro, setIsPro] = useState(false);
  const [messages, setMessages] = useState<TradingRoomMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [onlineCount, setOnlineCount] = useState(0);
  const [totalMembers, setTotalMembers] = useState(0);

  const [membersVisible, setMembersVisible] = useState(false);
  const [members, setMembers] = useState<TradingRoomMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const keyboardHeight = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        Animated.timing(keyboardHeight, {
          toValue: e.endCoordinates.height,
          duration: Platform.OS === 'ios' ? 250 : 100,
          useNativeDriver: false,
        }).start();
      },
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        Animated.timing(keyboardHeight, {
          toValue: 0,
          duration: Platform.OS === 'ios' ? 250 : 100,
          useNativeDriver: false,
        }).start();
      },
    );
    return () => { showSub.remove(); hideSub.remove(); };
  }, [keyboardHeight]);

  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        const sub = await subscriptionApi.getCurrent().catch(() => null);
        if (!mounted) return;
        const proActive = (sub && sub.tier === 'pro' && sub.status === 'active') || user?.role === 'admin';
        setIsPro(!!proActive);
        if (proActive) {
          const [msgRes, statsRes] = await Promise.all([
            tradingRoomApi.getMessages(50).catch(() => ({data: []})),
            tradingRoomApi.getOnlineStats().catch(() => ({data: {online: 0, totalMembers: 0}})),
          ]);
          if (mounted) {
            setMessages(msgRes.data || []);
            setOnlineCount(statsRes.data?.online || 0);
            setTotalMembers(statsRes.data?.totalMembers || 0);
          }
        }
      } catch {} finally {
        if (mounted) setLoading(false);
      }
    }
    init();
    return () => { mounted = false; };
  }, [user?.role]);

  useEffect(() => {
    if (!isPro || loading) return;
    pollRef.current = setInterval(async () => {
      try {
        const [msgRes, statsRes] = await Promise.all([
          tradingRoomApi.getMessages(50),
          tradingRoomApi.getOnlineStats(),
        ]);
        setMessages(msgRes.data || []);
        setOnlineCount(statsRes.data?.online || 0);
        setTotalMembers(statsRes.data?.totalMembers || 0);
      } catch {}
    }, 8000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [isPro, loading]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await tradingRoomApi.postMessage(text);
      const newMsg = res.data;
      if (newMsg) setMessages(prev => [newMsg, ...prev]);
      setInputText('');
      flatListRef.current?.scrollToOffset({offset: 0, animated: true});
    } catch (e: any) {
      showAlert('Error', e?.message || 'Could not send message');
    } finally {
      setSending(false);
    }
  }, [inputText, sending, showAlert]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await tradingRoomApi.getMessages(50);
      setMessages(res.data || []);
    } catch {} finally {
      setRefreshing(false);
    }
  }, []);

  const openMembers = useCallback(async () => {
    setMembersVisible(true);
    setMembersLoading(true);
    try {
      const res = await tradingRoomApi.getMembers();
      setMembers(res.data || []);
    } catch {} finally {
      setMembersLoading(false);
    }
  }, []);

  const renderMessage = useCallback(({item, index}: {item: TradingRoomMessage; index: number}) => {
    const isOwn = item.userId === user?.id;
    const initials = item.avatarInitials || item.userName?.charAt(0)?.toUpperCase() || '?';
    const color = item.avatarColor || (isOwn ? '#10B981' : '#3B82F6');
    const isAdmin = item.userRole === 'admin';
    const isCreator = item.userRole === 'creator';

    // Check if previous message (visually below since inverted) is from same user
    const prevMsg = messages[index + 1];
    const sameSenderAsPrev = prevMsg && prevMsg.userId === item.userId;
    const avatarEl = (
      <View style={[styles.msgAvatar, {backgroundColor: color}]}>
        <Text style={styles.msgAvatarText}>{initials}</Text>
      </View>
    );

    const nameColor = isOwn ? '#10B981' : isAdmin ? '#F59E0B' : isCreator ? '#8B5CF6' : 'rgba(255,255,255,0.55)';

    return (
      <View style={[
        styles.msgWrap,
        isOwn ? styles.msgWrapRight : styles.msgWrapLeft,
        sameSenderAsPrev && {marginBottom: 2},
      ]}>
        {/* Avatar left for others */}
        {!isOwn && avatarEl}

        <View style={{maxWidth: SCREEN_W * 0.7, gap: 2}}>
          {/* Name + badges */}
          {!sameSenderAsPrev && (
            <View style={[styles.msgNameRow, isOwn && {justifyContent: 'flex-end'}]}>
              <Text style={[styles.msgName, {color: nameColor}]}>
                {isOwn ? 'You' : item.userName}
              </Text>
              {isAdmin && <CrownIcon />}
              {isCreator && (
                <View style={styles.creatorBadge}>
                  <Text style={styles.creatorBadgeText}>Creator</Text>
                </View>
              )}
            </View>
          )}

          {/* Bubble */}
          <View style={[
            styles.bubble,
            isOwn ? styles.bubbleOwn : styles.bubbleOther,
            sameSenderAsPrev && !isOwn && styles.bubbleContinue,
            sameSenderAsPrev && isOwn && {borderTopRightRadius: 6},
          ]}>
            <Text style={[styles.bubbleText, isOwn && styles.bubbleTextOwn]}>{item.content}</Text>
            <Text style={[styles.bubbleTime, isOwn && styles.bubbleTimeOwn]}>{timeAgo(item.createdAt)}</Text>
          </View>
        </View>

        {/* Avatar right for own messages */}
        {isOwn && avatarEl}
      </View>
    );
  }, [user?.id, messages]);

  return (
    <Animated.View style={[styles.container, {paddingBottom: keyboardHeight}]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <BackArrow />
        </TouchableOpacity>

        <TouchableOpacity onPress={isPro ? openMembers : undefined} style={styles.headerCenter} activeOpacity={0.7}>
          <View style={styles.headerTitleRow}>
            <View style={styles.headerLiveDot} />
            <Text style={styles.headerTitle}>Trading Room</Text>
          </View>
          {isPro && !loading && (
            <Text style={styles.headerSubtitle}>
              <Text style={{color: '#10B981'}}>{onlineCount} online</Text>
              <Text style={{color: 'rgba(255,255,255,0.2)'}}> · {totalMembers} members</Text>
            </Text>
          )}
        </TouchableOpacity>

        {isPro && !loading ? (
          <TouchableOpacity onPress={openMembers} style={styles.membersBtn} activeOpacity={0.7}>
            <UsersIcon />
          </TouchableOpacity>
        ) : <View style={{width: 36}} />}
      </View>

      {/* Premium divider line */}
      <View style={styles.headerDivider}>
        <View style={styles.headerDividerGlow} />
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingArea}>
          <ActivityIndicator color="#10B981" size="large" />
        </View>
      ) : !isPro ? (
        <View style={styles.proGate}>
          <View style={styles.proGateCard}>
            <LockIcon />
            <Text style={styles.proGateTitle}>Pro Members Only</Text>
            <Text style={styles.proGateDesc}>
              Join the exclusive trading room community. Share analysis, see live trades, and connect with other traders.
            </Text>
            <TouchableOpacity
              style={styles.subscribeBtn}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('Subscription')}>
              <Text style={styles.subscribeBtnText}>Unlock — $4.94/mo</Text>
            </TouchableOpacity>
            <Text style={styles.proGateFeatures}>
              ✦ Live trade feed  ✦ Community chat  ✦ 3% profit discount
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.chatArea}>
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={item => item.id}
            renderItem={renderMessage}
            contentContainerStyle={messages.length === 0 ? {flex: 1} : styles.messagesList}
            showsVerticalScrollIndicator={false}
            inverted={messages.length > 0}
            onRefresh={handleRefresh}
            refreshing={refreshing}
            ListEmptyComponent={<EmptyState />}
          />
        </View>
      )}

      {/* Input Bar */}
      {isPro && !loading && (
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder="Share a trade idea..."
            placeholderTextColor="rgba(255,255,255,0.2)"
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!inputText.trim() || sending) && styles.sendBtnDisabled]}
            activeOpacity={0.85}
            disabled={!inputText.trim() || sending}
            onPress={handleSend}>
            {sending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <SendArrow />
            )}
          </TouchableOpacity>
        </View>
      )}

      <MembersModal
        visible={membersVisible}
        onClose={() => setMembersVisible(false)}
        members={members}
        loading={membersLoading}
      />
    </Animated.View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#080B11'},

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 54, paddingBottom: 12,
    backgroundColor: '#0A0E14',
  },
  backBtn: {width: 36, height: 36, alignItems: 'center', justifyContent: 'center'},
  headerCenter: {flex: 1, alignItems: 'center'},
  headerTitleRow: {flexDirection: 'row', alignItems: 'center', gap: 6},
  headerLiveDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981',
    shadowColor: '#10B981', shadowOffset: {width: 0, height: 0}, shadowOpacity: 0.8, shadowRadius: 4, elevation: 4,
  },
  headerTitle: {fontFamily: 'Inter-Bold', fontSize: 17, color: '#FFFFFF'},
  headerSubtitle: {fontFamily: 'Inter-Medium', fontSize: 11, marginTop: 3},
  membersBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center',
  },
  headerDivider: {height: 1, backgroundColor: 'rgba(255,255,255,0.04)'},
  headerDividerGlow: {
    height: 1, width: 120, alignSelf: 'center',
    backgroundColor: 'rgba(16,185,129,0.3)',
  },

  // Loading
  loadingArea: {flex: 1, alignItems: 'center', justifyContent: 'center'},

  // Chat
  chatArea: {flex: 1, backgroundColor: '#080B11'},
  messagesList: {paddingHorizontal: 12, paddingVertical: 10},

  // Message bubbles
  msgWrap: {
    flexDirection: 'row', marginBottom: 10, alignItems: 'flex-end',
  },
  msgWrapLeft: {justifyContent: 'flex-start'},
  msgWrapRight: {justifyContent: 'flex-end'},
  msgAvatar: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', marginHorizontal: 6,
  },
  msgAvatarText: {fontFamily: 'Inter-Bold', fontSize: 10, color: '#FFFFFF'},
  msgNameRow: {flexDirection: 'row', alignItems: 'center', gap: 5, paddingLeft: 4, marginBottom: 3},
  msgName: {fontFamily: 'Inter-SemiBold', fontSize: 12, color: 'rgba(255,255,255,0.55)'},
  creatorBadge: {
    backgroundColor: 'rgba(139,92,246,0.15)', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4,
  },
  creatorBadgeText: {fontFamily: 'Inter-Medium', fontSize: 9, color: '#8B5CF6'},

  bubble: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18,
  },
  bubbleOther: {
    backgroundColor: '#151A23',
    borderBottomLeftRadius: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)',
  },
  bubbleContinue: {
    borderTopLeftRadius: 6,
  },
  bubbleOwn: {
    backgroundColor: '#10B981',
    borderBottomRightRadius: 6,
  },
  bubbleText: {
    fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 20,
  },
  bubbleTextOwn: {color: '#FFFFFF'},
  bubbleTime: {
    fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.2)',
    marginTop: 4, alignSelf: 'flex-end',
  },
  bubbleTimeOwn: {color: 'rgba(255,255,255,0.5)'},

  // Pro gate
  proGate: {flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24},
  proGateCard: {
    alignItems: 'center', paddingVertical: 36, paddingHorizontal: 28,
    backgroundColor: '#0F1117', borderRadius: 24,
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.15)',
    shadowColor: '#10B981', shadowOffset: {width: 0, height: 0}, shadowOpacity: 0.1, shadowRadius: 20,
    width: '100%',
  },
  proGateTitle: {fontFamily: 'Inter-Bold', fontSize: 22, color: '#FFFFFF', marginTop: 20, marginBottom: 10},
  proGateDesc: {fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.45)', textAlign: 'center', lineHeight: 21, marginBottom: 24},
  subscribeBtn: {
    backgroundColor: '#10B981', borderRadius: 14, paddingHorizontal: 36, paddingVertical: 15,
    shadowColor: '#10B981', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6,
  },
  subscribeBtnText: {fontFamily: 'Inter-Bold', fontSize: 16, color: '#FFFFFF'},
  proGateFeatures: {
    fontFamily: 'Inter-Medium', fontSize: 11, color: 'rgba(255,255,255,0.3)',
    marginTop: 16, textAlign: 'center', letterSpacing: 0.3,
  },

  // Input
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 24,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)',
    backgroundColor: '#0A0E14',
  },
  input: {
    flex: 1, fontFamily: 'Inter-Regular', fontSize: 14, color: '#FFFFFF',
    backgroundColor: '#141920', borderRadius: 22,
    paddingHorizontal: 18, paddingVertical: 10,
    maxHeight: 100, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: '#10B981',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#10B981', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.4, shadowRadius: 6, elevation: 4,
  },
  sendBtnDisabled: {opacity: 0.25},
});
