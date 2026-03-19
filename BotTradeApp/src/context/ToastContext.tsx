import React, {createContext, useContext, useState, useCallback, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Dimensions,
  Modal,
} from 'react-native';
import Svg, {Path, Circle} from 'react-native-svg';

const {width} = Dimensions.get('window');

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastMessage {
  id: number;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ConfirmDialog {
  title: string;
  message: string;
  type?: ToastType;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  destructive?: boolean;
}

interface ToastContextType {
  showToast: (type: ToastType, title: string, message?: string, duration?: number) => void;
  showConfirm: (opts: ConfirmDialog) => void;
  /** Drop-in replacement for Alert.alert — auto-detects type from title */
  alert: (title: string, message?: string, type?: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType>({
  showToast: () => {},
  showConfirm: () => {},
  alert: () => {},
});

export const useToast = () => useContext(ToastContext);

// ─── Icons ──────────────────────────────────────────────────────────────────

function SuccessIcon({size = 20}: {size?: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} fill="#10B981" opacity={0.2} />
      <Circle cx={12} cy={12} r={10} stroke="#10B981" strokeWidth={1.5} />
      <Path d="M8 12l3 3 5-6" stroke="#10B981" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ErrorIcon({size = 20}: {size?: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} fill="#EF4444" opacity={0.2} />
      <Circle cx={12} cy={12} r={10} stroke="#EF4444" strokeWidth={1.5} />
      <Path d="M15 9l-6 6M9 9l6 6" stroke="#EF4444" strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function InfoIcon({size = 20}: {size?: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} fill="#0D7FF2" opacity={0.2} />
      <Circle cx={12} cy={12} r={10} stroke="#0D7FF2" strokeWidth={1.5} />
      <Path d="M12 16v-4M12 8h.01" stroke="#0D7FF2" strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function WarningIcon({size = 20}: {size?: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} fill="#F59E0B" opacity={0.2} />
      <Circle cx={12} cy={12} r={10} stroke="#F59E0B" strokeWidth={1.5} />
      <Path d="M12 8v5M12 16h.01" stroke="#F59E0B" strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

const ICON_MAP: Record<ToastType, React.FC<{size?: number}>> = {
  success: SuccessIcon,
  error: ErrorIcon,
  info: InfoIcon,
  warning: WarningIcon,
};

const ACCENT_MAP: Record<ToastType, string> = {
  success: '#10B981',
  error: '#EF4444',
  info: '#0D7FF2',
  warning: '#F59E0B',
};

const BG_MAP: Record<ToastType, string> = {
  success: 'rgba(16,185,129,0.08)',
  error: 'rgba(239,68,68,0.08)',
  info: 'rgba(13,127,242,0.08)',
  warning: 'rgba(245,158,11,0.08)',
};

const BORDER_MAP: Record<ToastType, string> = {
  success: 'rgba(16,185,129,0.25)',
  error: 'rgba(239,68,68,0.25)',
  info: 'rgba(13,127,242,0.25)',
  warning: 'rgba(245,158,11,0.25)',
};

// ─── Auto-detect toast type from title keywords ─────────────────────────────

function detectType(title: string): ToastType {
  const t = title.toLowerCase();
  if (t.includes('error') || t.includes('fail') || t.includes('invalid') || t.includes('missing')) return 'error';
  if (t.includes('success') || t.includes('complete') || t.includes('active') || t.includes('connected') || t.includes('published') || t.includes('saved') || t.includes('deployed') || t.includes('restored') || t.includes('created') || t.includes('sent') || t.includes('copied') || t.includes('paused') || t.includes('stopped')) return 'success';
  if (t.includes('warning') || t.includes('caution')) return 'warning';
  return 'info';
}

// ─── Single Toast Item ──────────────────────────────────────────────────────

function ToastItem({toast, onDismiss}: {toast: ToastMessage; onDismiss: (id: number) => void}) {
  const translateY = useRef(new Animated.Value(-80)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const Icon = ICON_MAP[toast.type];
  const accent = ACCENT_MAP[toast.type];

  React.useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, {toValue: 0, useNativeDriver: true, tension: 80, friction: 12}),
      Animated.timing(opacity, {toValue: 1, duration: 200, useNativeDriver: true}),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, {toValue: -80, duration: 250, useNativeDriver: true}),
        Animated.timing(opacity, {toValue: 0, duration: 250, useNativeDriver: true}),
      ]).start(() => onDismiss(toast.id));
    }, toast.duration || 3500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View style={[styles.toast, {
      backgroundColor: BG_MAP[toast.type],
      borderColor: BORDER_MAP[toast.type],
      transform: [{translateY}],
      opacity,
    }]}>
      <View style={[styles.accentBar, {backgroundColor: accent}]} />
      <View style={styles.toastContent}>
        <Icon />
        <View style={styles.toastText}>
          <Text style={styles.toastTitle} numberOfLines={1}>{toast.title}</Text>
          {toast.message ? (
            <Text style={styles.toastMessage} numberOfLines={3}>{toast.message}</Text>
          ) : null}
        </View>
        <TouchableOpacity onPress={() => onDismiss(toast.id)} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Path d="M18 6L6 18M6 6l12 12" stroke="rgba(255,255,255,0.3)" strokeWidth={2} strokeLinecap="round" />
          </Svg>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ─── Confirm Dialog Component ───────────────────────────────────────────────

function ConfirmDialogModal({
  dialog,
  onClose,
}: {
  dialog: ConfirmDialog | null;
  onClose: () => void;
}) {
  if (!dialog) return null;

  const type = dialog.type || 'warning';
  const accent = ACCENT_MAP[type];
  const Icon = ICON_MAP[type];

  const handleConfirm = () => {
    onClose();
    dialog.onConfirm();
  };

  const handleCancel = () => {
    onClose();
    dialog.onCancel?.();
  };

  return (
    <Modal transparent animationType="fade" visible={!!dialog} onRequestClose={handleCancel}>
      <View style={confirmStyles.overlay}>
        <View style={confirmStyles.card}>
          {/* Accent bar */}
          <View style={[confirmStyles.accentBar, {backgroundColor: accent}]} />

          {/* Icon + Title */}
          <View style={confirmStyles.header}>
            <Icon size={28} />
            <Text style={confirmStyles.title}>{dialog.title}</Text>
          </View>

          {/* Message */}
          <Text style={confirmStyles.message}>{dialog.message}</Text>

          {/* Buttons */}
          <View style={confirmStyles.buttons}>
            <TouchableOpacity
              style={confirmStyles.cancelBtn}
              activeOpacity={0.7}
              onPress={handleCancel}>
              <Text style={confirmStyles.cancelText}>{dialog.cancelText || 'Cancel'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                confirmStyles.confirmBtn,
                {backgroundColor: dialog.destructive ? '#EF4444' : accent},
              ]}
              activeOpacity={0.7}
              onPress={handleConfirm}>
              <Text style={confirmStyles.confirmText}>{dialog.confirmText || 'Confirm'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const confirmStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#161B22',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 20,
  },
  accentBar: {
    height: 3,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  title: {
    fontFamily: 'Inter-Bold',
    fontSize: 17,
    color: '#FFFFFF',
    flex: 1,
  },
  message: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 20,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  buttons: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cancelText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
  },
  confirmBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmText: {
    fontFamily: 'Inter-Bold',
    fontSize: 14,
    color: '#FFFFFF',
  },
});

// ─── Provider ──────────────────────────────────────────────────────────────

export function ToastProvider({children}: {children: React.ReactNode}) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog | null>(null);
  const idRef = useRef(0);

  const showToast = useCallback((type: ToastType, title: string, message?: string, duration?: number) => {
    const id = ++idRef.current;
    setToasts(prev => [...prev.slice(-2), {id, type, title, message, duration}]);
  }, []);

  const showConfirm = useCallback((opts: ConfirmDialog) => {
    setConfirmDialog(opts);
  }, []);

  const alert = useCallback((title: string, message?: string, type?: ToastType, duration?: number) => {
    const resolvedType = type || detectType(title);
    showToast(resolvedType, title, message, duration);
  }, [showToast]);

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const closeConfirm = useCallback(() => {
    setConfirmDialog(null);
  }, []);

  return (
    <ToastContext.Provider value={{showToast, showConfirm, alert}}>
      {children}
      <View style={styles.container} pointerEvents="box-none">
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
        ))}
      </View>
      <ConfirmDialogModal dialog={confirmDialog} onClose={closeConfirm} />
    </ToastContext.Provider>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
    elevation: 9999,
  },
  toast: {
    width: width - 32,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  accentBar: {
    height: 3,
    width: '100%',
  },
  toastContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
    backgroundColor: '#161B22',
  },
  toastText: {
    flex: 1,
  },
  toastTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  toastMessage: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 2,
    lineHeight: 17,
  },
});
