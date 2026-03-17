import React, {useState, useRef, useCallback, useEffect} from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, Dimensions, ScrollView,
} from 'react-native';
import Svg, {Path, Circle, Rect, Ellipse} from 'react-native-svg';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../types';
import {aiApi} from '../../services/ai';
import MarkdownText from '../../components/MarkdownText';

type NavProp = NativeStackNavigationProp<RootStackParamList>;
const {width} = Dimensions.get('window');

interface Message {
  id: string;
  role: 'ai' | 'user';
  text: string;
  hasStrategyCard?: boolean;
  strategyData?: {
    name: string;
    description: string;
    pairs: string[];
    riskLevel: string;
    indicators: string[];
    backtestReturn?: number;
  };
}

const INITIAL_MESSAGES: Message[] = [
  {
    id: '1',
    role: 'ai',
    text: "Hello! I'm your AI trading assistant. I can help you build strategies, analyze markets, and create custom bots. What would you like to work on?",
  },
];

const SUGGESTIONS = ['Analyze my chart', 'Create a momentum bot', 'RSI strategy', 'What is MACD?'];

// ─── Icons ─────────────────────────────────────────────────────────────────────

function BackArrow() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M15 19l-7-7 7-7" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function DotsMenu() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Circle cx={5} cy={12} r={1.5} fill="rgba(255,255,255,0.6)" />
      <Circle cx={12} cy={12} r={1.5} fill="rgba(255,255,255,0.6)" />
      <Circle cx={19} cy={12} r={1.5} fill="rgba(255,255,255,0.6)" />
    </Svg>
  );
}

function ImageAttachIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={3} width={18} height={18} rx={4} stroke="rgba(255,255,255,0.4)" strokeWidth={1.5} />
      <Circle cx={8.5} cy={8.5} r={1.5} fill="rgba(255,255,255,0.4)" />
      <Path d="M3 16l5-5 4 4 3-3 4 4" stroke="rgba(255,255,255,0.4)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
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

// AI robot avatar
function AiBotAvatar({size = 32}: {size?: number}) {
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: '#10B981' + '22',
      borderWidth: 1.5, borderColor: '#10B981' + '55',
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    }}>
      <Svg width={size * 0.7} height={size * 0.7} viewBox="0 0 64 64" fill="none">
        <Rect x={13} y={18} width={38} height={30} rx={9} fill="#10B981" opacity={0.85} />
        <Ellipse cx={23} cy={31} rx={5} ry={5} fill="#0A0E14" />
        <Ellipse cx={41} cy={31} rx={5} ry={5} fill="#0A0E14" />
        <Ellipse cx={24.5} cy={29.5} rx={2} ry={2} fill="#FFFFFF" />
        <Ellipse cx={42.5} cy={29.5} rx={2} ry={2} fill="#FFFFFF" />
        <Rect x={22} y={39} width={20} height={3.5} rx={1.75} fill="#0A0E14" />
        <Rect x={29} y={8} width={6} height={11} rx={3} fill="#10B981" opacity={0.7} />
        <Circle cx={32} cy={7} r={4} fill="#10B981" />
        <Rect x={4} y={27} width={9} height={11} rx={4} fill="#10B981" opacity={0.5} />
        <Rect x={51} y={27} width={9} height={11} rx={4} fill="#10B981" opacity={0.5} />
      </Svg>
    </View>
  );
}

// Bar chart for strategy card — generates realistic monthly bars from backtest return
function StrategyBarChart({chartWidth, backtestReturn}: {chartWidth: number; backtestReturn?: number}) {
  const monthlyAvg = (backtestReturn ?? 12) / 12;
  // Generate 12 monthly bars with variance around the average
  const bars = Array.from({length: 12}, (_, i) => {
    const seed = ((i + 1) * 7 + (backtestReturn ?? 12) * 3) % 17;
    const noise = (seed / 17 - 0.4) * monthlyAvg * 2;
    return Math.max(0.5, monthlyAvg + noise);
  });
  const maxH = 40;
  const maxVal = Math.max(...bars, 1);
  const barW = (chartWidth - (bars.length - 1) * 3) / bars.length;
  return (
    <View style={{flexDirection: 'row', alignItems: 'flex-end', height: maxH, gap: 3}}>
      {bars.map((v, i) => (
        <View key={i} style={{
          width: barW, height: Math.max(3, (v / maxVal) * maxH),
          backgroundColor: v >= 0 ? '#10B981' : '#EF4444',
          borderRadius: 3,
          opacity: 0.3 + (i / bars.length) * 0.7,
        }} />
      ))}
    </View>
  );
}

// ─── Screen ────────────────────────────────────────────────────────────────────

