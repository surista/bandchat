import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import api from './api';

// Track which channel the user is currently viewing (for foreground suppression)
let activeChannelId = null;

// Configure how notifications appear when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data;
    // Suppress notification banner if user is viewing the same channel
    if (activeChannelId && data?.channelId === activeChannelId) {
      return { shouldShowAlert: false, shouldPlaySound: false, shouldSetBadge: false };
    }
    return { shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: true };
  },
});

class NotificationService {
  constructor() {
    this.expoPushToken = null;
    this.notificationListener = null;
    this.responseListener = null;
    this.onNotificationTapped = null;
  }

  async register() {
    // Push tokens only work on physical devices with a native build (not Expo Go)
    if (!Device.isDevice) {
      return null;
    }

    // Detect Expo Go — push tokens require a standalone/dev build
    const isExpoGo = Constants.appOwnership === 'expo';
    if (isExpoGo) {
      return null;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return null;
    }

    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      const tokenData = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : {}
      );
      this.expoPushToken = tokenData.data;

      // Send token to server
      try {
        await api.request('/push/expo-token', {
          method: 'POST',
          body: JSON.stringify({ token: this.expoPushToken, platform: Platform.OS }),
        });
      } catch {
        // Server may not have this endpoint yet
      }

      // Android notification channels
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'BandChat',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          sound: 'default',
        });
        await Notifications.setNotificationChannelAsync('messages', {
          name: 'Messages',
          description: 'New messages in channels and DMs',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          sound: 'default',
        });
        await Notifications.setNotificationChannelAsync('mentions', {
          name: 'Mentions',
          description: 'When someone @mentions you',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          sound: 'default',
        });
        await Notifications.setNotificationChannelAsync('events', {
          name: 'Events & Reminders',
          description: 'Gig reminders and calendar updates',
          importance: Notifications.AndroidImportance.DEFAULT,
          sound: 'default',
        });
        await Notifications.setNotificationChannelAsync('announcements', {
          name: 'Announcements & Polls',
          description: 'Band announcements and poll notifications',
          importance: Notifications.AndroidImportance.DEFAULT,
          sound: 'default',
        });
      }

      return this.expoPushToken;
    } catch {
      // Expected to fail in development — silently skip
      return null;
    }
  }

  listen(onTap) {
    this.onNotificationTapped = onTap;

    // Foreground notification received
    this.notificationListener = Notifications.addNotificationReceivedListener(notification => {
      // Notification received while app is open — handled by setNotificationHandler above
    });

    // User tapped notification
    this.responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      if (this.onNotificationTapped) {
        this.onNotificationTapped(data);
      }
    });
  }

  async unregister() {
    if (!this.expoPushToken) return;
    try {
      await api.request('/push/expo-token', {
        method: 'DELETE',
        body: JSON.stringify({ token: this.expoPushToken }),
      });
    } catch {
      // Best-effort cleanup
    }
    this.expoPushToken = null;
  }

  cleanup() {
    if (this.notificationListener) {
      this.notificationListener.remove();
    }
    if (this.responseListener) {
      this.responseListener.remove();
    }
  }

  /** Set the currently active channel (suppresses notifications for it) */
  setActiveChannel(channelId) {
    activeChannelId = channelId || null;
  }

  /** Clear the active channel */
  clearActiveChannel() {
    activeChannelId = null;
  }

  /** Clear the app icon badge */
  async clearBadge() {
    try {
      await Notifications.setBadgeCountAsync(0);
    } catch {
      // Best-effort
    }
  }

  /** Dismiss delivered notifications for a specific channel */
  async dismissChannelNotifications(channelId) {
    try {
      const delivered = await Notifications.getPresentedNotificationsAsync();
      const matching = delivered.filter(
        n => n.request.content.data?.channelId === channelId
      );
      await Promise.all(
        matching.map(n => Notifications.dismissNotificationAsync(n.request.identifier))
      );
    } catch {
      // Best-effort
    }
  }
}

export const notificationService = new NotificationService();
export default notificationService;
