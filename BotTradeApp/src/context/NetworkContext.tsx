import React, {createContext, useContext, useState, useEffect, useRef} from 'react';
import {Text, StyleSheet, Animated} from 'react-native';

interface NetworkContextType {
  isConnected: boolean;
}

const NetworkContext = createContext<NetworkContextType>({isConnected: true});

export const useNetwork = () => useContext(NetworkContext);

let NetInfo: any = null;
try {
  NetInfo = require('@react-native-community/netinfo').default;
} catch {}

export function NetworkProvider({children}: {children: React.ReactNode}) {
  const [isConnected, setIsConnected] = useState(true);
  const [showBanner, setShowBanner] = useState(false);
  const translateY = useRef(new Animated.Value(-50)).current;

  useEffect(() => {
    // If native module is not available, skip network monitoring
    if (!NetInfo || !NetInfo.addEventListener) {
      return;
    }

    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = NetInfo.addEventListener((state: any) => {
        const connected = state.isConnected ?? true;
        setIsConnected(connected);
        if (!connected) {
          setShowBanner(true);
          Animated.spring(translateY, {toValue: 0, useNativeDriver: true, tension: 80, friction: 12}).start();
        } else if (showBanner) {
          setTimeout(() => {
            Animated.timing(translateY, {toValue: -50, duration: 300, useNativeDriver: true}).start(() => {
              setShowBanner(false);
            });
          }, 2000);
        }
      });
    } catch {
      // Native module not linked — silently skip
    }
    return () => unsubscribe?.();
  }, [showBanner]);

  return (
    <NetworkContext.Provider value={{isConnected}}>
      {children}
      {showBanner && (
        <Animated.View style={[styles.banner, {
          backgroundColor: isConnected ? '#10B981' : '#EF4444',
          transform: [{translateY}],
        }]}>
          <Text style={styles.bannerText}>
            {isConnected ? 'Back online' : 'No internet connection'}
          </Text>
        </Animated.View>
      )}
    </NetworkContext.Provider>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 44,
    paddingBottom: 8,
    alignItems: 'center',
    zIndex: 9998,
    elevation: 9998,
  },
  bannerText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    color: '#FFFFFF',
  },
});
