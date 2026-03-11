import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {RootStackParamList} from '../types';

import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import BotDetailsScreen from '../screens/bots/BotDetailsScreen';
import ShadowModeResultsScreen from '../screens/bots/ShadowModeResultsScreen';
import ShadowModeScreen from '../screens/bots/ShadowModeScreen';
import ArenaSetupScreen from '../screens/arena/ArenaSetupScreen';
import ArenaLiveScreen from '../screens/arena/ArenaLiveScreen';
import NotificationsScreen from '../screens/notifications/NotificationsScreen';
import TradeHistoryScreen from '../screens/wallet/TradeHistoryScreen';
import WalletFundsScreen from '../screens/wallet/WalletFundsScreen';
import ReferralScreen from '../screens/profile/ReferralScreen';
import QuickActionsModal from '../screens/modals/QuickActionsModal';
import VoiceAssistantModal from '../screens/modals/VoiceAssistantModal';
import BotPurchaseScreen from '../screens/bots/BotPurchaseScreen';
import ArenaFinalResultsScreen from '../screens/arena/ArenaFinalResultsScreen';
import PaperTradingSetupScreen from '../screens/wallet/PaperTradingSetupScreen';
import NotificationsSettingsScreen from '../screens/notifications/NotificationsSettingsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Auth"
      screenOptions={{
        headerShown: false,
        contentStyle: {backgroundColor: '#0F1117'},
        animation: 'slide_from_right',
      }}>
      <Stack.Screen name="Auth" component={AuthNavigator} />
      <Stack.Screen name="Main" component={MainNavigator} />
      <Stack.Screen name="BotDetails" component={BotDetailsScreen} />
      <Stack.Screen name="BotPurchase" component={BotPurchaseScreen} />
      <Stack.Screen name="ShadowMode" component={ShadowModeScreen} />
      <Stack.Screen name="ShadowModeResults" component={ShadowModeResultsScreen} />
      <Stack.Screen name="ArenaSetup" component={ArenaSetupScreen} />
      <Stack.Screen name="ArenaLive" component={ArenaLiveScreen} />
      <Stack.Screen name="ArenaResults" component={ArenaFinalResultsScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="PaperTradingSetup" component={PaperTradingSetupScreen} />
      <Stack.Screen name="NotificationSettings" component={NotificationsSettingsScreen} />
      <Stack.Screen name="TradeHistory" component={TradeHistoryScreen} />
      <Stack.Screen name="WalletFunds" component={WalletFundsScreen} />
      <Stack.Screen name="Referral" component={ReferralScreen} />
      <Stack.Screen
        name="QuickActions"
        component={QuickActionsModal}
        options={{
          presentation: 'transparentModal',
          animation: 'slide_from_bottom',
          contentStyle: {backgroundColor: 'transparent'},
        }}
      />
      <Stack.Screen
        name="VoiceAssistant"
        component={VoiceAssistantModal}
        options={{
          presentation: 'fullScreenModal',
          animation: 'fade',
        }}
      />
    </Stack.Navigator>
  );
}
