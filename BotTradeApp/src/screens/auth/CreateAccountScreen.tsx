import React, {useState, useCallback} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, SafeAreaView} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {AuthStackParamList} from '../../types';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import OAuthButton from '../../components/common/OAuthButton';
import Divider from '../../components/common/Divider';
import ChevronLeftIcon from '../../components/icons/ChevronLeftIcon';

type Props = NativeStackScreenProps<AuthStackParamList, 'CreateAccount'>;

const TERMS_CONTENT = `Last updated: March 2026

1. Acceptance of Terms
By accessing or using the Trading App, you agree to be bound by these Terms of Service. If you do not agree, do not use the app.

2. Eligibility
You must be at least 18 years old and legally permitted to trade in your jurisdiction. You are responsible for ensuring compliance with local laws.

3. Account Responsibility
You are responsible for maintaining the confidentiality of your account credentials. Notify us immediately of any unauthorized use.

4. AI Trading Bots
Our AI bots are tools to assist trading decisions — not financial advice. Past performance does not guarantee future results. All trading involves risk.

5. Risk Disclosure
Cryptocurrency and financial trading involves significant risk of loss. You may lose some or all of your invested capital. Only invest what you can afford to lose.

6. Prohibited Activities
You may not use the app for market manipulation, fraudulent activity, money laundering, or any unlawful purpose.

7. Intellectual Property
All content, features, and functionality are the exclusive property of Trading App and are protected by applicable intellectual property laws.

8. Limitation of Liability
To the maximum extent permitted by law, Trading App shall not be liable for any indirect, incidental, or consequential damages arising from your use of the service.

9. Termination
We reserve the right to suspend or terminate your account at our discretion for violations of these terms.

10. Changes to Terms
We may update these terms from time to time. Continued use after changes constitutes acceptance.

11. Contact
For questions, contact support@tradingapp.com`;

const PRIVACY_CONTENT = `Last updated: March 2026

1. Information We Collect
We collect information you provide (name, email, financial data), usage data (trades, bot activity), and device information (IP address, device type).

2. How We Use Your Information
- To provide and improve our services
- To process transactions and send related information
- To send notifications and updates (with your consent)
- To detect and prevent fraud
- To comply with legal obligations

3. Data Sharing
We do not sell your personal data. We may share data with:
- Service providers who assist in our operations
- Regulatory authorities when required by law
- Business partners with your explicit consent

4. Data Security
We implement industry-standard security measures including 256-bit encryption, secure servers, and regular security audits to protect your data.

5. Data Retention
We retain your data for as long as your account is active or as needed to provide services, comply with legal obligations, and resolve disputes.

6. Your Rights
You have the right to:
- Access your personal data
- Correct inaccurate data
- Request deletion of your data
- Opt out of marketing communications

7. Cookies and Tracking
We use cookies and similar technologies to enhance your experience and analyze usage patterns.

8. Children's Privacy
Our services are not directed to individuals under 18. We do not knowingly collect data from minors.

9. International Transfers
Your data may be transferred to and processed in countries other than your own. We ensure appropriate safeguards are in place.

10. Contact Us
For privacy-related inquiries: privacy@tradingapp.com`;

type PolicyType = 'terms' | 'privacy' | null;

function PolicyModal({visible, type, onClose}: {visible: boolean; type: PolicyType; onClose: () => void}) {
  const isTerms = type === 'terms';
  const title = isTerms ? 'Terms of Service' : 'Privacy Policy';
  const content = isTerms ? TERMS_CONTENT : PRIVACY_CONTENT;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={modal.container}>
        <View style={modal.header}>
          <View style={modal.headerLeft} />
          <Text style={modal.title}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={modal.closeBtn} activeOpacity={0.7}>
            <Text style={modal.closeX}>✕</Text>
          </TouchableOpacity>
        </View>
        <View style={modal.pill} />
        <ScrollView style={modal.scroll} contentContainerStyle={modal.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={modal.badge}>
            <Text style={modal.badgeText}>{isTerms ? 'Legal Agreement' : 'Your Privacy Matters'}</Text>
          </View>
          <Text style={modal.body}>{content}</Text>
        </ScrollView>
        <View style={modal.footer}>
          <TouchableOpacity style={modal.acceptBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={modal.acceptText}>I Understand</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

export default function CreateAccountScreen({navigation}: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [activePolicy, setActivePolicy] = useState<PolicyType>(null);

  const handleCreate = useCallback(() => {
    navigation.navigate('InvestorQuiz');
  }, [navigation]);

  return (
    <View style={styles.container}>
      <PolicyModal
        visible={activePolicy !== null}
        type={activePolicy}
        onClose={() => setActivePolicy(null)}
      />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeftIcon size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Join 50,000+ traders using AI bots</Text>

        <OAuthButton provider="google" onPress={() => {}} />
        <OAuthButton provider="apple" onPress={() => {}} />

        <Divider label="Or sign up with email" />

        <Input label="Full Name" placeholder="Your name" value={name} onChangeText={setName} autoCapitalize="words" />
        <Input label="Email Address" placeholder="you@example.com" value={email} onChangeText={setEmail} keyboardType="email-address" />
        <Input label="Password" placeholder="Create a strong password" value={password} onChangeText={setPassword} secureTextEntry />

        <Text style={styles.terms}>
          By creating an account, you agree to our{' '}
          <Text style={styles.termsLink} onPress={() => setActivePolicy('terms')}>Terms of Service</Text>
          {' '}and{' '}
          <Text style={styles.termsLink} onPress={() => setActivePolicy('privacy')}>Privacy Policy</Text>
        </Text>

        <Button title="Create Account" onPress={handleCreate} style={styles.createBtn} />

        <TouchableOpacity style={styles.loginRow} onPress={() => navigation.navigate('Login')}>
          <Text style={styles.loginText}>
            Already have an account? <Text style={styles.loginLink}>Log In</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0F1117'},
  header: {paddingHorizontal: 20, paddingTop: 56, paddingBottom: 8},
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  scroll: {paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40},
  title: {fontFamily: 'Inter-Bold', fontSize: 28, color: '#FFFFFF', marginBottom: 8, letterSpacing: -0.5},
  subtitle: {fontFamily: 'Inter-Regular', fontSize: 15, color: 'rgba(255,255,255,0.5)', marginBottom: 28},
  terms: {fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.35)', lineHeight: 18, marginBottom: 20},
  termsLink: {color: '#10B981', fontFamily: 'Inter-SemiBold'},
  createBtn: {marginBottom: 16},
  loginRow: {alignItems: 'center', paddingVertical: 8},
  loginText: {fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.5)'},
  loginLink: {fontFamily: 'Inter-SemiBold', color: '#10B981'},
});

const modal = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0F1117'},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerLeft: {width: 36},
  title: {fontFamily: 'Inter-Bold', fontSize: 17, color: '#FFFFFF', letterSpacing: -0.3},
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeX: {color: 'rgba(255,255,255,0.6)', fontSize: 14, fontFamily: 'Inter-Medium'},
  pill: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignSelf: 'center',
    marginBottom: 8,
  },
  scroll: {flex: 1},
  scrollContent: {paddingHorizontal: 24, paddingBottom: 24},
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.2)',
  },
  badgeText: {fontFamily: 'Inter-Medium', fontSize: 13, color: '#10B981'},
  body: {fontFamily: 'Inter-Regular', fontSize: 14, color: 'rgba(255,255,255,0.65)', lineHeight: 22},
  footer: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  acceptBtn: {
    backgroundColor: '#10B981',
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptText: {fontFamily: 'Inter-SemiBold', fontSize: 16, color: '#FFFFFF'},
});
