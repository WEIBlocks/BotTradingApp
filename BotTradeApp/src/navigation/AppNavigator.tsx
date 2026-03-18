import React from 'react';
import {View, ActivityIndicator, StyleSheet} from 'react-native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {RootStackParamList} from '../types';
import {useAuth} from '../context/AuthContext';

import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import AllBotsScreen from '../screens/marketplace/AllBotsScreen';
import BotDetailsScreen from '../screens/bots/BotDetailsScreen';
import ShadowModeResultsScreen from '../screens/bots/ShadowModeResultsScreen';
import ShadowModeScreen from '../screens/bots/ShadowModeScreen';
import BotPurchaseScreen from '../screens/bots/BotPurchaseScreen';
import BotBuilderScreen from '../screens/bots/BotBuilderScreen';
import ArenaSetupScreen from '../screens/arena/ArenaSetupScreen';
import ArenaLiveScreen from '../screens/arena/ArenaLiveScreen';
import ArenaFinalResultsScreen from '../screens/arena/ArenaFinalResultsScreen';
import ArenaHistoryScreen from '../screens/arena/ArenaHistoryScreen';
import NotificationsScreen from '../screens/notifications/NotificationsScreen';
import NotificationsSettingsScreen from '../screens/notifications/NotificationsSettingsScreen';
import TradeHistoryScreen from '../screens/wallet/TradeHistoryScreen';
import WalletFundsScreen from '../screens/wallet/WalletFundsScreen';
import PaperTradingSetupScreen from '../screens/wallet/PaperTradingSetupScreen';
import ReferralScreen from '../screens/profile/ReferralScreen';
import QuickActionsModal from '../screens/modals/QuickActionsModal';
import VoiceAssistantModal from '../screens/modals/VoiceAssistantModal';
import ExchangeConnectScreen from '../screens/exchange/ExchangeConnectScreen';
import ExchangeManageScreen from '../screens/exchange/ExchangeManageScreen';
import SubscriptionScreen from '../screens/subscription/SubscriptionScreen';
import TradingRoomScreen from '../screens/subscription/TradingRoomScreen';
import PaymentMethodScreen from '../screens/payment/PaymentMethodScreen';
import CheckoutScreen from '../screens/payment/CheckoutScreen';
import CreatorStudioScreen from '../screens/creator/CreatorStudioScreen';
import TrainingUploadScreen from '../screens/training/TrainingUploadScreen';
import LiveTradesScreen from '../screens/trades/LiveTradesScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import HelpSupportScreen from '../screens/settings/HelpSupportScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

function SplashLoader() {
  return (
    <View style={splash.container}>
      <ActivityIndicator size="large" color="#10B981" />
    </View>
  );
}

const splash = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1117',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default function AppNavigator() {
  const {user, isAuthReady, isOnboarding} = useAuth();

  // Show splash loader while checking stored session
  if (!isAuthReady) {
    return <SplashLoader />;
  }

  // Show auth flow if not authenticated OR still onboarding (quiz + connect capital)
  const showAuthFlow = !user || isOnboarding;

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: {backgroundColor: '#0F1117'},
        animation: 'slide_from_right',
      }}>
      {showAuthFlow ? (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      ) : (
        <>
          <Stack.Screen name="Main" component={MainNavigator} />
          <Stack.Screen name="AllBots" component={AllBotsScreen} />
          <Stack.Screen name="BotDetails" component={BotDetailsScreen} />
          <Stack.Screen name="BotPurchase" component={BotPurchaseScreen} />
          <Stack.Screen name="ShadowMode" component={ShadowModeScreen} />
          <Stack.Screen name="ShadowModeResults" component={ShadowModeResultsScreen} />
          <Stack.Screen name="ArenaSetup" component={ArenaSetupScreen} />
          <Stack.Screen name="ArenaLive" component={ArenaLiveScreen} />
          <Stack.Screen name="ArenaResults" component={ArenaFinalResultsScreen} />
          <Stack.Screen name="ArenaHistory" component={ArenaHistoryScreen} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} />
          <Stack.Screen name="PaperTradingSetup" component={PaperTradingSetupScreen} />
          <Stack.Screen name="NotificationSettings" component={NotificationsSettingsScreen} />
          <Stack.Screen name="TradeHistory" component={TradeHistoryScreen} />
          <Stack.Screen name="WalletFunds" component={WalletFundsScreen} />
          <Stack.Screen name="Referral" component={ReferralScreen} />
          <Stack.Screen name="ExchangeConnect" component={ExchangeConnectScreen} />
          <Stack.Screen name="ExchangeManage" component={ExchangeManageScreen} />
          <Stack.Screen name="Subscription" component={SubscriptionScreen} />
          <Stack.Screen name="PaymentMethod" component={PaymentMethodScreen} />
          <Stack.Screen name="Checkout" component={CheckoutScreen} />
          <Stack.Screen name="CreatorStudio" component={CreatorStudioScreen} />
          <Stack.Screen name="BotBuilder" component={BotBuilderScreen} />
          <Stack.Screen name="LiveTrades" component={LiveTradesScreen} />
          <Stack.Screen name="TrainingUpload" component={TrainingUploadScreen} />
          <Stack.Screen name="TradingRoom" component={TradingRoomScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="HelpSupport" component={HelpSupportScreen} />
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
        </>
      )}
    </Stack.Navigator>
  );
}
