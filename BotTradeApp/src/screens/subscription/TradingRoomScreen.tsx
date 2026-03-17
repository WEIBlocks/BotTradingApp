import React, {useState, useCallback, useEffect} from 'react';
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
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../types';
import Svg, {Path, Rect, Circle} from 'react-native-svg';
import {subscriptionApi} from '../../services/subscription';

type Nav = NativeStackNavigationProp<RootStackParamList>;

// ─── Icons ──────────────────────────────────────────────────────────────────────

function BackArrow() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 19l-7-7 7-7"
        stroke="#FFFFFF"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function LockIcon() {
  return (
    <Svg width={48} height={48} viewBox="0 0 24 24" fill="none">
      <Rect
        x={5}
        y={11}
        width={14}
        height={10}
        rx={2}
        stroke="rgba(255,255,255,0.5)"
        strokeWidth={1.5}
      />
      <Path
        d="M8 11V7a4 4 0 018 0v4"
        stroke="rgba(255,255,255,0.5)"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <Circle cx={12} cy={16} r={1.5} fill="rgba(255,255,255,0.5)" />
    </Svg>
  );
}

function SendArrow() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"
        stroke="#FFFFFF"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ─── Chat Data ──────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  user: string;
  msg: string;
  time: string;
  isAlert: boolean;
  avatarColor: string;
}

const PLACEHOLDER_MESSAGES: ChatMessage[] = [
  {id: '1', user: 'Alex T.', msg: 'BTC looking bullish on the 4h chart', time: '2m ago', isAlert: false, avatarColor: '#3B82F6'},
  {id: '2', user: 'Sarah K.', msg: 'Just took profit on my SOL position +4.2%', time: '5m ago', isAlert: false, avatarColor: '#8B5CF6'},
  {id: '3', user: 'TradingBot', msg: 'Alert: Momentum Alpha bought BTC at $64,210', time: '8m ago', isAlert: true, avatarColor: '#10B981'},
  {id: '4', user: 'Mike R.', msg: 'Anyone watching the ETH/BTC ratio?', time: '12m ago', isAlert: false, avatarColor: '#F59E0B'},
];

// ─── Screen ─────────────────────────────────────────────────────────────────────

export default function TradingRoomScreen() {
  const navigation = useNavigation<Nav>();
  const [isPro, setIsPro] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    subscriptionApi.getCurrent()
      .then(sub => {
        if (sub && sub.tier === 'pro' && sub.status === 'active') {
          setIsPro(true);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const renderMessage = useCallback(({item}: {item: ChatMessage}) => {
    const firstLetter = item.user.charAt(0).toUpperCase();

    return (
      <View
        style={[
          styles.messageRow,
          item.isAlert && styles.alertMessageRow,
        ]}>
        <View style={[styles.avatar, {backgroundColor: item.avatarColor}]}>
          <Text style={styles.avatarText}>{firstLetter}</Text>
        </View>
        <View style={styles.messageContent}>
          <View style={styles.messageTopRow}>
            <Text style={styles.userName}>{item.user}</Text>
            <Text style={styles.messageTime}>{item.time}</Text>
          </View>
          <Text style={styles.messageText}>{item.msg}</Text>
        </View>
      </View>
    );
  }, []);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}>
          <BackArrow />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trading Room</Text>
        <View style={styles.onlineBadge}>
          <View style={styles.onlineDot} />
          <Text style={styles.onlineText}>142 online</Text>
        </View>
      </View>

      {/* Chat Content */}
      <View style={styles.chatArea}>
        <FlatList
          data={messages.length > 0 ? messages : PLACEHOLDER_MESSAGES}
          keyExtractor={item => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          inverted={false}
        />
      </View>

      {/* Pro Gate Overlay */}
      {loading ? (
        <View style={styles.proGate}>
          <ActivityIndicator color="#10B981" size="large" />
        </View>
      ) : !isPro ? (
        <View style={styles.proGate}>
          <View style={styles.proGateInner}>
            <LockIcon />
            <Text style={styles.proGateTitle}>Pro Members Only</Text>
            <Text style={styles.proGateDesc}>
              Subscribe to TradingApp Pro to access the trading room community
            </Text>
            <TouchableOpacity
              style={styles.subscribeBtn}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('Subscription')}>
              <Text style={styles.subscribeBtnText}>
                Subscribe — $4.94/mo
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* Input Bar */}
      <View style={styles.inputBar}>
        <TextInput
          style={[styles.input, !isPro && styles.inputDisabled]}
          placeholder={isPro ? 'Type a message...' : 'Subscribe to chat...'}
          placeholderTextColor="rgba(255,255,255,0.25)"
          value={inputText}
          onChangeText={setInputText}
          editable={isPro}
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          style={[styles.sendBtn, !isPro && styles.sendBtnDisabled]}
          activeOpacity={0.85}
          disabled={!isPro}>
          <SendArrow />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E14',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 54,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Inter-Bold',
    fontSize: 17,
    color: '#FFFFFF',
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#10B981',
  },
  onlineText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: '#10B981',
  },

  // Chat area
  chatArea: {
    flex: 1,
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  // Message row
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 12,
  },
  alertMessageRow: {
    backgroundColor: 'rgba(16,185,129,0.06)',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarText: {
    fontFamily: 'Inter-Bold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  messageContent: {
    flex: 1,
  },
  messageTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  userName: {
    fontFamily: 'Inter-Bold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  messageTime: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
  },
  messageText: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 20,
  },

  // Pro gate overlay
  proGate: {
    ...StyleSheet.absoluteFillObject,
    top: 80,
    backgroundColor: 'rgba(10,14,20,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  proGateInner: {
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  proGateTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: 22,
    color: '#FFFFFF',
    marginTop: 20,
    marginBottom: 10,
  },
  proGateDesc: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 28,
  },
  subscribeBtn: {
    backgroundColor: '#10B981',
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 16,
  },
  subscribeBtnText: {
    fontFamily: 'Inter-Bold',
    fontSize: 16,
    color: '#FFFFFF',
  },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    backgroundColor: '#0A0E14',
  },
  input: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: '#FFFFFF',
    backgroundColor: '#161B22',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  inputDisabled: {
    opacity: 0.4,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.3,
  },
});
