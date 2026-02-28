export default {
  expo: {
    name: 'BandChat',
    slug: 'bandchat',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'dark',
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#1f2937',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.bandchat.mobile',
    },
    android: {
      package: 'com.bandchat.mobile',
      adaptiveIcon: {
        backgroundColor: '#1f2937',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
    },
    web: {
      favicon: './assets/favicon.png',
    },
    extra: {
      apiUrl: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api',
      socketUrl: process.env.EXPO_PUBLIC_SOCKET_URL || 'http://localhost:3001',
    },
    plugins: ['expo-secure-store', 'expo-asset', 'expo-font', '@react-native-community/datetimepicker'],
  },
};
