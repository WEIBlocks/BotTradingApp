import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

const options = {
  enableVibrateFallback: true,
  ignoreAndroidSystemSettings: false,
};

export const haptics = {
  /** Light tap — tab switches, toggles, chip selection */
  light() {
    try {
      ReactNativeHapticFeedback.trigger('impactLight', options);
    } catch {}
  },

  /** Medium tap — button presses, confirmations */
  medium() {
    try {
      ReactNativeHapticFeedback.trigger('impactMedium', options);
    } catch {}
  },

  /** Success — purchase complete, bot activated */
  success() {
    try {
      ReactNativeHapticFeedback.trigger('notificationSuccess', options);
    } catch {}
  },

  /** Error — validation failure, action denied */
  error() {
    try {
      ReactNativeHapticFeedback.trigger('notificationError', options);
    } catch {}
  },

  /** Warning — destructive action confirmation */
  warning() {
    try {
      ReactNativeHapticFeedback.trigger('notificationWarning', options);
    } catch {}
  },
};