export default function AIChatScreen() {
  const navigation = useNavigation<NavProp>();
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [inputText, setInputText] = useState('');
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [isTyping, setIsTyping] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Load previous conversation on mount
  useEffect(() => {
    (async () => {
      try {
        const history = await aiApi.getChatHistory();
        if (history.conversationId && history.messages.length > 0) {
          setConversationId(history.conversationId);
          const loaded: Message[] = history.messages.map(m => ({
            id: m.id,
            role: m.role === 'user' ? 'user' : 'ai',
            text: m.content.replace(/```strategy-json[\s\S]*?```/g, '').trim(),
          }));
          setMessages([INITIAL_MESSAGES[0], ...loaded]);
        }
      } catch {}
    })();
  }, []);

  const sendMessage = useCallback(async () => {
    if (!inputText.trim()) return;
    const userMsg: Message = {id: Date.now().toString(), role: 'user', text: inputText.trim()};
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    try {
      const response = await aiApi.chat(inputText.trim(), conversationId);
      setConversationId(response.conversationId);

      // Strip strategy-json fence from display text
      const cleanReply = response.reply
        .replace(/```strategy-json[\s\S]*?```/g, '')
        .trim();

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        text: cleanReply,
        hasStrategyCard: !!response.strategy,
        strategyData: response.strategy,
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (e: any) {
      const msg = e?.message || 'Sorry, I encountered an error. Please try again.';
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        text: msg,
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({animated: true}), 100);
    }
  }, [inputText, conversationId]);

  // Strategy card width = bubble max width - padding
  const strategyCardWidth = width * 0.72 - 32;

  const renderMessage = useCallback(({item}: {item: Message}) => {
    const isUser = item.role === 'user';

    if (isUser) {
      return (
        <View style={styles.userRow}>
          <View style={styles.userMeta}>
            <Text style={styles.youLabel}>You</Text>
            <View style={styles.userAvatar}>
              <Text style={styles.userAvatarText}>Y</Text>
            </View>
          </View>
          <View style={styles.userBubble}>
            <Text style={styles.userText}>{item.text}</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.aiRow}>
        <AiBotAvatar size={34} />
        <View style={styles.aiContent}>
          <Text style={styles.aiNameLabel}>TradingBot AI</Text>
          <View style={styles.aiBubble}>
            <MarkdownText text={item.text} baseStyle={styles.aiText} />
            {item.hasStrategyCard && (
              <View style={styles.strategyCard}>
                <View style={styles.strategyTopRow}>
                  <View style={{flex: 1, marginRight: 8}}>
                    <Text style={styles.strategyName}>{item.strategyData?.name || 'Strategy'}</Text>
                    <Text style={styles.strategySubLabel}>STRATEGY PREVIEW</Text>
                  </View>
                  <View style={styles.backtestBadge}>
                    <Text style={styles.backtestText}>{item.strategyData?.backtestReturn ? `+${item.strategyData.backtestReturn.toFixed(1)}%` : ''}{'\n'}BACKTEST</Text>
                  </View>
                </View>
                <Text style={styles.perfLabel}>30D PERFORMANCE</Text>
                <StrategyBarChart chartWidth={strategyCardWidth} backtestReturn={item.strategyData?.backtestReturn} />
                <TouchableOpacity
                  style={styles.deployBtn}
                  onPress={() => navigation.navigate('BotBuilder', {fromChat: true, strategyName: item.strategyData?.name || 'Custom Strategy'})}
                  activeOpacity={0.8}>
                  <Text style={styles.deployBtnText}>Deploy as Bot</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  }, [strategyCardWidth, navigation]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn}>
          <BackArrow />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>AI Bot Builder</Text>
          <View style={styles.activePill}>
            <View style={styles.activeDot} />
            <Text style={styles.activeText}>ACTIVE SESSION</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.headerBtn}>
          <DotsMenu />
        </TouchableOpacity>
      </View>

      {/* Messages — flex:1 pushes bottom bar down */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.messagesList}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({animated: true})}
        renderItem={renderMessage}
        style={styles.messageList}
      />

      {isTyping && (
        <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 8}}>
          <AiBotAvatar size={24} />
          <Text style={{fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.4)'}}>AI is thinking...</Text>
        </View>
      )}

      {/* Bottom bar: suggestions + input — pinned above keyboard */}
      <View style={styles.bottomBar}>
        {/* Suggestion chips — horizontal scroll */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.suggestionsScroll}
          contentContainerStyle={styles.suggestionsContent}>
          {SUGGESTIONS.map(s => (
            <TouchableOpacity
              key={s}
              style={styles.chip}
              onPress={() => setInputText(s)}
              activeOpacity={0.7}>
              <Text style={styles.chipText}>{s}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Input bar */}
        <View style={styles.inputBar}>
          <TouchableOpacity style={styles.attachBtn}>
            <ImageAttachIcon />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            placeholder="Type a message..."
            placeholderTextColor="rgba(255,255,255,0.25)"
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={sendMessage}
          />
          <TouchableOpacity style={styles.sendBtn} onPress={sendMessage} activeOpacity={0.85}>
            <SendArrow />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0A0E14'},
  messageList: {flex: 1},
  bottomBar: {backgroundColor: '#0A0E14'},

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 54, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerBtn: {width: 36, height: 36, alignItems: 'center', justifyContent: 'center'},
  headerCenter: {flex: 1, alignItems: 'center'},
  headerTitle: {fontFamily: 'Inter-Bold', fontSize: 17, color: '#FFFFFF', marginBottom: 4},
  activePill: {flexDirection: 'row', alignItems: 'center', gap: 5},
  activeDot: {width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981'},
  activeText: {fontFamily: 'Inter-SemiBold', fontSize: 10, color: '#10B981', letterSpacing: 0.5},

  // Messages list
  messagesList: {paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10},

  // AI message
  aiRow: {flexDirection: 'row', alignItems: 'flex-start', marginBottom: 18, maxWidth: '100%'},
  aiContent: {flex: 1, marginLeft: 10},
  aiNameLabel: {fontFamily: 'Inter-SemiBold', fontSize: 12, color: '#10B981', marginBottom: 6},
  aiBubble: {
    backgroundColor: '#161D2A',
    borderRadius: 4, borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomRightRadius: 16,
    padding: 14, alignSelf: 'flex-start', maxWidth: '95%',
  },
  aiText: {fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 21},

  // User message
  userRow: {alignItems: 'flex-end', marginBottom: 18},
  userMeta: {flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, justifyContent: 'flex-end'},
  youLabel: {fontFamily: 'Inter-SemiBold', fontSize: 12, color: 'rgba(255,255,255,0.4)'},
  userAvatar: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  userAvatarText: {fontFamily: 'Inter-Bold', fontSize: 10, color: '#FFFFFF'},
  userBubble: {
    backgroundColor: '#10B981',
    borderRadius: 16, borderBottomRightRadius: 4,
    paddingHorizontal: 16, paddingVertical: 12,
    maxWidth: '80%', alignSelf: 'flex-end',
  },
  userText: {fontFamily: 'Inter-Regular', fontSize: 14, color: '#FFFFFF', lineHeight: 21},

  // Strategy card
  strategyCard: {
    backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 12,
    padding: 14, marginTop: 12,
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)',
  },
  strategyTopRow: {flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10},
  strategyName: {fontFamily: 'Inter-Bold', fontSize: 14, color: '#FFFFFF', lineHeight: 20},
  strategySubLabel: {
    fontFamily: 'Inter-Medium', fontSize: 9, color: 'rgba(255,255,255,0.35)',
    letterSpacing: 0.8, marginTop: 4,
  },
  backtestBadge: {
    backgroundColor: '#10B981',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
    alignItems: 'center',
  },
  backtestText: {fontFamily: 'Inter-Bold', fontSize: 11, color: '#FFFFFF', textAlign: 'center', lineHeight: 16},
  perfLabel: {
    fontFamily: 'Inter-Medium', fontSize: 9, color: 'rgba(255,255,255,0.3)',
    letterSpacing: 0.8, marginBottom: 8,
  },
  deployBtn: {
    marginTop: 12, backgroundColor: '#10B981', borderRadius: 10,
    paddingVertical: 10, alignItems: 'center',
  },
  deployBtnText: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#FFFFFF'},

  // Suggestions
  suggestionsScroll: {height: 46},
  suggestionsContent: {paddingHorizontal: 16, paddingVertical: 6, gap: 8, alignItems: 'center'},
  chip: {
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: '#161D2A',
    borderRadius: 999,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  chipText: {fontFamily: 'Inter-Medium', fontSize: 13, color: 'rgba(255,255,255,0.75)'},

  // Input bar
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 16, paddingVertical: 6,
    marginBottom: 12,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
    backgroundColor: '#0A0E14',
  },
  attachBtn: {paddingBottom: 4, width: 28, alignItems: 'center'},
  input: {
    flex: 1, fontFamily: 'Inter-Regular', fontSize: 14, color: '#FFFFFF',
    backgroundColor: '#161D2A',
    borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10,
    maxHeight: 100,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#10B981',
    alignItems: 'center', justifyContent: 'center',
  },
});
