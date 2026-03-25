import React, {useState, useCallback, useRef, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  FlatList,
  Modal,
  ActivityIndicator,
  Keyboard,
  Animated,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../types';
import {useToast} from '../../context/ToastContext';
import {userApi, SupportTicket, TicketMessage} from '../../services/user';
import Svg, {Path, Circle, Rect} from 'react-native-svg';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type ActiveView = 'home' | 'tickets' | 'ticketDetail';
type TicketType = 'support' | 'bug_report' | 'feature_request';

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

function SearchIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Circle
        cx={11}
        cy={11}
        r={7}
        stroke="rgba(255,255,255,0.4)"
        strokeWidth={1.5}
      />
      <Path
        d="M21 21l-4.35-4.35"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function ChevronDown({rotated}: {rotated?: boolean}) {
  return (
    <Svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      style={rotated ? {transform: [{rotate: '180deg'}]} : undefined}>
      <Path
        d="M6 9l6 6 6-6"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function HeadsetIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 18v-6a9 9 0 0118 0v6"
        stroke="#10B981"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <Path
        d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3v5zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3v5z"
        stroke="#10B981"
        strokeWidth={1.5}
      />
    </Svg>
  );
}

function BugIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path
        d="M8 2l1.88 1.88M14.12 3.88L16 2M9 7.13v-1a3 3 0 116 0v1"
        stroke="#F59E0B"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <Path
        d="M12 20a6 6 0 006-6v-2a6 6 0 00-12 0v2a6 6 0 006 6z"
        stroke="#F59E0B"
        strokeWidth={1.5}
      />
      <Path
        d="M12 12v8M4 14h2M18 14h2M4 10h2M18 10h2"
        stroke="#F59E0B"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function TicketIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Rect
        x={2}
        y={4}
        width={20}
        height={16}
        rx={3}
        stroke="#8B5CF6"
        strokeWidth={1.5}
      />
      <Path
        d="M7 9h10M7 13h6"
        stroke="#8B5CF6"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function SendIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"
        stroke="#FFFFFF"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function CloseIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 6L6 18M6 6l12 12"
        stroke="#FFFFFF"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// ─── FAQ Data ───────────────────────────────────────────────────────────────────

interface FAQItem {
  question: string;
  answer: string;
}

const FAQ_ITEMS: FAQItem[] = [
  {
    question: 'How do I connect my exchange?',
    answer:
      'Go to Settings > Connected Exchanges and tap "Add Exchange". You can connect via OAuth for supported exchanges (Coinbase, Binance) or enter your API key and secret. We only request read and trade permissions \u2014 never withdrawal access.',
  },
  {
    question: 'What is Shadow Mode?',
    answer:
      'Shadow Mode lets you test a trading bot with simulated funds before committing real capital. The bot runs its strategy in real-time market conditions but uses paper money. After the trial period, you can review performance and decide whether to go live.',
  },
  {
    question: 'How are bot profits calculated?',
    answer:
      'Bot profits are calculated based on the net realized and unrealized P&L of all trades executed by the bot. This includes fees, slippage, and any stop-loss or take-profit executions. Returns are shown as a percentage of your allocated capital.',
  },
  {
    question: 'How do I cancel my subscription?',
    answer:
      'Go to Settings > Manage Subscription and tap "Cancel Subscription". Your Pro benefits will remain active until the end of your current billing period. You can resubscribe at any time without losing your data.',
  },
  {
    question: 'Is my data secure?',
    answer:
      'Yes. We use bank-grade AES-256 encryption for all sensitive data, including API keys. Your exchange credentials are encrypted at rest and in transit. We never store withdrawal permissions and all connections use read-only and trade-only access.',
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, {bg: string; text: string}> = {
  open: {bg: 'rgba(59,130,246,0.15)', text: '#3B82F6'},
  in_progress: {bg: 'rgba(245,158,11,0.15)', text: '#F59E0B'},
  resolved: {bg: 'rgba(16,185,129,0.15)', text: '#10B981'},
  closed: {bg: 'rgba(255,255,255,0.08)', text: 'rgba(255,255,255,0.4)'},
};

const TYPE_LABELS: Record<string, string> = {
  support: 'Support',
  bug_report: 'Bug Report',
  feature_request: 'Feature Request',
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
}

function formatTimestamp(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// ─── Screen ─────────────────────────────────────────────────────────────────────

export default function HelpSupportScreen() {
  const navigation = useNavigation<Nav>();
  const {alert: showAlert} = useToast();

  // View state
  const [activeView, setActiveView] = useState<ActiveView>('home');
  const [searchText, setSearchText] = useState('');
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  // Modal
  const [modalVisible, setModalVisible] = useState(false);
  const [newTicketType, setNewTicketType] = useState<TicketType>('support');
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Tickets list
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Ticket detail
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const messagesListRef = useRef<FlatList>(null);
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

  // ─── Data Fetching ──────────────────────────────────────────────────────────

  const loadTickets = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setTicketsLoading(true);
    try {
      const res = await userApi.getMyTickets(1, 50);
      setTickets(res.data ?? []);
    } catch (err: any) {
      showAlert('Error', err.message || 'Failed to load tickets');
    } finally {
      setTicketsLoading(false);
      setRefreshing(false);
    }
  }, [showAlert]);

  const loadMessages = useCallback(async (ticketId: string) => {
    setMessagesLoading(true);
    try {
      const res = await userApi.getTicketMessages(ticketId);
      // Backend returns { ticket, messages } — extract and map fields
      const raw = (res as any)?.messages ?? (res as any)?.data?.messages ?? res.data ?? [];
      const mapped: TicketMessage[] = (Array.isArray(raw) ? raw : []).map((m: any) => ({
        id: m.id,
        ticketId: m.ticketId,
        senderId: m.userId,
        senderName: m.userName || (m.isAdmin ? 'Admin' : 'You'),
        senderRole: m.isAdmin ? 'admin' : 'user',
        content: m.content,
        createdAt: m.createdAt,
      }));
      setMessages(mapped);
    } catch (err: any) {
      showAlert('Error', err.message || 'Failed to load messages');
    } finally {
      setMessagesLoading(false);
    }
  }, [showAlert]);

  // ─── Actions ────────────────────────────────────────────────────────────────

  const handleOpenModal = (type: TicketType) => {
    setNewTicketType(type);
    setNewTitle('');
    setNewDescription('');
    setModalVisible(true);
  };

  const handleSubmitTicket = async () => {
    if (!newTitle.trim()) {
      showAlert('Required', 'Please enter a title.');
      return;
    }
    if (!newDescription.trim()) {
      showAlert('Required', 'Please enter a description.');
      return;
    }
    setSubmitting(true);
    try {
      await userApi.createTicket(newTicketType, newTitle.trim(), newDescription.trim());
      setModalVisible(false);
      showAlert('Ticket Created', 'Our team will respond within 24 hours.');
      // If already viewing tickets, refresh
      if (activeView === 'tickets') {
        loadTickets();
      }
    } catch (err: any) {
      showAlert('Error', err.message || 'Failed to create ticket');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenTickets = () => {
    setActiveView('tickets');
    loadTickets();
  };

  const handleOpenTicketDetail = (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setActiveView('ticketDetail');
    setReplyText('');
    loadMessages(ticket.id);
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedTicket) return;
    setReplying(true);
    try {
      const raw = await userApi.replyToTicket(selectedTicket.id, replyText.trim());
      const newMsg: TicketMessage = {
        id: raw.id ?? Date.now().toString(),
        ticketId: selectedTicket.id,
        senderId: raw.userId ?? '',
        senderName: raw.userName || 'You',
        senderRole: raw.isAdmin ? 'admin' : 'user',
        content: raw.content ?? replyText.trim(),
        createdAt: raw.createdAt ?? new Date().toISOString(),
      };
      setMessages(prev => [...prev, newMsg]);
      setReplyText('');
      setTimeout(() => {
        messagesListRef.current?.scrollToEnd({animated: true});
      }, 100);
    } catch (err: any) {
      showAlert('Error', err.message || 'Failed to send reply');
    } finally {
      setReplying(false);
    }
  };

  const handleBack = () => {
    if (activeView === 'ticketDetail') {
      setActiveView('tickets');
      setSelectedTicket(null);
      setMessages([]);
      loadTickets();
    } else if (activeView === 'tickets') {
      setActiveView('home');
    } else {
      navigation.goBack();
    }
  };

  // ─── FAQ ────────────────────────────────────────────────────────────────────

  const toggleExpand = (index: number) => {
    setExpandedIndex(prev => (prev === index ? null : index));
  };

  const filteredFAQ = searchText.trim()
    ? FAQ_ITEMS.filter(
        item =>
          item.question.toLowerCase().includes(searchText.toLowerCase()) ||
          item.answer.toLowerCase().includes(searchText.toLowerCase()),
      )
    : FAQ_ITEMS;

  // ─── Header ─────────────────────────────────────────────────────────────────

  const headerTitle =
    activeView === 'ticketDetail' && selectedTicket
      ? 'Ticket Detail'
      : activeView === 'tickets'
      ? 'My Tickets'
      : 'Help & Support';

  // ─── Render: Ticket Detail ──────────────────────────────────────────────────

  const renderTicketDetail = () => {
    if (!selectedTicket) return null;

    const statusStyle = STATUS_COLORS[selectedTicket.status] ?? STATUS_COLORS.open;
    const isClosed = selectedTicket.status === 'closed';
    const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
    const awaitingAdmin = lastMessage?.senderRole === 'user' && !isClosed;

    return (
      <Animated.View style={{flex: 1, paddingBottom: keyboardHeight}}>
        {/* Ticket header info */}
        <View style={styles.ticketDetailHeader}>
          <Text style={styles.ticketDetailTitle} numberOfLines={2}>
            {selectedTicket.title}
          </Text>
          <View style={styles.ticketDetailMeta}>
            <View style={[styles.statusBadge, {backgroundColor: statusStyle.bg}]}>
              <Text style={[styles.statusBadgeText, {color: statusStyle.text}]}>
                {selectedTicket.status.replace('_', ' ').toUpperCase()}
              </Text>
            </View>
            <Text style={styles.ticketDetailDate}>
              {formatDate(selectedTicket.createdAt)}
            </Text>
          </View>
          {selectedTicket.description ? (
            <Text style={styles.ticketDetailDesc}>{selectedTicket.description}</Text>
          ) : null}
        </View>

        {/* Awaiting admin indicator */}
        {awaitingAdmin && (
          <View style={styles.awaitingBanner}>
            <Text style={styles.awaitingText}>Awaiting admin response</Text>
          </View>
        )}

        {/* Messages */}
        {messagesLoading ? (
          <View style={styles.centerLoader}>
            <ActivityIndicator color="#10B981" size="large" />
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.centerLoader}>
            <Text style={styles.emptyText}>No messages yet</Text>
          </View>
        ) : (
          <FlatList
            ref={messagesListRef}
            data={messages}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() =>
              messagesListRef.current?.scrollToEnd({animated: false})
            }
            renderItem={({item}) => {
              const isAdmin = item.senderRole === 'admin';
              return (
                <View
                  style={[
                    styles.messageBubbleWrap,
                    isAdmin ? styles.messageBubbleWrapRight : styles.messageBubbleWrapLeft,
                  ]}>
                  <View
                    style={[
                      styles.messageBubble,
                      isAdmin ? styles.adminBubble : styles.userBubble,
                    ]}>
                    <Text style={styles.messageSender}>
                      {item.senderName}
                      {isAdmin ? ' (Admin)' : ''}
                    </Text>
                    <Text style={styles.messageContent}>{item.content}</Text>
                    <Text style={styles.messageTime}>
                      {formatTimestamp(item.createdAt)}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
        )}

        {/* Reply input */}
        {!isClosed && (
          <View style={styles.replyBar}>
            <TextInput
              style={styles.replyInput}
              placeholder="Type a reply..."
              placeholderTextColor="rgba(255,255,255,0.25)"
              value={replyText}
              onChangeText={setReplyText}
              multiline
              maxLength={2000}
            />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                (!replyText.trim() || replying) && styles.sendBtnDisabled,
              ]}
              disabled={!replyText.trim() || replying}
              onPress={handleSendReply}>
              {replying ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <SendIcon />
              )}
            </TouchableOpacity>
          </View>
        )}

        {isClosed && (
          <View style={styles.closedBanner}>
            <Text style={styles.closedBannerText}>This ticket is closed</Text>
          </View>
        )}
      </Animated.View>
    );
  };

  // ─── Render: Tickets List ───────────────────────────────────────────────────

  const renderTicketsList = () => {
    if (ticketsLoading && !refreshing) {
      return (
        <View style={styles.centerLoader}>
          <ActivityIndicator color="#10B981" size="large" />
        </View>
      );
    }

    if (tickets.length === 0) {
      return (
        <View style={styles.centerLoader}>
          <Text style={styles.emptyText}>No tickets yet</Text>
          <Text style={styles.emptySubText}>
            Create a support ticket to get help from our team.
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        data={tickets}
        keyExtractor={item => item.id}
        contentContainerStyle={{paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40}}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadTickets(true)}
            tintColor="#10B981"
            colors={['#10B981']}
          />
        }
        renderItem={({item}) => {
          const statusStyle = STATUS_COLORS[item.status] ?? STATUS_COLORS.open;
          return (
            <TouchableOpacity
              style={styles.ticketCard}
              activeOpacity={0.7}
              onPress={() => handleOpenTicketDetail(item)}>
              <View style={styles.ticketCardTop}>
                <View style={styles.ticketTypeIcon}>
                  {item.type === 'bug_report' ? (
                    <BugIcon />
                  ) : item.type === 'feature_request' ? (
                    <TicketIcon />
                  ) : (
                    <HeadsetIcon />
                  )}
                </View>
                <View style={{flex: 1, marginLeft: 12}}>
                  <Text style={styles.ticketCardTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.ticketCardType}>
                    {TYPE_LABELS[item.type] ?? item.type}
                  </Text>
                </View>
                <View style={[styles.statusBadge, {backgroundColor: statusStyle.bg}]}>
                  <Text style={[styles.statusBadgeText, {color: statusStyle.text}]}>
                    {item.status.replace('_', ' ').toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text style={styles.ticketCardDate}>{formatDate(item.createdAt)}</Text>
            </TouchableOpacity>
          );
        }}
      />
    );
  };

  // ─── Render: Home ───────────────────────────────────────────────────────────

  const renderHome = () => (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}>
      {/* Action Cards */}
      <View style={styles.actionCardsRow}>
        <TouchableOpacity
          style={styles.actionCard}
          activeOpacity={0.7}
          onPress={() => handleOpenModal('support')}>
          <HeadsetIcon />
          <Text style={styles.actionCardLabel}>Contact{'\n'}Support</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          activeOpacity={0.7}
          onPress={() => handleOpenModal('bug_report')}>
          <BugIcon />
          <Text style={styles.actionCardLabel}>Report{'\n'}Bug</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          activeOpacity={0.7}
          onPress={handleOpenTickets}>
          <TicketIcon />
          <Text style={styles.actionCardLabel}>My{'\n'}Tickets</Text>
        </TouchableOpacity>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <SearchIcon />
        <TextInput
          style={styles.searchInput}
          placeholder="Search for help..."
          placeholderTextColor="rgba(255,255,255,0.25)"
          value={searchText}
          onChangeText={setSearchText}
        />
      </View>

      {/* FAQ Section */}
      <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
      <View style={styles.faqCard}>
        {filteredFAQ.map((item, index) => {
          const isExpanded = expandedIndex === index;
          return (
            <View key={item.question}>
              <TouchableOpacity
                style={styles.faqRow}
                activeOpacity={0.7}
                onPress={() => toggleExpand(index)}>
                <Text style={styles.faqQuestion}>{item.question}</Text>
                <ChevronDown rotated={isExpanded} />
              </TouchableOpacity>
              {isExpanded && (
                <View style={styles.faqAnswerContainer}>
                  <Text style={styles.faqAnswer}>{item.answer}</Text>
                </View>
              )}
              {index < filteredFAQ.length - 1 && (
                <View style={styles.faqDivider} />
              )}
            </View>
          );
        })}
      </View>

      {/* App Info */}
      <View style={styles.appInfo}>
        <Text style={styles.appInfoVersion}>TradingApp v1.0.5</Text>
        <Text style={styles.appInfoSub}>Built for traders</Text>
      </View>

      <View style={{height: 40}} />
    </ScrollView>
  );

  // ─── New Ticket Modal ───────────────────────────────────────────────────────

  const renderModal = () => (
    <Modal
      visible={modalVisible}
      animationType="slide"
      transparent
      onRequestClose={() => setModalVisible(false)}>
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalContainer}>
          <View style={styles.modalContent}>
            {/* Modal header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Ticket</Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.modalCloseBtn}>
                <CloseIcon />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Type picker */}
              <Text style={styles.fieldLabel}>Type</Text>
              <View style={styles.typePicker}>
                {(['support', 'bug_report', 'feature_request'] as TicketType[]).map(type => {
                  const selected = newTicketType === type;
                  return (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.typeOption,
                        selected && styles.typeOptionSelected,
                      ]}
                      onPress={() => setNewTicketType(type)}>
                      <Text
                        style={[
                          styles.typeOptionText,
                          selected && styles.typeOptionTextSelected,
                        ]}>
                        {TYPE_LABELS[type]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Title */}
              <Text style={styles.fieldLabel}>Title</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Brief summary of your issue"
                placeholderTextColor="rgba(255,255,255,0.25)"
                value={newTitle}
                onChangeText={setNewTitle}
                maxLength={120}
              />

              {/* Description */}
              <Text style={styles.fieldLabel}>Description</Text>
              <TextInput
                style={[styles.modalInput, styles.modalTextarea]}
                placeholder="Describe your issue in detail..."
                placeholderTextColor="rgba(255,255,255,0.25)"
                value={newDescription}
                onChangeText={setNewDescription}
                multiline
                textAlignVertical="top"
                maxLength={2000}
              />

              {/* Submit */}
              <TouchableOpacity
                style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
                activeOpacity={0.85}
                disabled={submitting}
                onPress={handleSubmitTicket}>
                {submitting ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>Submit Ticket</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );

  // ─── Main Render ────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
          <BackArrow />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {headerTitle}
        </Text>
        <View style={{width: 36}} />
      </View>

      {activeView === 'home' && renderHome()}
      {activeView === 'tickets' && renderTicketsList()}
      {activeView === 'ticketDetail' && renderTicketDetail()}

      {renderModal()}
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1117',
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

  // Scroll
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },

  // Action cards
  actionCardsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  actionCard: {
    flex: 1,
    backgroundColor: '#161B22',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 20,
    alignItems: 'center',
    gap: 10,
  },
  actionCardLabel: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    lineHeight: 16,
  },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161B22',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 14,
    marginBottom: 24,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: '#FFFFFF',
    paddingVertical: 14,
  },

  // Section title
  sectionTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 12,
  },

  // FAQ Card
  faqCard: {
    backgroundColor: '#161B22',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
    marginBottom: 28,
  },
  faqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  faqQuestion: {
    flex: 1,
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: '#FFFFFF',
    marginRight: 12,
  },
  faqAnswerContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 0,
  },
  faqAnswer: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    lineHeight: 20,
  },
  faqDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 16,
  },

  // App info
  appInfo: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  appInfoVersion: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: 'rgba(255,255,255,0.3)',
    marginBottom: 4,
  },
  appInfoSub: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.2)',
  },

  // ─── Tickets List ───────────────────────────────────────────────────────────

  ticketCard: {
    backgroundColor: '#161B22',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 16,
    marginBottom: 10,
  },
  ticketCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ticketTypeIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ticketCardTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  ticketCardType: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 2,
  },
  ticketCardDate: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.25)',
    marginTop: 10,
  },

  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontFamily: 'Inter-Bold',
    fontSize: 10,
    letterSpacing: 0.5,
  },

  // ─── Ticket Detail ──────────────────────────────────────────────────────────

  ticketDetailHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  ticketDetailTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 8,
  },
  ticketDetailMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ticketDetailDate: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
  },
  ticketDetailDesc: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 10,
    lineHeight: 19,
  },

  awaitingBanner: {
    backgroundColor: 'rgba(245,158,11,0.1)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  awaitingText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: '#F59E0B',
  },

  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 8,
  },
  messageBubbleWrap: {
    marginBottom: 10,
  },
  messageBubbleWrapLeft: {
    alignItems: 'flex-start',
  },
  messageBubbleWrapRight: {
    alignItems: 'flex-end',
  },
  messageBubble: {
    maxWidth: '80%',
    borderRadius: 14,
    padding: 12,
  },
  userBubble: {
    backgroundColor: '#1E2330',
    borderBottomLeftRadius: 4,
  },
  adminBubble: {
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderBottomRightRadius: 4,
  },
  messageSender: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 4,
  },
  messageContent: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: '#FFFFFF',
    lineHeight: 20,
  },
  messageTime: {
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    color: 'rgba(255,255,255,0.25)',
    marginTop: 6,
    textAlign: 'right',
  },

  replyBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    backgroundColor: '#0F1117',
    gap: 8,
  },
  replyInput: {
    flex: 1,
    backgroundColor: '#161B22',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: '#FFFFFF',
    maxHeight: 100,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },

  closedBanner: {
    paddingVertical: 14,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  closedBannerText: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: 'rgba(255,255,255,0.3)',
  },

  // ─── Center loader / empty ──────────────────────────────────────────────────

  centerLoader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 6,
  },
  emptySubText: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    paddingHorizontal: 40,
  },

  // ─── Modal ──────────────────────────────────────────────────────────────────

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#161B22',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  modalTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: 18,
    color: '#FFFFFF',
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },

  fieldLabel: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 8,
    marginTop: 4,
  },

  typePicker: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  typeOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  typeOptionSelected: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16,185,129,0.1)',
  },
  typeOptionText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  typeOptionTextSelected: {
    color: '#10B981',
  },

  modalInput: {
    backgroundColor: '#0F1117',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 16,
  },
  modalTextarea: {
    minHeight: 120,
    textAlignVertical: 'top',
  },

  submitBtn: {
    backgroundColor: '#10B981',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    fontFamily: 'Inter-Bold',
    fontSize: 15,
    color: '#FFFFFF',
  },
});
