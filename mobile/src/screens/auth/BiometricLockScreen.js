import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useLayout } from '../../hooks/useLayout';

export default function BiometricLockScreen() {
  const { unlockApp, logout } = useAuth()
  const { isTablet } = useLayout();
  const { colors } = useTheme();
  const [authenticating, setAuthenticating] = useState(false);
  const [failed, setFailed] = useState(false);

  const authenticate = useCallback(async () => {
    setAuthenticating(true);
    setFailed(false);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock BandChat',
        fallbackLabel: 'Use Password',
        disableDeviceFallback: true,
        cancelLabel: 'Cancel',
      });
      if (result.success) {
        unlockApp();
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      setAuthenticating(false);
    }
  }, [unlockApp]);

  useEffect(() => {
    // Small delay so the screen renders before the biometric prompt
    const timer = setTimeout(authenticate, 300);
    return () => clearTimeout(timer);
  }, [authenticate]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]}>
      <View style={styles.content}>
        <Image
          source={require('../../../assets/icon.png')}
          style={styles.icon}
          accessibilityLabel="BandChat icon"
        />
        <Text
          style={[styles.title, { color: colors.textPrimary }]}
          accessibilityRole="header"
          maxFontSizeMultiplier={1.5}
        >
          Unlock BandChat
        </Text>
        <Text
          style={[styles.subtitle, { color: colors.textSecondary }]}
          accessibilityLiveRegion={failed ? 'assertive' : 'polite'}
          maxFontSizeMultiplier={1.6}
        >
          {authenticating ? 'Authenticating...' : failed ? 'Authentication failed' : 'Tap below to unlock'}
        </Text>

        {authenticating && (
          <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
        )}

        {failed && (
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            onPress={authenticate}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Text style={[styles.retryButtonText, { color: colors.primaryText }]} maxFontSizeMultiplier={1.4}>Try Again</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.fallbackButton, { borderColor: colors.border }]}
          onPress={logout}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Use password instead"
        >
          <Text
            style={[styles.fallbackButtonText, { color: colors.textSecondary }]}
            maxFontSizeMultiplier={1.4}
          >
            Use Password
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  tabletContainer: { maxWidth: 500, width: '100%', alignSelf: 'center' },
  content: {
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  icon: {
    width: 80,
    height: 80,
    borderRadius: 18,
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    marginBottom: 32,
  },
  spinner: {
    marginBottom: 24,
  },
  retryButton: {
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 10,
    marginBottom: 16,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  fallbackButton: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
  },
  fallbackButtonText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
