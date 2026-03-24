import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../types';
import {userApi} from '../../services/user';
import {useToast} from '../../context/ToastContext';
import ChevronLeftIcon from '../../components/icons/ChevronLeftIcon';
import BellIcon from '../../components/icons/BellIcon';
import ChartIcon from '../../components/icons/ChartIcon';
import GearIcon from '../../components/icons/GearIcon';
import InfoIcon from '../../components/icons/InfoIcon';

type Props = NativeStackScreenProps<RootStackParamList, 'NotificationSettings'>;

interface ToggleSetting {
  id: string;
  label: string;
  description: string;
  value: boolean;
}

interface SettingSection {
  title: string;
  icon: React.ReactNode;
  iconBg: string;
  items: ToggleSetting[];
}

export default function NotificationsSettingsScreen({navigation}: Props) {
  const {alert: showAlert} = useToast();
  const [settings, setSettings] = useState<Record<string, boolean>>({
    // Trade Alerts
    tradeExecuted: true,
    profitTarget: true,
    stopLoss: true,
    botActivated: true,
    // Market Alerts
    priceAlert: false,
    marketOpen: true,
    volatilityAlert: false,
    // System Notifications
    botUpdate: true,
    securityAlert: true,
    weeklyReport: true,
    promotions: false,
    // Arena
    arenaInvite: true,
    arenaResults: true,
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggle = (id: string) => {
    setSettings(prev => {
      const updated = {...prev, [id]: !prev[id]};
      // Debounce API call to persist settings
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        userApi.updateSettings({
          trade_alerts: updated.tradeAlerts ?? true,
          system_updates: updated.systemUpdates ?? true,
          price_alerts: updated.priceAlerts ?? true,
          push_enabled: updated.pushEnabled ?? true,
          email_enabled: updated.emailEnabled ?? false,
        }).catch(() => {});
      }, 800);
      return updated;
    });
  };

  // Load saved settings on mount
  useEffect(() => {
    userApi.getSettings()
      .then(s => {
        if (s) setSettings(prev => ({
          ...prev,
          tradeAlerts: s.tradeAlerts ?? prev.tradeAlerts,
          systemUpdates: s.systemUpdates ?? prev.systemUpdates,
          priceAlerts: s.priceAlerts ?? prev.priceAlerts,
          pushEnabled: s.pushEnabled ?? prev.pushEnabled,
          emailEnabled: s.emailEnabled ?? prev.emailEnabled,
        }));
      })
      .catch(() => {});
  }, []);

  const sections: SettingSection[] = [
    {
      title: 'Trade Alerts',
      icon: <ChartIcon size={18} color="#10B981" />,
      iconBg: 'rgba(16,185,129,0.15)',
      items: [
        {id: 'tradeExecuted', label: 'Trade Executed', description: 'When a bot opens or closes a position', value: settings.tradeExecuted},
        {id: 'profitTarget', label: 'Profit Target Hit', description: 'When a trade reaches your profit goal', value: settings.profitTarget},
        {id: 'stopLoss', label: 'Stop Loss Triggered', description: 'When a trade hits the stop-loss level', value: settings.stopLoss},
        {id: 'botActivated', label: 'Bot Status Change', description: 'When a bot is activated or paused', value: settings.botActivated},
      ],
    },
    {
      title: 'Market Alerts',
      icon: <BellIcon size={18} color="#0D7FF2" />,
      iconBg: 'rgba(13,127,242,0.15)',
      items: [
        {id: 'priceAlert', label: 'Price Alerts', description: 'Custom price threshold notifications', value: settings.priceAlert},
        {id: 'marketOpen', label: 'Market Open/Close', description: 'Daily market session reminders', value: settings.marketOpen},
        {id: 'volatilityAlert', label: 'High Volatility Warning', description: 'Unusual market movement detected', value: settings.volatilityAlert},
      ],
    },
    {
      title: 'System Notifications',
      icon: <GearIcon size={18} color="#A855F7" />,
      iconBg: 'rgba(168,85,247,0.15)',
      items: [
        {id: 'botUpdate', label: 'Bot Updates', description: 'Strategy updates from bot creators', value: settings.botUpdate},
        {id: 'securityAlert', label: 'Security Alerts', description: 'Login attempts and account changes', value: settings.securityAlert},
        {id: 'weeklyReport', label: 'Weekly Performance Report', description: 'Summary of your portfolio every Sunday', value: settings.weeklyReport},
        {id: 'promotions', label: 'Promotions & Offers', description: 'Special deals and featured bots', value: settings.promotions},
      ],
    },
    {
      title: 'Arena',
      icon: <InfoIcon size={18} color="#EAB308" />,
      iconBg: 'rgba(234,179,8,0.15)',
      items: [
        {id: 'arenaInvite', label: 'Arena Invitations', description: 'When someone challenges you to a battle', value: settings.arenaInvite},
        {id: 'arenaResults', label: 'Arena Results', description: 'Final standings when a battle ends', value: settings.arenaResults},
      ],
    },
  ];

  const allEnabled = Object.values(settings).every(Boolean);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <ChevronLeftIcon size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notification Settings</Text>
        <View style={{width: 40}} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}>
        {/* Master toggle */}
        <View style={styles.masterCard}>
          <View style={styles.masterLeft}>
            <View style={styles.masterIconCircle}>
              <BellIcon size={22} color="#10B981" />
            </View>
            <View>
              <Text style={styles.masterTitle}>All Notifications</Text>
              <Text style={styles.masterSubtitle}>
                {allEnabled ? 'All alerts are active' : 'Some alerts are disabled'}
              </Text>
            </View>
          </View>
          <Switch
            value={allEnabled}
            onValueChange={val => {
              const newSettings: Record<string, boolean> = {};
              Object.keys(settings).forEach(k => (newSettings[k] = val));
              setSettings(newSettings);
            }}
            trackColor={{false: 'rgba(255,255,255,0.1)', true: 'rgba(16,185,129,0.4)'}}
            thumbColor={allEnabled ? '#10B981' : 'rgba(255,255,255,0.4)'}
          />
        </View>

        {/* Quiet hours */}
        <View style={styles.quietHoursCard}>
          <View style={styles.quietHoursLeft}>
            <Text style={styles.quietHoursLabel}>QUIET HOURS</Text>
            <Text style={styles.quietHoursTitle}>10:00 PM — 7:00 AM</Text>
            <Text style={styles.quietHoursSubtitle}>
              Critical alerts only during sleep hours
            </Text>
          </View>
          <TouchableOpacity style={styles.quietHoursEditBtn} onPress={() => showAlert('Quiet Hours', 'Quiet hours configuration will be available in a future update. Currently set to 10:00 PM — 7:00 AM.')}>
            <Text style={styles.quietHoursEditText}>Edit</Text>
          </TouchableOpacity>
        </View>

        {/* Sections */}
        {sections.map(section => (
          <View key={section.title} style={styles.sectionBlock}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, {backgroundColor: section.iconBg}]}>
                {section.icon}
              </View>
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
            <View style={styles.sectionCard}>
              {section.items.map((item, idx) => (
                <View
                  key={item.id}
                  style={[
                    styles.settingRow,
                    idx < section.items.length - 1 && styles.settingRowBorder,
                  ]}>
                  <View style={styles.settingLeft}>
                    <Text style={styles.settingLabel}>{item.label}</Text>
                    <Text style={styles.settingDescription}>{item.description}</Text>
                  </View>
                  <Switch
                    value={settings[item.id]}
                    onValueChange={() => toggle(item.id)}
                    trackColor={{
                      false: 'rgba(255,255,255,0.1)',
                      true: 'rgba(16,185,129,0.4)',
                    }}
                    thumbColor={settings[item.id] ? '#10B981' : 'rgba(255,255,255,0.4)'}
                  />
                </View>
              ))}
            </View>
          </View>
        ))}

        {/* Delivery method */}
        <View style={styles.deliverySection}>
          <Text style={styles.deliveryTitle}>DELIVERY METHOD</Text>
          <View style={styles.deliveryCard}>
            <DeliveryRow label="Push Notifications" subtitle="In-app alerts" active />
            <DeliveryRow label="Email Digest" subtitle="Weekly summary only" active />
            <DeliveryRow label="SMS Alerts" subtitle="Critical alerts only" active={false} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function DeliveryRow({
  label,
  subtitle,
  active,
}: {
  label: string;
  subtitle: string;
  active: boolean;
}) {
  return (
    <View style={styles.deliveryRow}>
      <View style={[styles.deliveryDot, active ? styles.deliveryDotActive : styles.deliveryDotInactive]} />
      <View style={styles.deliveryInfo}>
        <Text style={styles.deliveryLabel}>{label}</Text>
        <Text style={styles.deliverySubtitle}>{subtitle}</Text>
      </View>
      <Text style={[styles.deliveryStatus, active ? {color: '#10B981'} : {color: 'rgba(255,255,255,0.3)'}]}>
        {active ? 'ON' : 'OFF'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0F1117'},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {fontFamily: 'Inter-Bold', fontSize: 17, color: '#FFFFFF'},
  scroll: {paddingHorizontal: 20, paddingBottom: 48},
  // Master
  masterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#161B22',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  masterLeft: {flexDirection: 'row', alignItems: 'center', gap: 14},
  masterIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(16,185,129,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  masterTitle: {fontFamily: 'Inter-SemiBold', fontSize: 15, color: '#FFFFFF'},
  masterSubtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  // Quiet hours
  quietHoursCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(13,127,242,0.08)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(13,127,242,0.2)',
  },
  quietHoursLeft: {flex: 1},
  quietHoursLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 9,
    letterSpacing: 1,
    color: '#0D7FF2',
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  quietHoursTitle: {fontFamily: 'Inter-Bold', fontSize: 16, color: '#FFFFFF'},
  quietHoursSubtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  quietHoursEditBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(13,127,242,0.2)',
  },
  quietHoursEditText: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#0D7FF2'},
  // Sections
  sectionBlock: {marginBottom: 20},
  sectionHeader: {flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10},
  sectionIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF'},
  sectionCard: {
    backgroundColor: '#161B22',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  settingRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  settingLeft: {flex: 1, paddingRight: 16},
  settingLabel: {fontFamily: 'Inter-Medium', fontSize: 14, color: '#FFFFFF'},
  settingDescription: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 2,
  },
  // Delivery
  deliverySection: {marginBottom: 20},
  deliveryTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: 11,
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  deliveryCard: {
    backgroundColor: '#161B22',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  deliveryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  deliveryDot: {width: 10, height: 10, borderRadius: 5, marginRight: 14},
  deliveryDotActive: {backgroundColor: '#10B981'},
  deliveryDotInactive: {backgroundColor: 'rgba(255,255,255,0.15)'},
  deliveryInfo: {flex: 1},
  deliveryLabel: {fontFamily: 'Inter-Medium', fontSize: 14, color: '#FFFFFF'},
  deliverySubtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 1,
  },
  deliveryStatus: {fontFamily: 'Inter-Bold', fontSize: 12, letterSpacing: 0.5},
});
