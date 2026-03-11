import React from 'react';
import {View, TouchableOpacity, StyleSheet, Text, Platform} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {BottomTabBarProps} from '@react-navigation/bottom-tabs';
import HomeIcon from '../components/icons/HomeIcon';
import MarketIcon from '../components/icons/MarketIcon';
import ArenaIcon from '../components/icons/ArenaIcon';
import ProfileIcon from '../components/icons/ProfileIcon';
import BotIcon from '../components/icons/BotIcon';

const ICONS = {
  Dashboard: HomeIcon,
  Market: MarketIcon,
  Arena: ArenaIcon,
  Profile: ProfileIcon,
};

const LABELS: Record<string, string> = {
  Dashboard: 'Home',
  Market: 'Market',
  AIChat: 'AI',
  Arena: 'Arena',
  Profile: 'Profile',
};

export default function CustomTabBar({state, descriptors, navigation}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'android' ? 8 : 0);

  return (
    <View style={[styles.container, {paddingBottom: bottomPad, height: 60 + bottomPad}]}>
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const isCenter = route.name === 'AIChat';

        const onPress = () => {
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
              activeOpacity={0.85}>
              <View style={[styles.fab, isFocused && styles.fabActive]}>
                <BotIcon size={44} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
          );
        }

        const IconComponent = ICONS[route.name as keyof typeof ICONS] || HomeIcon;
        const color = isFocused ? '#10B981' : 'rgba(255,255,255,0.4)';

        return (
          <TouchableOpacity
            key={route.key}
            style={styles.tab}
            onPress={onPress}
            activeOpacity={0.7}>
            <IconComponent size={22} color={color} />
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
});
 