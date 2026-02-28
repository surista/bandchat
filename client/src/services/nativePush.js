/**
 * Native push notification service for iOS/Android via Capacitor.
 * On web, falls back to the existing web push service (push.js).
 */
import { isNative } from './platform';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

let PushNotifications = null;

// Lazy-load the Capacitor plugin only in native context
async function getPushPlugin() {
  if (!PushNotifications) {
    const mod = await import('@capacitor/push-notifications');
    PushNotifications = mod.PushNotifications;
  }
  return PushNotifications;
}

class NativePushService {
  constructor() {
    this.deviceToken = null;
    this.listeners = [];
  }

  async init() {
    if (!isNative) return false;

    const Push = await getPushPlugin();

    // Check / request permission
    let permStatus = await Push.checkPermissions();
    if (permStatus.receive === 'prompt') {
      permStatus = await Push.requestPermissions();
    }
    if (permStatus.receive !== 'granted') {
      console.log('Native push permission not granted');
      return false;
    }

    // Register with APNs / FCM
    await Push.register();

    // Listen for registration success
    const regListener = await Push.addListener('registration', (token) => {
      console.log('Native push registered, token:', token.value.substring(0, 20) + '...');
      this.deviceToken = token.value;
    });
    this.listeners.push(regListener);

    // Listen for registration errors
    const errListener = await Push.addListener('registrationError', (err) => {
      console.error('Native push registration error:', err);
    });
    this.listeners.push(errListener);

    // Listen for incoming notifications while app is in foreground
    const fgListener = await Push.addListener('pushNotificationReceived', (notification) => {
      console.log('Push received in foreground:', notification);
      // Could show an in-app toast here
    });
    this.listeners.push(fgListener);

    // Listen for notification taps (app opened from notification)
    const tapListener = await Push.addListener('pushNotificationActionPerformed', (action) => {
      console.log('Push notification tapped:', action);
      // TODO: Navigate to the relevant channel/message
    });
    this.listeners.push(tapListener);

    return true;
  }

  async subscribe(accessToken) {
    if (!isNative || !this.deviceToken) {
      throw new Error('Native push not available');
    }

    const response = await fetch(`${API_URL}/push/subscribe-native`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        token: this.deviceToken,
        platform: 'ios', // Will need to detect android later
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to register native push token on server');
    }
  }

  async unsubscribe(accessToken) {
    if (!isNative || !this.deviceToken) return;

    await fetch(`${API_URL}/push/unsubscribe-native`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ token: this.deviceToken }),
    });
  }

  async cleanup() {
    for (const listener of this.listeners) {
      await listener.remove();
    }
    this.listeners = [];
  }
}

export const nativePushService = new NativePushService();
export default nativePushService;
