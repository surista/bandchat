const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

class PushService {
  constructor() {
    this.swRegistration = null;
    this.isSupported = 'serviceWorker' in navigator && 'PushManager' in window;
  }

  async init() {
    if (!this.isSupported) {
      console.log('Push notifications not supported');
      return false;
    }

    try {
      this.swRegistration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker registered');
      return true;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      return false;
    }
  }

  async getVapidKey() {
    try {
      const response = await fetch(`${API_URL}/push/vapid-key`);
      if (!response.ok) return null;
      const data = await response.json();
      return data.publicKey;
    } catch {
      return null;
    }
  }

  async subscribe(accessToken) {
    if (!this.swRegistration) {
      await this.init();
    }

    if (!this.swRegistration) {
      throw new Error('Service Worker not registered');
    }

    // Check if already subscribed
    const existingSubscription = await this.swRegistration.pushManager.getSubscription();
    if (existingSubscription) {
      // Send to server in case it's a new device
      await this.sendSubscriptionToServer(existingSubscription, accessToken);
      return existingSubscription;
    }

    // Get VAPID key from server
    const vapidKey = await this.getVapidKey();
    if (!vapidKey) {
      throw new Error('Push notifications not configured on server');
    }

    // Request permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Notification permission denied');
    }

    // Subscribe to push
    const subscription = await this.swRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: this.urlBase64ToUint8Array(vapidKey)
    });

    // Send subscription to server
    await this.sendSubscriptionToServer(subscription, accessToken);

    return subscription;
  }

  async unsubscribe(accessToken) {
    if (!this.swRegistration) return;

    const subscription = await this.swRegistration.pushManager.getSubscription();
    if (!subscription) return;

    // Unsubscribe from push manager
    await subscription.unsubscribe();

    // Remove from server
    await fetch(`${API_URL}/push/unsubscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({ endpoint: subscription.endpoint })
    });
  }

  async sendSubscriptionToServer(subscription, accessToken) {
    const response = await fetch(`${API_URL}/push/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: this.arrayBufferToBase64(subscription.getKey('p256dh')),
          auth: this.arrayBufferToBase64(subscription.getKey('auth'))
        }
      })
    });

    if (!response.ok) {
      throw new Error('Failed to save subscription on server');
    }
  }

  async isSubscribed() {
    if (!this.swRegistration) {
      await this.init();
    }
    if (!this.swRegistration) return false;

    const subscription = await this.swRegistration.pushManager.getSubscription();
    return !!subscription;
  }

  async getPermissionState() {
    if (!this.isSupported) return 'unsupported';
    return Notification.permission;
  }

  // Helper: Convert VAPID key to Uint8Array
  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // Helper: Convert ArrayBuffer to base64
  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }
}

export const pushService = new PushService();
export default pushService;
