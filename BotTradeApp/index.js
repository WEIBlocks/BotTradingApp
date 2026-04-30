import {AppRegistry} from 'react-native';
import App from './src/App';
import {name as appName} from './app.json';

// Handle background/quit push notifications (required on both platforms)
const {getMessaging, setBackgroundMessageHandler} = require('@react-native-firebase/messaging');
setBackgroundMessageHandler(getMessaging(), async remoteMessage => {
  console.log('[FCM] Background message:', remoteMessage.notification?.title);
});

AppRegistry.registerComponent(appName, () => App);
