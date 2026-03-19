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
    title: '1. Information We Collect',
    body: 'We collect information that you provide directly to us when creating and managing your account, including your name, email address, and password. We also collect trading data such as your bot configurations, trade history, portfolio allocations, and performance metrics. Additionally, we automatically collect device information including your device model, operating system version, unique device identifiers, and IP address. We gather usage analytics such as feature interaction patterns, screen views, session duration, and app performance data to improve our services.',
  },
  {
    title: '2. How We Use Your Information',
    body: 'We use your information to provide, maintain, and improve the BotTrade platform and its services. This includes executing trades on your behalf through connected exchanges, generating performance reports and analytics, personalizing your experience, and communicating important updates about your account or the platform. We use anonymized and aggregated trading data to train and improve our AI models for better strategy generation, market analysis, and trading recommendations. Your individual trading data is never shared with other users or third parties for AI training purposes.',
  },
  {
    title: '3. Exchange API Data',
    body: 'When you connect an exchange account, we securely store your API keys using AES-256 encryption at rest. We request only the minimal permissions necessary to operate: read access for portfolio and balance information, and trade execution access for active bots. We never request or store withdrawal permissions. BotTrade will never execute unauthorized trades on your behalf. All API communications are conducted over encrypted TLS connections. You can revoke exchange access at any time through the App settings or directly on your exchange platform.',
  },
  {
    title: '4. Data Sharing',
    body: 'BotTrade does not sell, rent, or trade your personal information to third parties. We may share data with exchange providers as necessary to execute trades and retrieve account information on your behalf. We use anonymized and aggregated analytics data for platform improvement and may share such anonymized data with analytics partners. We may disclose your information if required by law, regulation, legal process, or governmental request. In the event of a merger, acquisition, or sale of assets, your information may be transferred as part of that transaction, and we will notify you of any such change.',
  },
  {
    title: '5. Data Security',
    body: 'We implement industry-standard security measures to protect your personal information. All data is encrypted at rest using AES-256 encryption and in transit using TLS 1.3. API keys and sensitive credentials are stored in secure, isolated key vaults with hardware-level protection. We conduct regular security audits and penetration testing. Access to user data is restricted to authorized personnel on a need-to-know basis. While we strive to protect your information, no method of electronic storage or transmission is 100% secure, and we cannot guarantee absolute security.',
  },
  {
    title: '6. Your Rights',
    body: 'You have the right to access, correct, or delete your personal data at any time. You can view and update your profile information directly in the App settings. To request a complete export of your data, contact us at privacy@bottrade.app. You may request deletion of your account and all associated data, which we will process within 30 days. After deletion, some anonymized and aggregated data may be retained for analytical purposes. You have the right to opt out of non-essential communications and marketing emails at any time through your notification settings.',
  },
  {
    title: '7. Cookies & Analytics',
    body: 'The BotTrade App uses local storage and analytics tools to improve your experience. We use session data to maintain your authentication state and preferences. We employ analytics services to understand how users interact with the App, identify performance issues, and measure feature adoption. You can limit analytics data collection through your device privacy settings. We do not use third-party advertising trackers or sell analytics data to advertisers.',
  },
  {
    title: '8. Children\'s Privacy',
    body: 'BotTrade is not intended for use by anyone under the age of 18. We do not knowingly collect personal information from children under 18. If we become aware that we have collected personal information from a child under 18, we will take steps to promptly delete that information. If you believe that a child under 18 has provided us with personal information, please contact us immediately at privacy@bottrade.app.',
  },
  {
    title: '9. Changes to Policy',
    body: 'We may update this Privacy Policy from time to time to reflect changes in our practices, technology, legal requirements, or other factors. We will notify you of any material changes by posting the updated policy within the App and updating the "Last Updated" date. For significant changes that affect how we handle your personal data, we will provide additional notice through in-app notifications or email. Your continued use of the App after any changes to this Privacy Policy constitutes your acceptance of the updated policy.',
  },
  {
    title: '10. Contact',
    body: 'If you have any questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us at:\n\nEmail: privacy@bottrade.app\n\nWe will respond to all privacy-related inquiries within 30 days.',
  },
];

export default function PrivacyPolicyScreen() {
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
        <Text style={styles.headerTitle}>Privacy Policy</Text>
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
