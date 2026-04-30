import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  ViewStyle,
  StyleProp,
  ScrollViewProps,
  KeyboardAvoidingViewProps,
} from 'react-native';

// Mirrors the pattern used in LoginScreen / CreateAccountScreen so the on-screen
// keyboard never hides the submit button on either platform.
//
//   <KeyboardAware>
//     {/* TextInputs and submit button */}
//   </KeyboardAware>
//
// For modals, pass `inModal` so the bottom sheet content scrolls under the
// keyboard correctly on Android (where Modal sits in its own window and the
// adjustResize/adjustPan behavior differs).

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** When the wrapper sits inside a Modal. Tweaks Android offset. */
  inModal?: boolean;
  /** Override KeyboardAvoidingView behavior (rarely needed). */
  behavior?: KeyboardAvoidingViewProps['behavior'];
  /** Optional vertical offset (e.g., when a sticky header is above this view). */
  keyboardVerticalOffset?: number;
  scrollViewProps?: Omit<ScrollViewProps, 'children'>;
};

export default function KeyboardAware({
  children,
  style,
  contentContainerStyle,
  inModal = false,
  behavior,
  keyboardVerticalOffset,
  scrollViewProps,
}: Props) {
  // iOS: 'padding' shifts the layout up. Android: 'height' lets adjustResize do its job.
  const resolvedBehavior = behavior ?? (Platform.OS === 'ios' ? 'padding' : 'height');
  const resolvedOffset =
    keyboardVerticalOffset ?? (Platform.OS === 'ios' ? (inModal ? 0 : 0) : 0);

  return (
    <KeyboardAvoidingView
      style={[styles.flex, style]}
      behavior={resolvedBehavior}
      keyboardVerticalOffset={resolvedOffset}>
      <ScrollView
        contentContainerStyle={contentContainerStyle}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        {...scrollViewProps}>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
});
