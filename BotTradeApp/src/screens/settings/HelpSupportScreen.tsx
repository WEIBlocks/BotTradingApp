import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../types';
import Svg, {Path, Circle, Rect, Line} from 'react-native-svg';

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

function MailIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Rect
        x={2}
        y={4}
        width={20}
        height={16}
        rx={3}
        stroke="rgba(255,255,255,0.4)"
        strokeWidth={1.5}
      />
      <Path
        d="M2 7l10 7 10-7"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
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
      'Go to Settings > Connected Exchanges and tap "Add Exchange". You can connect via OAuth for supported exchanges (Coinbase, Binance) or enter your API key and secret. We only request read and trade permissions — never withdrawal access.',
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

// ─── Screen ─────────────────────────────────────────────────────────────────────

export default function HelpSupportScreen() {
  const navigation = useNavigation<Nav>();
  const [searchText, setSearchText] = useState('');
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

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

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}>
          <BackArrow />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Help & Support</Text>
        <View style={{width: 36}} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
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

        {/* Contact Section */}
        <Text style={styles.sectionTitle}>Contact Us</Text>
        <View style={styles.contactCard}>
          <Text style={styles.contactTitle}>Need more help?</Text>

          <TouchableOpacity
            style={styles.contactBtn}
            activeOpacity={0.85}
            onPress={() =>
              Alert.alert(
                'Support Ticket Created',
                'Our team will get back to you within 24 hours.',
              )
            }>
            <Text style={styles.contactBtnText}>Contact Support</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.outlineBtn}
            activeOpacity={0.85}
            onPress={() =>
              Alert.alert(
                'Bug Report',
                'Thank you! Your bug report has been submitted.',
              )
            }>
            <Text style={styles.outlineBtnText}>Report a Bug</Text>
          </TouchableOpacity>

          <View style={styles.emailRow}>
            <MailIcon />
            <Text style={styles.emailText}>support@tradingapp.com</Text>
          </View>
        </View>

        {/* App Info */}
        <View style={styles.appInfo}>
          <Text style={styles.appInfoVersion}>TradingApp v1.0.5</Text>
          <Text style={styles.appInfoSub}>Built for traders</Text>
        </View>

        <View style={{height: 40}} />
      </ScrollView>
    </View>
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

  // Scroll
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
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

  // Contact card
  contactCard: {
    backgroundColor: '#161B22',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 20,
    alignItems: 'center',
    marginBottom: 28,
  },
  contactTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: 18,
    color: '#FFFFFF',
    marginBottom: 18,
  },
  contactBtn: {
    backgroundColor: '#10B981',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  contactBtnText: {
    fontFamily: 'Inter-Bold',
    fontSize: 15,
    color: '#FFFFFF',
  },
  outlineBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
  },
  outlineBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emailText: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
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
});
