import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../types';
import {useToast} from '../../context/ToastContext';
import Svg, {Path, Circle, Rect, Line} from 'react-native-svg';
import {userApi} from '../../services/user';

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

function ChevronRight() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 5l7 7-7 7"
        stroke="rgba(255,255,255,0.3)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function UserIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8} r={4} stroke="#FFFFFF" strokeWidth={1.5} />
      <Path
        d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6"
        stroke="#FFFFFF"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function LockIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Rect
        x={5}
        y={11}
        width={14}
        height={10}
        rx={2}
        stroke="#FFFFFF"
        strokeWidth={1.5}
      />
      <Path
        d="M8 11V7a4 4 0 018 0v4"
        stroke="#FFFFFF"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function ShieldIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2l8 4v6c0 5.5-3.8 9.7-8 11-4.2-1.3-8-5.5-8-11V6l8-4z"
        stroke="#FFFFFF"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Path
        d="M9 12l2 2 4-4"
        stroke="#FFFFFF"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function LinkIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"
        stroke="#FFFFFF"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <Path
        d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"
        stroke="#FFFFFF"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function CrownIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M2 8l4 10h12l4-10-5 4-5-8-5 8-5-4z"
        stroke="#FFFFFF"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Line
        x1={6}
        y1={18}
        x2={18}
        y2={18}
        stroke="#FFFFFF"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function CardIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Rect
        x={2}
        y={5}
        width={20}
        height={14}
        rx={3}
        stroke="#FFFFFF"
        strokeWidth={1.5}
      />
      <Line
        x1={2}
        y1={10}
        x2={22}
        y2={10}
        stroke="#FFFFFF"
        strokeWidth={1.5}
      />
    </Svg>
  );
}

function BellIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9z"
        stroke="#FFFFFF"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Path
        d="M13.73 21a2 2 0 01-3.46 0"
        stroke="#FFFFFF"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function PaletteIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} stroke="#FFFFFF" strokeWidth={1.5} />
      <Circle cx={8} cy={10} r={1.5} fill="#FFFFFF" />
      <Circle cx={12} cy={7} r={1.5} fill="#FFFFFF" />
      <Circle cx={16} cy={10} r={1.5} fill="#FFFFFF" />
      <Circle cx={9} cy={15} r={1.5} fill="#FFFFFF" />
    </Svg>
  );
}

function GlobeIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} stroke="#FFFFFF" strokeWidth={1.5} />
      <Path
        d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"
        stroke="#FFFFFF"
        strokeWidth={1.5}
      />
    </Svg>
  );
}

function QuestionIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} stroke="#FFFFFF" strokeWidth={1.5} />
      <Path
        d="M9 9a3 3 0 015.12 2.13c0 1.37-2.12 2-2.12 3.37"
        stroke="#FFFFFF"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <Circle cx={12} cy={17.5} r={0.75} fill="#FFFFFF" />
    </Svg>
  );
}

function DocIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
        stroke="#FFFFFF"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Path
        d="M14 2v6h6M8 13h8M8 17h8M8 9h2"
        stroke="#FFFFFF"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// ─── Row types ──────────────────────────────────────────────────────────────────

interface SettingRow {
  label: string;
  icon: React.ReactNode;
  type: 'nav' | 'toggle' | 'text';
  value?: string;
  screen?: keyof RootStackParamList;
  toggleKey?: string;
}

interface SettingSection {
  title: string;
  rows: SettingRow[];
}

