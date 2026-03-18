import React from 'react';
import {StatusBar} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {AuthProvider} from './context/AuthContext';
import {ToastProvider} from './context/ToastContext';
import {NetworkProvider} from './context/NetworkContext';
import {IAPProvider} from './context/IAPContext';
import ErrorBoundary from './components/common/ErrorBoundary';
import AppNavigator from './navigation/AppNavigator';

export default function App() {
  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <ErrorBoundary>
        <NetworkProvider>
          <AuthProvider>
            <IAPProvider>
              <ToastProvider>
                <NavigationContainer>
                  <StatusBar barStyle="light-content" backgroundColor="#0F1117" />
                  <AppNavigator />
                </NavigationContainer>
              </ToastProvider>
            </IAPProvider>
          </AuthProvider>
        </NetworkProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
