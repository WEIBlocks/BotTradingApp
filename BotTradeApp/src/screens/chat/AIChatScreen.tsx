import React, {useState, useRef, useCallback, useEffect} from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Keyboard, Animated, Platform, Dimensions, ScrollView, Image, ActivityIndicator, Modal, Alert,
} from 'react-native';
import Svg, {Path, Circle, Rect, Ellipse} from 'react-native-svg';
import {useNavigation, useRoute, RouteProp} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {launchImageLibrary} from 'react-native-image-picker';
import {RootStackParamList, MainTabParamList} from '../../types';
import {API_BASE_URL} from '../../config/api';
import {storage} from '../../services/storage';
import {aiApi} from '../../services/ai';
import {useIAP} from '../../context/IAPContext';
import {useAuth} from '../../context/AuthContext';
import MarkdownText from '../../components/MarkdownText';

type NavProp = NativeStackNavigationProp<RootStackParamList>;
const {width} = Dimensions.get('window');

import {AIChatResponse} from '../../services/ai';

interface Message {
  id: string;
  role: 'ai' | 'user';
  text: string;
  cleanPrompt?: string;
  hasStrategyCard?: boolean;
  strategyData?: AIChatResponse['strategy'];
  imageUri?: string;
}

const INITIAL_MESSAGES: Message[] = [
  {
    id: '1',
    role: 'ai',
    text: "Hello! I'm your AI trading assistant. I can help you build strategies, analyze markets, and create custom bots. What would you like to work on?",
  },
];

const SUGGESTIONS = ['Analyze my chart', 'Create a momentum bot', 'RSI strategy', 'What is MACD?'];

function formatConvDate(dateStr: string): string {
  try {
    // Handle PostgreSQL timestamp format: "2026-03-25 13:08:48.100126+00"
    const d = new Date(dateStr.replace(' ', 'T').replace(/\+00$/, 'Z'));
    if (isNaN(d.getTime())) return 'Unknown';
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
  } catch {
    return 'Unknown';
  }
}

// ─── Icons ─────────────────────────────────────────────────────────────────────

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

function HistoryIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M3 3v5h5" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M3.05 13A9 9 0 1 0 4.64 5.64L3 8" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 7v5l4 2" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
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

// ─── Rename Modal Styles ────────────────────────────────────────────────────────

const renameStyles = StyleSheet.create({
  overlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24},
  dialog: {backgroundColor: '#161D2A', borderRadius: 18, padding: 24, width: '100%'},
  dialogTitle: {fontFamily: 'Inter-Bold', fontSize: 18, color: '#FFFFFF', marginBottom: 16},
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: 'Inter-Regular', fontSize: 15, color: '#FFFFFF',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginBottom: 20,
  },
  btnRow: {flexDirection: 'row', gap: 12},
  cancelBtn: {flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center'},
  cancelText: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: 'rgba(255,255,255,0.5)'},
  saveBtn: {flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#10B981', alignItems: 'center'},
  saveText: {fontFamily: 'Inter-Bold', fontSize: 14, color: '#FFFFFF'},
});

// ─── Screen ────────────────────────────────────────────────────────────────────

