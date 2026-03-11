import React, {useState, useRef, useCallback} from 'react';
import {View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, Dimensions} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import Badge from '../../components/common/Badge';
import SendIcon from '../../components/icons/SendIcon';
import ImageIcon from '../../components/icons/ImageIcon';
import ChartIcon from '../../components/icons/ChartIcon';
import MiniLineChart from '../../components/charts/MiniLineChart';

const {width} = Dimensions.get('window');

interface Message {
  id: string;
  role: 'ai' | 'user';
  text: string;
  hasStrategyCard?: boolean;
}

const INITIAL_MESSAGES: Message[] = [
  {
    id: '1',
    role: 'ai',
    text: 'Hello! I\'m your AI trading assistant. I can help you create custom bots, analyze charts, and build strategies tailored to your goals.',
  },
  {
    id: '2',
    role: 'user',
    text: 'Create a BTC momentum bot that buys dips and has a 2% stop-loss.',
  },
  {
    id: '3',
    role: 'ai',
    text: 'Great choice! I\'ve designed a custom BTC Dip Buyer strategy for you. It uses RSI < 30 to identify oversold conditions, with a dynamic 2% stop-loss and 4% take-profit. Based on 6-month backtesting:',
    hasStrategyCard: true,
  },
];

const SUGGESTIONS = ['Analyze my chart', 'Create a momentum bot', 'RSI strategy', 'What is MACD?'];

export default function AIChatScreen() {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);

  const sendMessage = useCallback(() => {
    if (!inputText.trim()) return;
    const newMsg: Message = {id: Date.now().toString(), role: 'user', text: inputText};
    setMessages(prev => [...prev, newMsg]);
    setInputText('');

    // Simulate AI response
    setTimeout(() => {
      const aiReply: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        text: 'I\'m analyzing your request... Based on current market conditions, I recommend a momentum-based approach with tight risk controls.',
      };
      setMessages(prev => [...prev, aiReply]);
    }, 800);
  }, [inputText]);

  const mockChartData = [10000, 10200, 10150, 10400, 10800, 10650, 11100, 11400, 11200, 11600, 12100, 11420];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>AI Bot Builder</Text>
          <Badge label="● ACTIVE SESSION" variant="green" size="sm" />
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({animated: true})}
          renderItem={({item}) => {
            const isUser = item.role === 'user';
            return (
              <View style={[styles.messageRow, isUser && styles.messageRowUser]}>
                {!isUser && (
                  <View style={styles.aiAvatar}>
                    <Text style={styles.aiAvatarText}>AI</Text>
                  </View>
                )}
                <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
                  {!isUser && <Text style={styles.aiName}>TradingBot AI</Text>}
                  <Text style={[styles.messageText, isUser && styles.userMessageText]}>{item.text}</Text>
                  {item.hasStrategyCard && (
                    <View style={styles.strategyCard}>
                      <View style={styles.strategyHeader}>
                        <View>
                          <Text style={styles.strategyName}>Custom BTC Dip Buyer</Text>
                          <Text style={styles.strategySubtitle}>STRATEGY PREVIEW</Text>
                        </View>
                        <Badge label="+14.2% BACKTEST" variant="green" size="sm" />
                      </View>
                      <MiniLineChart data={mockChartData} width={width - 160} height={50} color="#10B981" />
                    </View>
                  )}
                </View>
              </View>
            );
          }}
        />

        {/* Suggestion chips */}
        <View style={styles.suggestionsRow}>
          {SUGGESTIONS.map(s => (
            <TouchableOpacity
              key={s}
              style={styles.suggestionChip}
              onPress={() => setInputText(s)}
              activeOpacity={0.7}>
              <Text style={styles.suggestionText}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Input bar */}
        <View style={styles.inputBar}>
          <TouchableOpacity style={styles.inputIcon}>
            <ImageIcon size={20} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            placeholder="Type a message..."
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[styles.sendBtn, inputText.trim() && styles.sendBtnActive]}
            onPress={sendMessage}
            activeOpacity={0.8}>
            <SendIcon size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0F1117'},
  header: {
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
  },
  headerTitle: {fontFamily: 'Inter-Bold', fontSize: 20, color: '#FFFFFF', marginBottom: 4},
  chatContainer: {flex: 1},
  messagesList: {paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8},
  messageRow: {flexDirection: 'row', alignItems: 'flex-end', marginBottom: 14},
  messageRowUser: {justifyContent: 'flex-end'},
  aiAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center', marginRight: 8,
  },
  aiAvatarText: {fontFamily: 'Inter-Bold', fontSize: 11, color: '#FFFFFF'},
  bubble: {maxWidth: '78%', borderRadius: 16, padding: 12},
  aiBubble: {backgroundColor: '#1C2333', borderTopLeftRadius: 4},
  userBubble: {backgroundColor: '#10B981', borderTopRightRadius: 4},
  aiName: {fontFamily: 'Inter-SemiBold', fontSize: 11, color: '#10B981', marginBottom: 4},
  messageText: {fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.8)', lineHeight: 20},
  userMessageText: {color: '#FFFFFF'},
  strategyCard: {
    backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 12, marginTop: 10,
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)',
  },
  strategyHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8},
  strategyName: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#FFFFFF'},
  strategySubtitle: {fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2},
  suggestionsRow: {
    paddingHorizontal: 16, paddingVertical: 8,
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
  },
  suggestionChip: {
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: 'rgba(13,127,242,0.12)', borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(13,127,242,0.3)',
  },
  suggestionText: {fontFamily: 'Inter-Medium', fontSize: 12, color: '#0D7FF2'},
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#161B22', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
    gap: 10,
  },
  inputIcon: {paddingBottom: 6},
  input: {
    flex: 1, fontFamily: 'Inter-Regular', fontSize: 14, color: '#FFFFFF',
    backgroundColor: '#1C2333', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10,
    maxHeight: 100, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnActive: {backgroundColor: '#10B981'},
});
