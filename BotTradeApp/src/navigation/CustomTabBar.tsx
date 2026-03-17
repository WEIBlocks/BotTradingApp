import React, {useState, useEffect} from 'react';
import {View, TouchableOpacity, StyleSheet, Text, Platform} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {BottomTabBarProps} from '@react-navigation/bottom-tabs';
import HomeIcon from '../components/icons/HomeIcon';
import MarketIcon from '../components/icons/MarketIcon';
import PortfolioIcon from '../components/icons/PortfolioIcon';
import ProfileIcon from '../components/icons/ProfileIcon';
import BotIcon from '../components/icons/BotIcon';
import {haptics} from '../utils/haptics';
import {notificationsService} from '../services/notifications';

const ICONS = {
  Dashboard: HomeIcon,
  Market: MarketIcon,
  Portfolio: PortfolioIcon,
  Profile: ProfileIcon,
};

const LABELS: Record<string, string> = {
  Dashboard: 'Home',
  Market: 'Market',
  AIChat: 'AI',
  Portfolio: 'Portfolio',
  Profile: 'Profile',
};

export default function CustomTabBar({state, descriptors, navigation}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'android' ? 8 : 0);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    notificationsService.getUnreadCount()
      .then((count: number) => setUnreadCount(count))
      .catch(() => {});
    const interval = setInterval(() => {
      notificationsService.getUnreadCount()
        .then((count: number) => setUnreadCount(count))
        .catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={[styles.container, {paddingBottom: bottomPad, height: 60 + bottomPad}]}>
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const isCenter = route.name === 'AIChat';

        const onPress = () => {
          haptics.light();
          const event = navigation.emit({type: 'tabPress', target: route.key, canPreventDefault: true});
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        if (isCenter) {
          return (
            <TouchableOpacity
              key={route.key}
              style={styles.centerTab}
              onPress={onPress}
              activeOpacity={0.85}
              accessibilityLabel="AI Chat"
              accessibilityRole="button">
              <View style={[styles.fab, isFocused && styles.fabActive]}>
                <BotIcon size={44} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
          );
        }

        const IconComponent = ICONS[route.name as keyof typeof ICONS] || HomeIcon;
        const color = isFocused ? '#10B981' : 'rgba(255,255,255,0.4)';
        const showBadge = route.name === 'Dashboard' && unreadCount > 0;

        return (
          <TouchableOpacity
            key={route.key}
            style={styles.tab}
            onPress={onPress}
            activeOpacity={0.7}
            accessibilityLabel={LABELS[route.name]}
            accessibilityRole="tab"
            accessibilityState={{selected: isFocused}}>
            <View>
              <IconComponent size={22} color={color} />
              {showBadge && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.label, {color}]}>{LABELS[route.name]}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
              
const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#0A0D14',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 5,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  centerTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 0,
  },
  fab: {
    width: 58,
    height: 58,
    borderRadius: 31,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -24,
    shadowColor: '#10B981',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },
  fabActive: {
    backgroundColor: '#059669',
  },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    letterSpacing: 0.3,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontFamily: 'Inter-Bold',
    fontSize: 9,
    color: '#FFFFFF',
  },
});
 