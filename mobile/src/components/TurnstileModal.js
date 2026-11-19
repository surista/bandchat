import { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import Constants from 'expo-constants';
import { useTheme } from '../context/ThemeContext';
import { APP_BASE_URL } from '../utils/constants';
import { MIN_TOUCH_TARGET } from '../utils/touchTarget';

const SITE_KEY = Constants.expoConfig?.extra?.turnstileSiteKey || '';

// Mirrors the web TurnstileWidget: when no site key is configured, signup
// works unmodified (no challenge shown) until Turnstile is actually set up.
export const TURNSTILE_ENABLED = Boolean(SITE_KEY);

const buildHtml = (siteKey) => `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
  <style>
    html, body { margin: 0; padding: 0; background: transparent; }
    body { display: flex; align-items: center; justify-content: center; height: 100vh; }
  </style>
</head>
<body>
  <div class="cf-turnstile"
    data-sitekey="${siteKey}"
    data-callback="onVerify"
    data-error-callback="onError"
    data-expired-callback="onExpire"></div>
  <script>
    function onVerify(token) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'verify', token: token }));
    }
    function onError() {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error' }));
    }
    function onExpire() {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'expire' }));
    }
  </script>
</body>
</html>`;

/**
 * Shown after tapping "Create Account" when Turnstile is configured.
 * Posts the verification token back via onVerify once the challenge
 * completes (usually automatic, occasionally an interactive puzzle).
 */
export default function TurnstileModal({ visible, onVerify, onClose }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  // Remounts the WebView for a fresh challenge on each open / retry.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (visible) {
      setFailed(false);
      setAttempt((a) => a + 1);
    }
  }, [visible]);

  const handleMessage = (event) => {
    let data;
    try {
      data = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (data.type === 'verify' && data.token) {
      onVerify(data.token);
    } else if (data.type === 'error') {
      // Don't silently close -- tell the user and let them retry or cancel.
      setFailed(true);
    } else if (data.type === 'expire') {
      setAttempt((a) => a + 1);
    }
  };

  const retry = () => {
    setFailed(false);
    setAttempt((a) => a + 1);
  };

  // Only the initial inline-HTML load (reported as about:blank/data: or as
  // the baseUrl, depending on WebView engine) and Cloudflare's own challenge
  // origin are legitimate here -- reject any other top-level navigation. If the
  // Cloudflare script were ever compromised or MITM'd, this stops it from
  // redirecting the WebView to an arbitrary attacker URL inside the signup
  // flow's modal.
  const handleShouldStartLoad = (request) => {
    const { url } = request;
    return (
      url.startsWith('about:blank') ||
      url.startsWith('data:') ||
      url === APP_BASE_URL ||
      url === `${APP_BASE_URL}/` ||
      url.startsWith('https://challenges.cloudflare.com/')
    );
  };

  if (!SITE_KEY) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.bgSecondary }]}>
          {failed ? (
            <View style={styles.errorBody} accessibilityLiveRegion="polite">
              <Text style={[styles.errorText, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.5}>
                Verification couldn't be completed. Check your connection and try again.
              </Text>
            </View>
          ) : (
            <WebView
              key={attempt}
              // Turnstile only runs on hostnames in the site key's allowlist.
              // Inline HTML with no baseUrl is served from about:blank, which
              // is never on it -- so load it as the web app's own origin.
              source={{ html: buildHtml(SITE_KEY), baseUrl: APP_BASE_URL }}
              onMessage={handleMessage}
              onError={() => setFailed(true)}
              style={styles.webview}
              startInLoadingState
              renderLoading={() => <ActivityIndicator style={StyleSheet.absoluteFill} color={colors.primary} />}
              scrollEnabled={false}
              originWhitelist={['about:blank', APP_BASE_URL, 'https://challenges.cloudflare.com']}
              onShouldStartLoadWithRequest={handleShouldStartLoad}
            />
          )}
          <View style={[styles.actions, { borderTopColor: colors.border }]}>
            <Pressable
              onPress={onClose}
              style={styles.actionButton}
              accessibilityRole="button"
              accessibilityLabel="Cancel verification"
            >
              <Text style={[styles.actionText, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.5}>Cancel</Text>
            </Pressable>
            {failed && (
              <Pressable
                onPress={retry}
                style={styles.actionButton}
                accessibilityRole="button"
                accessibilityLabel="Retry verification"
              >
                <Text style={[styles.actionText, { color: colors.primary }]} maxFontSizeMultiplier={1.5}>Try Again</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  card: { width: 320, borderRadius: 12, overflow: 'hidden' },
  webview: { height: 160, backgroundColor: 'transparent' },
  errorBody: { height: 160, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  errorText: { fontSize: 15, textAlign: 'center' },
  actions: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  actionButton: { flex: 1, minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 17, fontWeight: '600' },
});
