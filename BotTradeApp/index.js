import {AppRegistry, Platform} from 'react-native';
import App from './src/App';
import {name as appName} from './app.json';

// Handle background/quit push notifications (modular API v23+)
// Only register on Android - iOS handles background messages natively via AppDelegate
if (Platform.OS === 'android') {
  const {getMessaging, setBackgroundMessageHandler} = require('@react-native-firebase/messaging');
  setBackgroundMessageHandler(getMessaging(), async remoteMessage => {
    console.log('[FCM] Background message:', remoteMessage.notification?.title);
  });
}

AppRegistry.registerComponent(appName, () => App);
