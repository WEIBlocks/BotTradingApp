/**
 * Push Notification Service — Modular API (v23+)
 */

import {
  getMessaging,
  getToken,
  onMessage,
  onTokenRefresh,
  requestPermission,
  AuthorizationStatus,
  getInitialNotification,
  onNotificationOpenedApp as onNotifOpened,
} from '@react-native-firebase/messaging';
import {Platform, PermissionsAndroid} from 'react-native';
import {api} from './api';

async function requestNotificationPermission(): Promise<boolean> {
  try {
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) return false;
    }
    const msg = getMessaging();
    const authStatus = await requestPermission(msg);
    return authStatus === AuthorizationStatus.AUTHORIZED ||
      authStatus === AuthorizationStatus.PROVISIONAL;
  } catch {
    return false;
  }
}

async function registerToken(): Promise<string | null> {
  try {
    const msg = getMessaging();
    const token = await getToken(msg);
    if (!token) return null;
    try { await api.post('/user/fcm-token', {token}); } catch {}
    return token;
  } catch {
    return null;
  }
}

export async function initPushNotifications(): Promise<string | null> {
  const hasPermission = await requestNotificationPermission();
  if (!hasPermission) return null;
  return registerToken();
}

export const pushNotifications = {
  init: initPushNotifications,
  requestPermission: requestNotificationPermission,
  registerToken,
};
