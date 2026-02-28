import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import api from './api';

// Configure how notifications appear when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
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

      // Android notification channel
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'BandChat',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
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

  cleanup() {
    if (this.notificationListener) {
      this.notificationListener.remove();
    }
    if (this.responseListener) {
      this.responseListener.remove();
    }
  }
}

export const notificationService = new NotificationService();
export default notificationService;