export default function AIChatScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteProp<MainTabParamList, 'AIChat'>>();
  const {isPro, initialized: iapInitialized} = useIAP();
  const {user} = useAuth();
  const botId = (route.params as any)?.botId as string | undefined;
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [inputText, setInputText] = useState('');
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [isTyping, setIsTyping] = useState(false);
  const [stageText, setStageText] = useState<string>('');
  const [historyLoading, setHistoryLoading] = useState(true);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [attachedImageName, setAttachedImageName] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState(0); // 0 = not uploading
  const [showConversations, setShowConversations] = useState(false);
  const [conversations, setConversations] = useState<any[]>([]);
  const [convsLoading, setConvsLoading] = useState(false);
  const [conversationTitle, setConversationTitle] = useState<string>('AI Bot Builder');
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{id: string; current: string} | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{id: string; title: string} | null>(null);
  const [botName, setBotNameState] = useState<string>('TradingBot AI');
  const [showBotNameModal, setShowBotNameModal] = useState(false);
  const [botNameInput, setBotNameInput] = useState('');
  const [showDotsMenu, setShowDotsMenu] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const shouldScrollToEnd = useRef(true);
  const keyboardHeight = useRef(new Animated.Value(0)).current;

  // Pro gate — wait for IAP to finish initializing before redirecting
  useEffect(() => {
    if (!iapInitialized) return;
    if (!isPro && user?.role !== 'admin') {
      navigation.replace('Subscription');
    }
  }, [iapInitialized, isPro, user?.role, navigation]);

  useEffect(() => {
    const TAB_BAR_HEIGHT = 218;
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        Animated.timing(keyboardHeight, {
          toValue: TAB_BAR_HEIGHT,
          duration: 150,
          useNativeDriver: false,
        }).start();
      },
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        Animated.timing(keyboardHeight, {
          toValue: 0,
          duration: 150,
          useNativeDriver: false,
        }).start();
      },
    );
    return () => { showSub.remove(); hideSub.remove(); };
  }, [keyboardHeight]);

  // Load bot name on mount
  useEffect(() => {
    aiApi.getBotName().then(name => {
      if (name) setBotNameState(name);
    }).catch(() => {});
  }, []);

  // Load previous conversation on mount
  useEffect(() => {
    (async () => {
      setHistoryLoading(true);
      try {
        const history = await aiApi.getChatHistory();
        if (history.conversationId && history.messages.length > 0) {
          setConversationId(history.conversationId);
          // Try to get stored title from conversations list
          try {
            const convs = await aiApi.listConversations();
            const found = (convs as any[]).find((c: any) => c.id === history.conversationId);
            if (found?.title) setConversationTitle(found.title);
          } catch {}
          const loaded: Message[] = history.messages.map((m: any) => ({
            id: m.id,
            role: m.role === 'user' ? 'user' as const : 'ai' as const,
            text: (m.content || '').replace(/```strategy-json[\s\S]*?```/g, '').replace(/\[Image: [^\]]+\]\s*/g, '').trim(),
            imageUri: m.metadata?.attachmentUrl ? `${API_BASE_URL}${m.metadata.attachmentUrl}` : undefined,
          }));
          setMessages([INITIAL_MESSAGES[0], ...loaded]);
        }
      } catch {}
      setHistoryLoading(false);
    })();
  }, []);

  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);

  const handleImageAttach = useCallback(async () => {
    launchImageLibrary({mediaType: 'photo', quality: 0.8}, async response => {
      if (response.didCancel || response.errorCode) return;
      const asset = response.assets?.[0];
      if (!asset?.uri) return;

      const uri = asset.uri;
      const fname = asset.fileName || 'chart.jpg';
      const mimeType = asset.type || 'image/jpeg';

      setAttachedImage(uri);
      setAttachedImageName(fname);
      setUploadedUrl(null);

      // Pre-upload immediately
      setUploadProgress(5);
      try {
        const token = await storage.getAccessToken();
        const formData = new FormData();
        formData.append('image', {uri, name: fname, type: mimeType} as any);

        setUploadProgress(30);
        const res = await fetch(`${API_BASE_URL}/training/upload-image`, {
          method: 'POST',
          headers: {Authorization: `Bearer ${token}`},
          body: formData,
        });
        setUploadProgress(80);

        if (res.ok) {
          const json = await res.json();
          setUploadedUrl(json.data?.url || json.url || null);
          setUploadProgress(100);
          setTimeout(() => setUploadProgress(0), 500);
        } else {
          setUploadProgress(0);
        }
      } catch {
        // Upload failed — will try again on send
        setUploadProgress(0);
      }
    });
  }, []);

  const isUploading = uploadProgress > 0 && uploadProgress < 100;

  const loadConversations = useCallback(async () => {
    setConvsLoading(true);
    try {
      const convs = await aiApi.listConversations();
      setConversations(convs);
    } catch {}
    setConvsLoading(false);
  }, []);

  const handleNewConversation = useCallback(() => {
    setShowConversations(false);
    setConversationId(undefined);
    setConversationTitle('AI Bot Builder');
    setMessages(INITIAL_MESSAGES);
  }, []);

  const handleSelectConversation = useCallback(async (convId: string, title?: string) => {
    setShowConversations(false);
    setHistoryLoading(true);
    try {
      const conv = await aiApi.getConversation(convId);
      setConversationId(conv.conversationId);
      setConversationTitle(title || 'AI Bot Builder');
      const loaded = (conv.messages || []).map((m: any) => ({
        id: m.id,
        role: m.role === 'user' ? 'user' as const : 'ai' as const,
        text: (m.content || '').replace(/```strategy-json[\s\S]*?```/g, '').replace(/\[Image: [^\]]+\]\s*/g, '').trim(),
        imageUri: m.metadata?.attachmentUrl ? `${API_BASE_URL}${m.metadata.attachmentUrl}` : undefined,
      }));
      setMessages([INITIAL_MESSAGES[0], ...loaded]);
    } catch {}
    setHistoryLoading(false);
  }, []);

  const confirmDeleteConversation = useCallback((convId: string, title: string) => {
    setShowConversations(false);
    setTimeout(() => setDeleteTarget({id: convId, title}), 300);
  }, []);

  const submitDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    const wasActive = conversationId === id;
    // 1. Close confirm modal
    setDeleteTarget(null);
    // 2. Optimistically remove from list
    setConversations(prev => prev.filter(c => c.id !== id));
    // 3. If deleting active chat, reset to new chat immediately
    if (wasActive) {
      setConversationId(undefined);
      setConversationTitle('AI Bot Builder');
      setMessages(INITIAL_MESSAGES);
    }
    // 4. Call API — then refresh list from server to guarantee sync
    try {
      await aiApi.deleteConversation(id);
      // Refresh from server after confirmed delete
      const fresh = await aiApi.listConversations();
      setConversations(Array.isArray(fresh) ? fresh : []);
    } catch (err: any) {
      console.error('[Chat] Delete conversation failed:', err?.message ?? err);
      // Restore to pre-delete state from server
      const restored = await aiApi.listConversations().catch(() => null);
      if (restored) setConversations(Array.isArray(restored) ? restored : []);
      // Re-add the deleted item if restore failed (keep optimistic state correct)
      Alert.alert('Delete Failed', 'Could not delete conversation. Please try again.');
    }
    // 5. Re-open conversations sheet if it was a non-active chat
    if (!wasActive) {
      setTimeout(() => setShowConversations(true), 150);
    }
  }, [deleteTarget, conversationId]);

  const openRenameModal = useCallback((id: string, current: string) => {
    setShowConversations(false);
    setRenameTarget({id, current});
    setRenameInput(current);
    setTimeout(() => setShowRenameModal(true), 300);
  }, []);

  const submitRename = useCallback(async () => {
    if (!renameTarget || !renameInput.trim()) return;
    const newTitle = renameInput.trim();
    const targetId = renameTarget.id;
    setShowRenameModal(false);
    setRenameTarget(null);
    try {
      await aiApi.renameConversation(targetId, newTitle);
      setConversations(prev => prev.map(c => c.id === targetId ? {...c, title: newTitle} : c));
      if (conversationId === targetId) setConversationTitle(newTitle);
      // Re-open conversations sheet to show the updated title
      setTimeout(() => setShowConversations(true), 300);
    } catch {
      Alert.alert('Error', 'Could not rename conversation.');
    }
  }, [renameTarget, renameInput, conversationId]);

  // Simulated stage animation — cycles through stages while YouTube request is in-flight
  const animateStages = useCallback((stages: string[], intervalMs = 1800): (() => void) => {
    let i = 0;
    setStageText(stages[0]);
    const timer = setInterval(() => {
      i = Math.min(i + 1, stages.length - 1);
      setStageText(stages[i]);
    }, intervalMs);
    return () => clearInterval(timer);
  }, []);

  const sendMessage = useCallback(async () => {
    if (!inputText.trim() || isUploading) return;
    const text = inputText.trim();
    const imgUri = attachedImage;
    const userMsg: Message = {id: Date.now().toString(), role: 'user', text, imageUri: imgUri || undefined};
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);
    setStageText('');

    // Clear attachment immediately
    const preUploadedUrl = uploadedUrl;
    setAttachedImage(null);
    setAttachedImageName('');
    setUploadedUrl(null);

    // YouTube URLs — show staged animation while the backend processes
    const hasYouTubeUrl = /(?:youtube\.com\/watch\?v=|youtu\.be\/)[a-zA-Z0-9_-]{11}/.test(text);
    let stopYoutubeAnimation: (() => void) | null = null;
    if (hasYouTubeUrl) {
      stopYoutubeAnimation = animateStages([
        'Fetching video info...',
        'Getting transcript...',
        'Analyzing with AI...',
        'Storing knowledge...',
      ]);
    }

    // Image uploads use the non-streaming path (multipart)
    if (imgUri) {
      try {
        let response: Awaited<ReturnType<typeof aiApi.chat>>;
        if (preUploadedUrl) {
          response = await aiApi.chat(text, conversationId, preUploadedUrl, botId);
        } else {
          response = await aiApi.chatWithImage(text, imgUri, conversationId, () => {});
        }
        setConversationId(response.conversationId);
        const cleanReply = response.reply.replace(/```strategy-json[\s\S]*?```/g, '').trim();
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'ai',
          text: cleanReply,
          cleanPrompt: response.cleanPrompt,
          hasStrategyCard: !!response.strategy,
          strategyData: response.strategy,
        }]);
      } catch (e: any) {
        setMessages(prev => [...prev, {id: (Date.now() + 1).toString(), role: 'ai', text: e?.message || 'Sorry, I encountered an error.'}]);
      } finally {
        setIsTyping(false);
        setStageText('');
      }
      return;
    }

    // Streaming path — insert placeholder bubble, fill it as tokens arrive
    const streamMsgId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, {id: streamMsgId, role: 'ai', text: ''}]);

    try {
      let accumulated = '';
      let firstToken = true;
      // Batch token renders: flush at most every 30ms so we don't re-render on every word
      let flushTimer: ReturnType<typeof setTimeout> | null = null;
      let pendingFlush = false;

      const flushToUI = () => {
        flushTimer = null;
        pendingFlush = false;
        const display = accumulated.replace(/```strategy-json[\s\S]*?```/g, '').trim();
        setMessages(prev => prev.map(m => m.id === streamMsgId ? {...m, text: display} : m));
      };

      const scheduleFlush = () => {
        if (pendingFlush) return; // already scheduled
        pendingFlush = true;
        flushTimer = setTimeout(flushToUI, 30);
      };

      await aiApi.chatStream(
        text,
        conversationId,
        // onToken — batch updates so React renders every ~30ms not every word
        (token) => {
          if (firstToken) {
            firstToken = false;
            setIsTyping(false);
            stopYoutubeAnimation?.();
            setStageText('');
          }
          accumulated += token;
          scheduleFlush();
          shouldScrollToEnd.current = true;
        },
        // onTool — show which tool is running in the stage label
        (toolName) => {
          setStageText(toolName.replace(/_/g, ' '));
        },
        // onDone — flush immediately then finalize with strategy card
        (meta) => {
          if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
          setConversationId(meta.conversationId);
          stopYoutubeAnimation?.();
          setStageText('');
          const finalDisplay = accumulated.replace(/```strategy-json[\s\S]*?```/g, '').trim();
          setMessages(prev => prev.map(m =>
            m.id === streamMsgId ? {
              ...m,
              text: finalDisplay,
              cleanPrompt: meta.cleanPrompt,
              hasStrategyCard: !!meta.strategyPreview,
              strategyData: meta.strategyPreview as any,
            } : m,
          ));
        },
        undefined,
        botId,
      );
      // Final flush in case last tokens haven't rendered yet
      if (flushTimer) { clearTimeout(flushTimer); flushToUI(); }
    } catch (e: any) {
      stopYoutubeAnimation?.();
      const errText = e?.message || 'Sorry, I encountered an error. Please try again.';
      setMessages(prev => prev.map(m => m.id === streamMsgId ? {...m, text: errText} : m));
    } finally {
      stopYoutubeAnimation?.();
      setIsTyping(false);
      setStageText('');
    }
  }, [inputText, conversationId, attachedImage, isUploading, botId, animateStages]);

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
          <View style={[styles.userBubble, item.imageUri && {paddingTop: 8}]}>
            {item.imageUri && (
              <Image
                source={{uri: item.imageUri.startsWith('/') ? `${API_BASE_URL}${item.imageUri}` : item.imageUri}}
                style={styles.chatImage}
                resizeMode="cover"
                defaultSource={undefined}
              />
            )}
            <Text style={styles.userText}>{item.text}</Text>
          </View>
        </View>
      );
    }

    // Don't render empty streaming placeholder — let the typing indicator handle that moment
    if (!item.text && item.role === 'ai') return null;

    return (
      <View style={styles.aiRow}>
        <AiBotAvatar size={34} />
        <View style={styles.aiContent}>
          <Text style={styles.aiNameLabel}>{botName}</Text>
          <View style={styles.aiBubble}>
            <MarkdownText text={item.text} baseStyle={styles.aiText} />
            {item.hasStrategyCard && (
              <View style={styles.strategyCard}>
                <View style={styles.strategyTopRow}>
                  <View style={{flex: 1, marginRight: 8}}>
                    <Text style={styles.strategyName}>{item.strategyData?.name || 'Strategy'}</Text>
                    <Text style={styles.strategySubLabel}>
                      {(item.strategyData as any)?.assetClass === 'stocks' ? '📈 STOCKS STRATEGY' : '₿ CRYPTO STRATEGY'}
                    </Text>
                  </View>
                  <View style={styles.backtestBadge}>
                    <Text style={styles.backtestText}>
                      {item.strategyData?.backtestReturn != null ? `+${item.strategyData.backtestReturn.toFixed(1)}%` : '--'}{'\n'}BACKTEST
                    </Text>
                  </View>
                </View>
                {/* Mini stats row */}
                <View style={{flexDirection: 'row', gap: 8, marginBottom: 6}}>
                  {(item.strategyData as any)?.backtestWinRate != null && (
                    <View style={styles.miniStat}>
                      <Text style={styles.miniStatVal}>{(item.strategyData as any).backtestWinRate.toFixed(0)}%</Text>
                      <Text style={styles.miniStatLabel}>WIN RATE</Text>
                    </View>
                  )}
                  {(item.strategyData as any)?.backtestDrawdown != null && (
                    <View style={styles.miniStat}>
                      <Text style={[styles.miniStatVal, {color: '#EF4444'}]}>{(item.strategyData as any).backtestDrawdown.toFixed(0)}%</Text>
                      <Text style={styles.miniStatLabel}>DRAWDOWN</Text>
                    </View>
                  )}
                  {item.strategyData?.riskLevel && (
                    <View style={styles.miniStat}>
                      <Text style={styles.miniStatVal}>{item.strategyData.riskLevel}</Text>
                      <Text style={styles.miniStatLabel}>RISK</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.perfLabel}>30D PERFORMANCE</Text>
                <StrategyBarChart chartWidth={strategyCardWidth} backtestReturn={item.strategyData?.backtestReturn} />
                <TouchableOpacity
                  style={styles.deployBtn}
                  onPress={() => navigation.navigate('BotBuilder', {
                    fromChat: true,
                    strategyName: item.strategyData?.name || 'Custom Strategy',
                    strategyData: {
                      name: item.strategyData?.name,
                      strategy: item.strategyData?.strategy,
                      assetClass: item.strategyData?.assetClass,
                      pairs: item.strategyData?.pairs,
                      riskLevel: item.strategyData?.riskLevel,
                      stopLoss: item.strategyData?.stopLoss,
                      takeProfit: item.strategyData?.takeProfit,
                      prompt: (item.cleanPrompt || item.text).slice(0, 4500),
                      tradingFrequency: item.strategyData?.tradingFrequency,
                      aiMode: item.strategyData?.aiMode,
                      maxOpenPositions: item.strategyData?.maxOpenPositions,
                      tradingSchedule: item.strategyData?.tradingSchedule,
                    },
                  })}
                  activeOpacity={0.8}>
                  <Text style={styles.deployBtnText}>Deploy as Bot</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  }, [strategyCardWidth, navigation, botName]);

  return (
    <Animated.View style={[styles.container, {paddingBottom: keyboardHeight}]}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => { loadConversations(); setShowConversations(true); }}>
          <HistoryIcon />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerCenter}
          onPress={() => conversationId && openRenameModal(conversationId, conversationTitle)}
          activeOpacity={conversationId ? 0.6 : 1}>
          <Text style={styles.headerTitle} numberOfLines={1}>{conversationTitle}</Text>
          <View style={styles.activePill}>
            <View style={styles.activeDot} />
            <Text style={styles.activeText}>{conversationId ? 'TAP TO RENAME' : 'ACTIVE SESSION'}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerBtn} onPress={() => setShowDotsMenu(true)}>
          <DotsMenu />
        </TouchableOpacity>
      </View>

      {/* Messages — flex:1 pushes bottom bar down */}
      {historyLoading ? (
        <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={{fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 10}}>Loading conversation...</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={[...messages].reverse()}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          renderItem={renderMessage}
          style={styles.messageList}
          inverted
        />
      )}

      {isTyping && (
        <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 8}}>
          <AiBotAvatar size={24} />
          <View style={{flex: 1}}>
            <Text style={{fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.4)'}}>
              {stageText || 'AI is thinking...'}
            </Text>
            {!!stageText && (
              <View style={{flexDirection: 'row', gap: 4, marginTop: 4}}>
                {[0, 1, 2].map(i => (
                  <View key={i} style={{width: 5, height: 5, borderRadius: 3, backgroundColor: '#10B981', opacity: 0.6 + i * 0.2}} />
                ))}
              </View>
            )}
          </View>
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

        {/* Attachment preview + upload progress */}
        {attachedImage && (
          <View style={styles.attachmentPreview}>
            <Image source={{uri: attachedImage}} style={styles.attachmentThumb} />
            <View style={{flex: 1}}>
              <Text style={styles.attachmentName} numberOfLines={1}>{attachedImageName}</Text>
              {isUploading && (
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, {width: `${uploadProgress}%`}]} />
                </View>
              )}
            </View>
            {!isUploading && (
              <TouchableOpacity onPress={() => { setAttachedImage(null); setAttachedImageName(''); }}>
                <Text style={{color: '#EF4444', fontSize: 16, fontWeight: 'bold'}}>✕</Text>
              </TouchableOpacity>
            )}
            {isUploading && (
              <Text style={{color: '#10B981', fontFamily: 'Inter-Medium', fontSize: 11}}>{uploadProgress}%</Text>
            )}
          </View>
        )}

        {/* Input bar */}
        <View style={styles.inputBar}>
          <TouchableOpacity style={styles.attachBtn} onPress={handleImageAttach}>
            <ImageAttachIcon />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            placeholder="Type a message..."
            placeholderTextColor="rgba(255,255,255,0.25)"
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={8000}
            returnKeyType="send"
            onSubmitEditing={sendMessage}
          />
          <TouchableOpacity
            style={[styles.sendBtn, isUploading && {opacity: 0.3}]}
            onPress={sendMessage}
            activeOpacity={0.85}
            disabled={isUploading}>
            {isUploading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <SendArrow />
            )}
          </TouchableOpacity>
        </View>
      </View>
      {/* Rename Modal */}
      <Modal visible={showRenameModal} animationType="fade" transparent onRequestClose={() => setShowRenameModal(false)}>
        <View style={renameStyles.overlay}>
          <View style={renameStyles.dialog}>
            <Text style={renameStyles.dialogTitle}>Rename Chat</Text>
            <TextInput
              style={renameStyles.input}
              value={renameInput}
              onChangeText={setRenameInput}
              placeholder="Enter chat name..."
              placeholderTextColor="rgba(255,255,255,0.25)"
              autoFocus
              maxLength={120}
              returnKeyType="done"
              onSubmitEditing={submitRename}
            />
            <View style={renameStyles.btnRow}>
              <TouchableOpacity style={renameStyles.cancelBtn} onPress={() => setShowRenameModal(false)}>
                <Text style={renameStyles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={renameStyles.saveBtn} onPress={submitRename}>
                <Text style={renameStyles.saveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal visible={!!deleteTarget} animationType="fade" transparent onRequestClose={() => setDeleteTarget(null)}>
        <View style={renameStyles.overlay}>
          <View style={renameStyles.dialog}>
            <View style={{alignItems: 'center', marginBottom: 16}}>
              <View style={{width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(239,68,68,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 12}}>
                <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                  <Path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="#EF4444" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
                  <Path d="M10 11v6M14 11v6" stroke="#EF4444" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
                </Svg>
              </View>
              <Text style={renameStyles.dialogTitle}>Delete Chat</Text>
              <Text style={{fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.45)', textAlign: 'center', lineHeight: 20}}>
                {`"${deleteTarget?.title}"\n\nThis will permanently delete all messages. This cannot be undone.`}
              </Text>
            </View>
            <View style={renameStyles.btnRow}>
              <TouchableOpacity style={renameStyles.cancelBtn} onPress={() => setDeleteTarget(null)}>
                <Text style={renameStyles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[renameStyles.saveBtn, {backgroundColor: '#EF4444'}]}
                onPress={submitDelete}>
                <Text style={renameStyles.saveText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Dots Menu Modal */}
      <Modal visible={showDotsMenu} animationType="fade" transparent onRequestClose={() => setShowDotsMenu(false)}>
        <TouchableOpacity style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.5)'}} activeOpacity={1} onPress={() => setShowDotsMenu(false)}>
          <View style={{position: 'absolute', top: 100, right: 16, backgroundColor: '#161D2A', borderRadius: 14, minWidth: 200, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)'}}>
            <TouchableOpacity
              style={{paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)'}}
              onPress={() => {
                setShowDotsMenu(false);
                setBotNameInput(botName === 'TradingBot AI' ? '' : botName);
                setTimeout(() => setShowBotNameModal(true), 250);
              }}>
              <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF'}}>Name your bot</Text>
              <Text style={{fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2}}>Currently: {botName}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{paddingHorizontal: 18, paddingVertical: 14}}
              onPress={() => { setShowDotsMenu(false); handleNewConversation(); }}>
              <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF'}}>New Chat</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Bot Name Modal */}
      <Modal visible={showBotNameModal} animationType="fade" transparent onRequestClose={() => setShowBotNameModal(false)}>
        <View style={renameStyles.overlay}>
          <View style={renameStyles.dialog}>
            <Text style={renameStyles.dialogTitle}>Name Your Bot</Text>
            <Text style={{fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 14, lineHeight: 18}}>
              Give your AI trading assistant a unique name. This applies to all your chats.
            </Text>
            <TextInput
              style={renameStyles.input}
              value={botNameInput}
              onChangeText={setBotNameInput}
              placeholder="e.g. Alpha, Titan, TradeBot..."
              placeholderTextColor="rgba(255,255,255,0.25)"
              autoFocus
              maxLength={50}
              returnKeyType="done"
              onSubmitEditing={async () => {
                const name = botNameInput.trim() || 'TradingBot AI';
                setShowBotNameModal(false);
                try {
                  const saved = await aiApi.setBotName(botNameInput.trim());
                  setBotNameState(saved || 'TradingBot AI');
                } catch {
                  Alert.alert('Error', 'Could not save bot name.');
                }
              }}
            />
            <View style={renameStyles.btnRow}>
              <TouchableOpacity style={renameStyles.cancelBtn} onPress={() => setShowBotNameModal(false)}>
                <Text style={renameStyles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={renameStyles.saveBtn}
                onPress={async () => {
                  setShowBotNameModal(false);
                  try {
                    const saved = await aiApi.setBotName(botNameInput.trim());
                    setBotNameState(saved || 'TradingBot AI');
                  } catch {
                    Alert.alert('Error', 'Could not save bot name.');
                  }
                }}>
                <Text style={renameStyles.saveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Conversations Modal */}
      <Modal visible={showConversations} animationType="slide" transparent onRequestClose={() => setShowConversations(false)}>
        <View style={convStyles.overlay}>
          <View style={convStyles.sheet}>
            <View style={convStyles.sheetHandle} />
            <View style={convStyles.sheetHeader}>
              <Text style={convStyles.sheetTitle}>Conversations</Text>
              <TouchableOpacity onPress={() => setShowConversations(false)}>
                <Text style={{color: 'rgba(255,255,255,0.5)', fontSize: 20}}>✕</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={convStyles.newChatBtn} onPress={handleNewConversation}>
              <Text style={convStyles.newChatText}>+ New Chat</Text>
            </TouchableOpacity>
            {convsLoading ? (
              <ActivityIndicator color="#10B981" style={{marginTop: 30}} />
            ) : (
              <FlatList
                data={conversations}
                keyExtractor={item => item.id}
                contentContainerStyle={{paddingBottom: 30}}
                renderItem={({item}) => (
                  <TouchableOpacity
                    style={[convStyles.convItem, item.id === conversationId && convStyles.convItemActive]}
                    onPress={() => handleSelectConversation(item.id, item.title)}
                    activeOpacity={0.7}>
                    <View style={convStyles.convRow}>
                      <View style={{flex: 1}}>
                        <Text style={convStyles.convTitle} numberOfLines={1}>{item.title}</Text>
                        <Text style={convStyles.convMeta}>{item.messageCount} messages · {formatConvDate(item.lastMessageAt)}</Text>
                      </View>
                      <View style={convStyles.convActions}>
                        <TouchableOpacity
                          style={convStyles.convActionBtn}
                          onPress={() => openRenameModal(item.id, item.title)}
                          hitSlop={{top: 8, bottom: 8, left: 8, right: 4}}>
                          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                            <Path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="rgba(255,255,255,0.45)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
                            <Path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="rgba(255,255,255,0.45)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
                          </Svg>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={convStyles.convActionBtn}
                          onPress={() => confirmDeleteConversation(item.id, item.title)}
                          hitSlop={{top: 8, bottom: 8, left: 4, right: 8}}>
                          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                            <Path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="#EF4444" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
                            <Path d="M10 11v6M14 11v6" stroke="#EF4444" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
                          </Svg>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={{color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 40, fontSize: 14}}>No conversations yet</Text>
                }
              />
            )}
          </View>
        </View>
      </Modal>
    </Animated.View>
  );
}

// ─── Conversation Styles ────────────────────────────────────────────────────────

const convStyles = StyleSheet.create({
  overlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end'},
  sheet: {backgroundColor: '#0F1117', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '75%', minHeight: '40%'},
  sheetHandle: {width: 40, height: 4, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 2, alignSelf: 'center', marginTop: 12},
  sheetHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)'},
  sheetTitle: {fontFamily: 'Inter-Bold', fontSize: 20, color: '#FFFFFF'},
  newChatBtn: {marginHorizontal: 16, marginVertical: 12, backgroundColor: '#10B981', borderRadius: 12, paddingVertical: 12, alignItems: 'center'},
  newChatText: {fontFamily: 'Inter-Bold', fontSize: 14, color: '#FFFFFF'},
  convItem: {paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)'},
  convItemActive: {backgroundColor: 'rgba(16,185,129,0.08)', borderLeftWidth: 3, borderLeftColor: '#10B981'},
  convRow: {flexDirection: 'row', alignItems: 'center'},
  convTitle: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF', marginBottom: 3},
  convMeta: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.3)'},
  convActions: {flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 8},
  convActionBtn: {width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)'},
});

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0A0E14'},
  messageList: {flex: 1},
  bottomBar: {backgroundColor: '#0A0E14', paddingBottom: 12},

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
  messagesList: {paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20},

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
    maxWidth: '80%', alignSelf: 'flex-end', overflow: 'hidden',
  },
  userText: {fontFamily: 'Inter-Regular', fontSize: 14, color: '#FFFFFF', lineHeight: 21},
  chatImage: {
    width: 200, height: 150, borderRadius: 10, marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },

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
  miniStat: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8,
    paddingVertical: 6, alignItems: 'center',
  },
  miniStatVal: {fontFamily: 'Inter-Bold', fontSize: 13, color: '#10B981'},
  miniStatLabel: {fontFamily: 'Inter-Regular', fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 2},

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

  // Attachment preview
  attachmentPreview: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
  },
  attachmentThumb: {
    width: 40, height: 40, borderRadius: 8,
  },
  attachmentName: {
    fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.5)',
  },
  progressBarBg: {
    height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', marginTop: 6, overflow: 'hidden',
  },
  progressBarFill: {
    height: 3, borderRadius: 2, backgroundColor: '#10B981',
  },

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