// ─── Screen ─────────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const navigation = useNavigation<Nav>();
  const {alert: showAlert} = useToast();
  const [twoFactor, setTwoFactor] = useState(false);

  useEffect(() => {
    userApi.getSettings()
      .then(s => { if (s) setTwoFactor(s.pushEnabled ?? false); })
      .catch(() => {});
  }, []);

  const handleTwoFactorToggle = (val: boolean) => {
    setTwoFactor(val);
    userApi.updateSettings({push_enabled: val}).catch(() => {});
  };

  const sections: SettingSection[] = [
    {
      title: 'ACCOUNT',
      rows: [
        {label: 'Edit Profile', icon: <UserIcon />, type: 'nav'},
        {label: 'Change Password', icon: <LockIcon />, type: 'nav'},
        {
          label: 'Two-Factor Authentication',
          icon: <ShieldIcon />,
          type: 'toggle',
          toggleKey: 'twoFactor',
        },
        {
          label: 'Connected Exchanges',
          icon: <LinkIcon />,
          type: 'nav',
          screen: 'ExchangeManage',
        },
      ],
    },
    {
      title: 'SUBSCRIPTION',
      rows: [
        {
          label: 'Manage Subscription',
          icon: <CrownIcon />,
          type: 'nav',
          screen: 'Subscription',
        },
        {
          label: 'Payment Methods',
          icon: <CardIcon />,
          type: 'nav',
          screen: 'PaymentMethod',
        },
      ],
    },
    {
      title: 'PREFERENCES',
      rows: [
        {
          label: 'Notifications',
          icon: <BellIcon />,
          type: 'nav',
          screen: 'NotificationSettings',
        },
        {label: 'Theme', icon: <PaletteIcon />, type: 'text', value: 'Dark'},
        {
          label: 'Language',
          icon: <GlobeIcon />,
          type: 'text',
          value: 'English',
        },
      ],
    },
    {
      title: 'ABOUT',
      rows: [
        {
          label: 'Help & Support',
          icon: <QuestionIcon />,
          type: 'nav',
          screen: 'HelpSupport',
        },
        {label: 'Terms of Service', icon: <DocIcon />, type: 'nav'},
        {label: 'Privacy Policy', icon: <ShieldIcon />, type: 'nav'},
        {
          label: 'App Version',
          icon: <DocIcon />,
          type: 'text',
          value: 'v1.0.5',
        },
      ],
    },
  ];

  const handleRowPress = (row: SettingRow) => {
    if (row.label === 'Edit Profile' || row.label === 'Change Password') {
      showAlert('Coming Soon', `${row.label} will be available in a future update.`);
      return;
    }
    if (row.label === 'Terms of Service' || row.label === 'Privacy Policy') {
      showAlert(row.label, 'You can view our full terms at bottrade.app/legal');
      return;
    }
    if (row.screen) {
      navigation.navigate(row.screen as any);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}>
          <BackArrow />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{width: 36}} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {sections.map((section, si) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.card}>
              {section.rows.map((row, ri) => (
                <View key={row.label}>
                  <TouchableOpacity
                    style={styles.row}
                    activeOpacity={row.type === 'text' ? 1 : 0.6}
                    onPress={() => handleRowPress(row)}
                    disabled={row.type === 'text' && !row.screen}>
                    <View style={styles.rowIconCircle}>{row.icon}</View>
                    <Text style={styles.rowLabel}>{row.label}</Text>
                    {row.type === 'nav' && <ChevronRight />}
                    {row.type === 'toggle' && (
                      <Switch
                        value={twoFactor}
                        onValueChange={handleTwoFactorToggle}
                        trackColor={{
                          false: 'rgba(255,255,255,0.1)',
                          true: '#10B981',
                        }}
                        thumbColor="#FFFFFF"
                      />
                    )}
                    {row.type === 'text' && row.value && (
                      <Text style={styles.rowValue}>{row.value}</Text>
                    )}
                  </TouchableOpacity>
                  {ri < section.rows.length - 1 && (
                    <View style={styles.rowDivider} />
                  )}
                </View>
              ))}
            </View>
          </View>
        ))}

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

  // Scroll content
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },

  // Section
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 1,
    marginBottom: 10,
    marginLeft: 4,
  },

  // Card
  card: {
    backgroundColor: '#161B22',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },

  // Row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  rowIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowLabel: {
    flex: 1,
    fontFamily: 'Inter-Medium',
    fontSize: 15,
    color: '#FFFFFF',
  },
  rowValue: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: 'rgba(255,255,255,0.35)',
  },
  rowDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginLeft: 62,
  },
});
