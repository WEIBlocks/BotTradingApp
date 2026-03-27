import {AppRegistry} from 'react-native';
import {getMessaging, setBackgroundMessageHandler} from '@react-native-firebase/messaging';
import App from './src/App';
import {name as appName} from './app.json';

// Handle background/quit push notifications (modular API v23+)
setBackgroundMessageHandler(getMessaging(), async remoteMessage => {
  console.log('[FCM] Background message:', remoteMessage.notification?.title);
});

AppRegistry.registerComponent(appName, () => App);
