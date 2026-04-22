import React, {useEffect, useRef} from 'react';
import {StatusBar, Platform} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {AuthProvider} from './context/AuthContext';
import {ToastProvider, useToast} from './context/ToastContext';
import {NetworkProvider} from './context/NetworkContext';
import {IAPProvider} from './context/IAPContext';
import ErrorBoundary from './components/common/ErrorBoundary';
import AppNavigator from './navigation/AppNavigator';
import {
  getMessaging,
  getToken,
  onMessage,
  onTokenRefresh,
  requestPermission,
  AuthorizationStatus,
} from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {API_BASE_URL} from './config/api';

type PushKind = 'trade' | 'system' | 'alert' | 'unknown';
type ToastKind = 'success' | 'error' | 'info' | 'warning';

const FOREGROUND_DEDUP_WINDOW_MS = 2500;

function mapPushToToast(kind: PushKind, title?: string): ToastKind {
  if (kind === 'trade') return 'success';
  if (kind === 'alert') return 'warning';
  if (kind === 'system') return 'info';

  const t = (title ?? '').toLowerCase();
  if (t.includes('error') || t.includes('failed') || t.includes('invalid')) return 'error';
  if (t.includes('warning') || t.includes('risk') || t.includes('limit')) return 'warning';
  if (t.includes('filled') || t.includes('executed') || t.includes('profit')) return 'success';
  return 'info';
}

function PushNotificationSetup() {
  const {alert: showAlert} = useToast();
  const seenRef = useRef<Record<string, number>>({});

  useEffect(() => {
    let unsubForeground: (() => void) | undefined;

    async function getTokenWithRetry(msg: any, maxRetries = 5): Promise<string | null> {
      for (let i = 0; i < maxRetries; i++) {
        try {
          const token = await getToken(msg);
          if (token) return token;
        } catch (err) {
          console.log(`[Push] Token attempt ${i + 1}/${maxRetries} failed:`, (err as Error).message?.slice(0, 60));
          await new Promise<void>(r => setTimeout(r, 3000 * Math.pow(2, i)));
        }
      }
      return null;
    }

    async function setup() {
      try {
        const msg = getMessaging();

        // Request permission (modular API)
        const authStatus = await requestPermission(msg);
        const enabled = authStatus === AuthorizationStatus.AUTHORIZED ||
          authStatus === AuthorizationStatus.PROVISIONAL;
        console.log('[Push] Permission:', enabled);
        if (!enabled) return;

        // Get FCM token with retry
        const token = await getTokenWithRetry(msg);
        console.log('[Push] FCM token:', token?.slice(0, 30));

        if (token) {
          const accessToken = await AsyncStorage.getItem('@auth_access_token');
          if (accessToken) {
            await fetch(`${API_BASE_URL}/user/fcm-token`, {
              method: 'POST',
              headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}`},
              body: JSON.stringify({token}),
            });
            console.log('[Push] Token registered with backend');
          }
        }

        // Foreground messages (modular API)
        unsubForeground = onMessage(msg, async (remoteMessage: any) => {
          const title = remoteMessage.notification?.title || remoteMessage.data?.title || 'New notification';
          const body = remoteMessage.notification?.body || remoteMessage.data?.body || '';

          const rawType = (String(remoteMessage.data?.type ?? 'unknown')).toLowerCase();
          const kind: PushKind =
            rawType === 'trade' || rawType === 'system' || rawType === 'alert'
              ? (rawType as PushKind)
              : 'unknown';

          const dedupKey = `${kind}|${title}|${body}`;
          const now = Date.now();
          const lastShown = seenRef.current[dedupKey] || 0;
          if (now - lastShown < FOREGROUND_DEDUP_WINDOW_MS) return;
          seenRef.current[dedupKey] = now;

          const toastType = mapPushToToast(kind, String(title));
          const duration = kind === 'alert' ? 6000 : 4200;
          showAlert(String(title), String(body), toastType, duration);
        });

        // Token refresh (modular API)
        onTokenRefresh(msg, async newToken => {
          const accessToken = await AsyncStorage.getItem('@auth_access_token');
          if (accessToken) {
            await fetch(`${API_BASE_URL}/user/fcm-token`, {
              method: 'POST',
              headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}`},
              body: JSON.stringify({token: newToken}),
            }).catch(() => {});
          }
        });
      } catch (err) {
        console.warn('[Push] Setup error:', err);
      }
    }

    const timer = setTimeout(setup, 3000);
    return () => { clearTimeout(timer); unsubForeground?.(); };
  }, [showAlert]);

  return null;
}

export default function App() {
  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <ErrorBoundary>
        <NetworkProvider>
          <AuthProvider>
            <ToastProvider>
              <IAPProvider>
                <NavigationContainer>
                  <StatusBar barStyle="light-content" backgroundColor="#0F1117" />
                  <PushNotificationSetup />
                  <AppNavigator />
                </NavigationContainer>
              </IAPProvider>
            </ToastProvider>
          </AuthProvider>
        </NetworkProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
