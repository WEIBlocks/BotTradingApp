import React from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../types';
import Svg, {Path} from 'react-native-svg';

type Nav = NativeStackNavigationProp<RootStackParamList>;

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

interface Section {
  title: string;
  body: string;
}

const SECTIONS: Section[] = [
  {
    title: '1. Acceptance of Terms',
    body: 'By accessing or using the BotTrade mobile application ("App"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to all of these Terms, you may not access or use the App. We reserve the right to update these Terms at any time, and your continued use of the App after such changes constitutes acceptance of the updated Terms.',
  },
  {
    title: '2. Description of Service',
    body: 'BotTrade is an automated trading bot platform that allows users to discover, purchase, and deploy algorithmic trading bots. Our services include a bot marketplace where creators publish trading strategies, Shadow Mode for risk-free simulated testing, Paper Trading with virtual funds, Arena Mode for competitive bot comparisons, and AI-powered tools for strategy creation and analysis. The App connects to supported cryptocurrency and stock exchanges via API to execute trades on your behalf based on the bot strategies you activate.',
  },
  {
    title: '3. Account Registration & Security',
    body: 'You must register an account to use BotTrade. You agree to provide accurate, current, and complete information during registration and to keep your account credentials secure. You are solely responsible for all activity that occurs under your account. You must notify us immediately of any unauthorized use of your account. BotTrade is not liable for any loss arising from unauthorized access to your account due to your failure to safeguard your credentials.',
  },
  {
    title: '4. Trading & Financial Risks',
    body: 'IMPORTANT: BotTrade does not provide financial advice, investment advice, or trading recommendations. All trading involves substantial risk of loss and is not suitable for every investor. Past performance of any trading bot is not indicative of future results. You acknowledge that you trade entirely at your own risk and that you could lose some or all of your invested capital. Automated trading bots may experience losses due to market volatility, technical failures, exchange outages, or strategy underperformance. You should only invest funds that you can afford to lose. BotTrade strongly recommends using Shadow Mode to evaluate any bot before deploying real capital.',
  },
  {
    title: '5. Bot Marketplace',
    body: 'The BotTrade marketplace allows creators to publish and sell trading bot strategies. Bot creators are solely responsible for the accuracy of their bot descriptions, stated performance metrics, and strategy behavior. BotTrade does not guarantee the performance of any bot listed on the marketplace. Revenue from bot sales is shared between the creator and the platform, with BotTrade retaining a 7% platform fee on all bot purchases and subscriptions. Creators must comply with all applicable laws and may not publish bots designed to manipulate markets or engage in fraudulent activity.',
  },
  {
    title: '6. Subscription & Payments',
    body: 'BotTrade offers a Pro subscription plan at $4.94 per month, which provides access to premium features including advanced analytics, priority bot access, and enhanced AI tools. Individual bot purchases are available for up to $20 each. All payments are processed through the App Store (iOS) or Google Play (Android) in-app purchase systems. Subscriptions automatically renew unless cancelled at least 24 hours before the end of the current billing period. Refunds are subject to the policies of the respective app store platform.',
  },
  {
    title: '7. Shadow Mode & Paper Trading',
    body: 'Shadow Mode and Paper Trading features allow you to test trading strategies using virtual funds in simulated market conditions. No real funds are at risk during Shadow Mode or Paper Trading sessions. However, simulated performance may differ from live trading results due to factors including but not limited to slippage, liquidity, execution timing, and market impact. Shadow Mode and Paper Trading results should be used for evaluation purposes only and do not guarantee equivalent live trading performance.',
  },
  {
    title: '8. Arena Mode',
    body: 'Arena Mode is a competitive feature that allows users to compare bot performance in head-to-head virtual battles. Arena sessions use simulated trading and virtual performance metrics. Arena results are for entertainment and educational purposes and do not constitute a recommendation to use any particular bot or strategy. Rankings and scores in Arena Mode are based on virtual performance and may not reflect real-world trading outcomes.',
  },
  {
    title: '9. Intellectual Property',
    body: 'All content, features, and functionality of the BotTrade App, including but not limited to text, graphics, logos, icons, software, and the underlying algorithms, are the exclusive property of BotTrade or its licensors and are protected by intellectual property laws. Bot creators retain ownership of their trading strategies but grant BotTrade a non-exclusive license to host, distribute, and execute their bots on the platform. You may not copy, modify, distribute, reverse-engineer, or create derivative works from any part of the App without prior written consent.',
  },
  {
    title: '10. Limitation of Liability',
    body: 'To the maximum extent permitted by applicable law, BotTrade, its officers, directors, employees, and agents shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, trading losses, data loss, or other intangible losses, resulting from your use of or inability to use the App. BotTrade\'s total liability for any claims arising from or related to these Terms shall not exceed the amount you paid to BotTrade in the twelve (12) months preceding the claim.',
  },
  {
    title: '11. Termination',
    body: 'BotTrade reserves the right to suspend or terminate your account at any time, with or without cause, and with or without notice. Grounds for termination include but are not limited to violation of these Terms, suspected fraudulent activity, abuse of the platform, or prolonged account inactivity. Upon termination, your right to use the App ceases immediately. You may also delete your account at any time through the App settings. Any outstanding subscription fees at the time of termination are non-refundable.',
  },
  {
    title: '12. Contact Information',
    body: 'If you have any questions about these Terms of Service, please contact us at:\n\nEmail: support@bottrade.app\n\nWe aim to respond to all inquiries within 48 business hours.',
  },
];

export default function TermsOfServiceScreen() {
  const navigation = useNavigation<Nav>();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}>
          <BackArrow />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <View style={{width: 36}} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.lastUpdated}>Last Updated: March 2026</Text>

        {SECTIONS.map(section => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionBody}>{section.body}</Text>
          </View>
        ))}

        <View style={{height: 40}} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E14',
  },
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
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  lastUpdated: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 10,
  },
  sectionBody: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 22,
  },
});
