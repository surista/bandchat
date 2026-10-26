import { Modal, View, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import Constants from 'expo-constants';
import { useTheme } from '../context/ThemeContext';

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

  const handleMessage = (event) => {
    let data;
    try {
      data = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (data.type === 'verify' && data.token) {
      onVerify(data.token);
    } else if (data.type === 'error' || data.type === 'expire') {
      onClose();
    }
  };

  // Only the initial inline-HTML load (reported as about:blank/data: by
  // different WebView engines) and Cloudflare's own challenge origin are
  // legitimate here -- reject any other top-level navigation. If the
  // Cloudflare script were ever compromised or MITM'd, this stops it from
  // redirecting the WebView to an arbitrary attacker URL inside the signup
  // flow's modal.
  const handleShouldStartLoad = (request) => {
    const { url } = request;
    return (
      url.startsWith('about:blank') ||
      url.startsWith('data:') ||
      url.startsWith('https://challenges.cloudflare.com/')
    );
  };

  if (!SITE_KEY) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.bgSecondary }]}>
          <WebView
            source={{ html: buildHtml(SITE_KEY) }}
            onMessage={handleMessage}
            style={styles.webview}
            startInLoadingState
            renderLoading={() => <ActivityIndicator style={StyleSheet.absoluteFill} color={colors.primary} />}
            scrollEnabled={false}
            originWhitelist={['about:blank', 'https://challenges.cloudflare.com']}
            onShouldStartLoadWithRequest={handleShouldStartLoad}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  card: { width: 320, height: 160, borderRadius: 12, overflow: 'hidden' },
  webview: { flex: 1, backgroundColor: 'transparent' },
});
