import React, {createContext, useContext, useState, useCallback, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Dimensions,
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

interface ToastContextType {
  showToast: (type: ToastType, title: string, message?: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType>({
  showToast: () => {},
});

export const useToast = () => useContext(ToastContext);

// ─── Icons ──────────────────────────────────────────────────────────────────

function SuccessIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} fill="#10B981" opacity={0.2} />
      <Circle cx={12} cy={12} r={10} stroke="#10B981" strokeWidth={1.5} />
      <Path d="M8 12l3 3 5-6" stroke="#10B981" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ErrorIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} fill="#EF4444" opacity={0.2} />
      <Circle cx={12} cy={12} r={10} stroke="#EF4444" strokeWidth={1.5} />
      <Path d="M15 9l-6 6M9 9l6 6" stroke="#EF4444" strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function InfoIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} fill="#0D7FF2" opacity={0.2} />
      <Circle cx={12} cy={12} r={10} stroke="#0D7FF2" strokeWidth={1.5} />
      <Path d="M12 16v-4M12 8h.01" stroke="#0D7FF2" strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function WarningIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} fill="#F59E0B" opacity={0.2} />
      <Circle cx={12} cy={12} r={10} stroke="#F59E0B" strokeWidth={1.5} />
      <Path d="M12 8v5M12 16h.01" stroke="#F59E0B" strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

const ICON_MAP: Record<ToastType, React.FC> = {
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
    }, toast.duration || 3000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View style={[styles.toast, {
      backgroundColor: BG_MAP[toast.type],
      borderColor: BORDER_MAP[toast.type],
      transform: [{translateY}],
      opacity,
    }]}>
      {/* Accent bar */}
      <View style={[styles.accentBar, {backgroundColor: accent}]} />

      <View style={styles.toastContent}>
        <Icon />
        <View style={styles.toastText}>
          <Text style={styles.toastTitle} numberOfLines={1}>{toast.title}</Text>
          {toast.message ? (
            <Text style={styles.toastMessage} numberOfLines={2}>{toast.message}</Text>
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

// ─── Provider ──────────────────────────────────────────────────────────────

export function ToastProvider({children}: {children: React.ReactNode}) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const idRef = useRef(0);

  const showToast = useCallback((type: ToastType, title: string, message?: string, duration?: number) => {
    const id = ++idRef.current;
    setToasts(prev => [...prev.slice(-2), {id, type, title, message, duration}]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{showToast}}>
      {children}
      <View style={styles.container} pointerEvents="box-none">
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
        ))}
      </View>
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
    // Shadow
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
