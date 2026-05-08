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
    this.tokenRefreshListener = null;
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

      // Send token to server. Logged on failure so a 401 (running before auth
      // is restored) or 5xx is visible — AuthContext's user-id useEffect retries
      // when auth state lands.
      await api.request('/push/expo-token', {
        method: 'POST',
        body: JSON.stringify({ token: this.expoPushToken, platform: Platform.OS }),
      }).catch(err => console.warn('[push] token POST failed:', err?.message));

      // Listen for device token refresh (e.g., after reinstall, token rotation)
      // When the device token changes, re-fetch the Expo push token and update the server
      if (!this.tokenRefreshListener) {
        this.tokenRefreshListener = Notifications.addPushTokenListener(async () => {
          try {
            const projectId = Constants.expoConfig?.extra?.eas?.projectId;
            const tokenData = await Notifications.getExpoPushTokenAsync(
              projectId ? { projectId } : {}
            );
            const newToken = tokenData.data;
            if (newToken && newToken !== this.expoPushToken) {
              this.expoPushToken = newToken;
              await api.request('/push/expo-token', {
                method: 'POST',
                body: JSON.stringify({ token: newToken, platform: Platform.OS }),
              });
            }
          } catch {
            // Best-effort — register() will retry on next app launch
          }
        });
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
    } catch (err) {
      // Don't swallow: some failure modes (Expo project misconfig, no FCM
      // credentials on Android) are silent in dev but break prod notifications.
      console.warn('[push] register failed:', err?.message);
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

  /**
   * Unregister push tokens on logout.
   * Sends DELETE with no token so the server purges ALL of this user's tokens
   * (including rotated-but-still-valid ones that never got explicitly revoked).
   * Prevents a logged-out user's pushes from ever landing on a device where a
   * different user has since signed in.
   */
  async unregister() {
    try {
      await api.request('/push/expo-token', {
        method: 'DELETE',
        body: JSON.stringify({}),
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
    if (this.tokenRefreshListener) {
      this.tokenRefreshListener.remove();
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

  /**
   * Set the app icon badge to a specific count.
   * iOS HIG: Badge should always reflect actual actionable items.
   * @param {number} count - The badge count to display (0 to clear)
   */
  async setBadgeCount(count) {
    try {
      await Notifications.setBadgeCountAsync(Math.max(0, count));
    } catch {
      // Best-effort
    }
  }

  /**
   * Clear the app icon badge (sets to 0).
   * Use syncBadgeWithServer() instead when you want accurate counts.
   */
  async clearBadge() {
    try {
      await Notifications.setBadgeCountAsync(0);
    } catch {
      // Best-effort
    }
  }

  /**
   * Sync app icon badge with server's unread count.
   * iOS HIG: On app foreground, badge should reflect actual server state.
   * Call this when:
   * - App comes to foreground
   * - User marks messages as read
   * - Socket emits badge update event
   * @returns {Promise<number>} The synced badge count
   */
  async syncBadgeWithServer() {
    try {
      const response = await api.request('/push/unread-count');
      const count = response?.count || 0;
      await Notifications.setBadgeCountAsync(count);
      return count;
    } catch (err) {
      console.warn('Failed to sync badge with server:', err.message);
      // On error, don't change badge - stale is better than wrong
      return -1;
    }
  }

  /**
   * Dismiss delivered notifications for a specific channel.
   * The server emits a `badge:update` socket event after mark-read, which the
   * SocketContext listener applies to the badge — we don't sync here to avoid
   * racing with the server's own mark-read processing (which would return a
   * stale count including the channel the user just opened).
   */
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
