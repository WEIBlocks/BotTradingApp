import React, {useState, useCallback, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
  Modal,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../types';
import Svg, {Path, Rect, Circle} from 'react-native-svg';
import {subscriptionApi} from '../../services/subscription';
import {tradingRoomApi, TradingRoomMessage, TradingRoomMember} from '../../services/tradingRoom';
import {useToast} from '../../context/ToastContext';
import {useAuth} from '../../context/AuthContext';

type Nav = NativeStackNavigationProp<RootStackParamList>;

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
    <Svg width={48} height={48} viewBox="0 0 24 24" fill="none">
      <Rect x={5} y={11} width={14} height={10} rx={2} stroke="rgba(255,255,255,0.5)" strokeWidth={1.5} />
      <Path d="M8 11V7a4 4 0 018 0v4" stroke="rgba(255,255,255,0.5)" strokeWidth={1.5} strokeLinecap="round" />
      <Circle cx={12} cy={16} r={1.5} fill="rgba(255,255,255,0.5)" />
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

// ─── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

// ─── Empty State Animated ───────────────────────────────────────────────────────

function EmptyState() {
  const pulse1 = useRef(new Animated.Value(0.3)).current;
  const pulse2 = useRef(new Animated.Value(0.5)).current;
  const pulse3 = useRef(new Animated.Value(0.2)).current;

  useEffect(() => {
    const animate = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, {toValue: 1, duration: 1200, useNativeDriver: true}),
          Animated.timing(val, {toValue: 0.2, duration: 1200, useNativeDriver: true}),
        ]),
      );
    animate(pulse1, 0).start();
    animate(pulse2, 400).start();
    animate(pulse3, 800).start();
  }, []);

  return (
    <View style={emptyStyles.container}>
      {/* Animated dots */}
      <View style={emptyStyles.dotsRow}>
        <Animated.View style={[emptyStyles.dot, {opacity: pulse1, backgroundColor: '#10B981'}]} />
        <Animated.View style={[emptyStyles.dot, {opacity: pulse2, backgroundColor: '#0D7FF2'}]} />
        <Animated.View style={[emptyStyles.dot, {opacity: pulse3, backgroundColor: '#8B5CF6'}]} />
      </View>
      <Svg width={60} height={60} viewBox="0 0 24 24" fill="none" style={{marginBottom: 16}}>
        <Path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" stroke="rgba(255,255,255,0.12)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
      <Text style={emptyStyles.title}>Welcome to the Trading Room</Text>
      <Text style={emptyStyles.subtitle}>
        Be the first to start a conversation.{'\n'}Share your analysis, trades, and ideas with the community.
      </Text>
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  container: {alignItems: 'center', justifyContent: 'center', paddingVertical: 80, paddingHorizontal: 40},
  dotsRow: {flexDirection: 'row', gap: 8, marginBottom: 20},
  dot: {width: 10, height: 10, borderRadius: 5},
  title: {fontFamily: 'Inter-Bold', fontSize: 18, color: '#FFFFFF', marginBottom: 8, textAlign: 'center'},
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
          {/* Handle bar */}
          <View style={memberStyles.handleBar} />

          {/* Header */}
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
                      {/* Online indicator */}
                      <View style={[memberStyles.statusDot, {backgroundColor: item.isOnline ? '#10B981' : '#4B5563'}]} />
                    </View>
                    <View style={{flex: 1}}>
                      <Text style={memberStyles.name}>
                        {item.name}
                        {item.role === 'admin' && <Text style={{color: '#F59E0B', fontSize: 11}}> ADMIN</Text>}
                        {item.role === 'creator' && <Text style={{color: '#8B5CF6', fontSize: 11}}> CREATOR</Text>}
                      </Text>
                      <Text style={memberStyles.status}>
                        {item.isOnline ? 'Online' : 'Offline'}
                      </Text>
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
  header: {
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
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

  // Members modal
  const [membersVisible, setMembersVisible] = useState(false);
  const [members, setMembers] = useState<TradingRoomMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Poll every 8 seconds
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

  const renderMessage = useCallback(({item}: {item: TradingRoomMessage}) => {
    const initials = item.avatarInitials || item.userName?.charAt(0)?.toUpperCase() || '?';
    const color = item.avatarColor || '#3B82F6';
    const isOwn = item.userId === user?.id;

    return (
      <View style={[styles.messageRow, item.isSystemMessage && styles.alertMessageRow]}>
        <View style={[styles.avatar, {backgroundColor: color}]}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.messageContent}>
          <View style={styles.messageTopRow}>
            <Text style={[styles.userName, isOwn && {color: '#10B981'}]}>
              {item.userName}{isOwn ? ' (you)' : ''}
            </Text>
            <Text style={styles.messageTime}>{timeAgo(item.createdAt)}</Text>
          </View>
          <Text style={styles.messageText}>{item.content}</Text>
        </View>
      </View>
    );
  }, [user?.id]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <BackArrow />
        </TouchableOpacity>

        {/* Title — tappable to open members */}
        <TouchableOpacity onPress={isPro ? openMembers : undefined} style={styles.headerCenter} activeOpacity={0.7}>
          <Text style={styles.headerTitle}>Trading Room</Text>
          {isPro && !loading && (
            <Text style={styles.headerSubtitle}>
              <Text style={{color: '#10B981'}}>{onlineCount}</Text>
              <Text style={{color: 'rgba(255,255,255,0.2)'}}> / {totalMembers}</Text>
            </Text>
          )}
        </TouchableOpacity>

        {/* Members button */}
        {isPro && !loading && (
          <TouchableOpacity onPress={openMembers} style={styles.membersBtn} activeOpacity={0.7}>
            <UsersIcon />
          </TouchableOpacity>
        )}
        {(!isPro || loading) && <View style={{width: 36}} />}
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingArea}>
          <ActivityIndicator color="#10B981" size="large" />
        </View>
      ) : !isPro ? (
        <View style={styles.proGate}>
          <View style={styles.proGateInner}>
            <LockIcon />
            <Text style={styles.proGateTitle}>Pro Members Only</Text>
            <Text style={styles.proGateDesc}>
              Subscribe to BotTrade Pro to access the trading room community, live feed of trades, and 3% discount on profits.
            </Text>
            <TouchableOpacity
              style={styles.subscribeBtn}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('Subscription')}>
              <Text style={styles.subscribeBtnText}>Subscribe — $4.94/mo</Text>
            </TouchableOpacity>
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
            placeholder="Type a message..."
            placeholderTextColor="rgba(255,255,255,0.25)"
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

      {/* Members Modal */}
      <MembersModal
        visible={membersVisible}
        onClose={() => setMembersVisible(false)}
        members={members}
        loading={membersLoading}
      />
    </KeyboardAvoidingView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0A0E14'},

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 54, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backBtn: {width: 36, height: 36, alignItems: 'center', justifyContent: 'center'},
  headerCenter: {flex: 1, alignItems: 'center'},
  headerTitle: {fontFamily: 'Inter-Bold', fontSize: 17, color: '#FFFFFF'},
  headerSubtitle: {fontFamily: 'Inter-Medium', fontSize: 12, marginTop: 2},
  membersBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center',
  },

  loadingArea: {flex: 1, alignItems: 'center', justifyContent: 'center'},

  chatArea: {flex: 1},
  messagesList: {paddingHorizontal: 16, paddingVertical: 12},

  messageRow: {
    flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14,
    paddingHorizontal: 8, paddingVertical: 8, borderRadius: 12,
  },
  alertMessageRow: {backgroundColor: 'rgba(16,185,129,0.06)'},
  avatar: {width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 10},
  avatarText: {fontFamily: 'Inter-Bold', fontSize: 14, color: '#FFFFFF'},
  messageContent: {flex: 1},
  messageTopRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3},
  userName: {fontFamily: 'Inter-Bold', fontSize: 14, color: '#FFFFFF'},
  messageTime: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.25)'},
  messageText: {fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.75)', lineHeight: 20},

  proGate: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  proGateInner: {alignItems: 'center', paddingHorizontal: 40},
  proGateTitle: {fontFamily: 'Inter-Bold', fontSize: 22, color: '#FFFFFF', marginTop: 20, marginBottom: 10},
  proGateDesc: {fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 21, marginBottom: 28},
  subscribeBtn: {backgroundColor: '#10B981', borderRadius: 14, paddingHorizontal: 32, paddingVertical: 16},
  subscribeBtnText: {fontFamily: 'Inter-Bold', fontSize: 16, color: '#FFFFFF'},

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 16, paddingVertical: 8, marginBottom: 12,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', backgroundColor: '#0A0E14',
  },
  input: {
    flex: 1, fontFamily: 'Inter-Regular', fontSize: 14, color: '#FFFFFF',
    backgroundColor: '#161B22', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10,
    maxHeight: 100, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#10B981',
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: {opacity: 0.3},
});
