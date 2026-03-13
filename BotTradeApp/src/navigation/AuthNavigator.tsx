import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {AuthStackParamList} from '../types';
import {useAuth} from '../context/AuthContext';

import WelcomeScreen from '../screens/auth/WelcomeScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import CreateAccountScreen from '../screens/auth/CreateAccountScreen';
import InvestorQuizScreen from '../screens/auth/InvestorQuizScreen';
import ConnectCapitalScreen from '../screens/auth/ConnectCapitalScreen';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthNavigator() {
  const {user, isOnboarding} = useAuth();

  // User is logged in but hasn't completed onboarding — only show quiz screens
  const onboardingOnly = !!(user && isOnboarding);

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: {backgroundColor: '#0F1117'},
        animation: 'slide_from_right',
      }}>
      {onboardingOnly ? (
        <>
          <Stack.Screen name="InvestorQuiz" component={InvestorQuizScreen} />
          <Stack.Screen name="ConnectCapital" component={ConnectCapitalScreen} />
        </>
      ) : (
        <>
          <Stack.Screen name="Welcome" component={WelcomeScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="CreateAccount" component={CreateAccountScreen} />
          <Stack.Screen name="InvestorQuiz" component={InvestorQuizScreen} />
          <Stack.Screen name="ConnectCapital" component={ConnectCapitalScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}
