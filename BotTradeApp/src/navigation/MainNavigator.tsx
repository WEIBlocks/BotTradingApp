import React from 'react';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {MainTabParamList} from '../types';
import CustomTabBar from './CustomTabBar';

import DashboardScreen from '../screens/dashboard/DashboardScreen';
import MarketplaceScreen from '../screens/marketplace/MarketplaceScreen';
import AIChatScreen from '../screens/chat/AIChatScreen';
import ArenaSetupScreen from '../screens/arena/ArenaSetupScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainNavigator() {
  return (
    <Tab.Navigator
      tabBar={props => <CustomTabBar {...props} />}
      screenOptions={{headerShown: false}}>
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Market" component={MarketplaceScreen} />
      <Tab.Screen name="AIChat" component={AIChatScreen} />
      <Tab.Screen name="Arena" component={ArenaSetupScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
