import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';

export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);
  const [visible, setVisible] = useState(false);
  const [slideAnim] = useState(() => new Animated.Value(-120));
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const offline = !state.isConnected || state.isInternetReachable === false;
      setIsOffline(offline);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isOffline) {
      setVisible(true);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: -120,
        duration: 300,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setVisible(false);
      });
    }
  }, [isOffline, slideAnim]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[styles.banner, { paddingTop: insets.top + 8, transform: [{ translateY: slideAnim }] }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      accessibilityLabel="No internet connection"
    >
      <Text style={styles.text}>No internet connection</Text>
    </Animated.View>
  );
}

// Colors are intentionally hardcoded — red/white is semantically correct
// for an error banner regardless of the active theme.
const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#ef4444',
    paddingBottom: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  text: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
});
