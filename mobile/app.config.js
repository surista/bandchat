export default {
  expo: {
    name: 'BandChat',
    slug: 'bandchat',
    scheme: 'bandchat',
    version: '1.06.40',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    description: 'Real-time communication and management app for bands. Channels, messaging, song management, setlists, calendar, and more.',
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#1f2937',
    },
    notification: {
      icon: './assets/android-icon-monochrome.png',
      color: '#2BAC76',
      androidMode: 'default',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.bandchat.mobile',
      buildNumber: '10640',
      associatedDomains: ['applinks:bandchat.vercel.app'],
      entitlements: {
        'com.apple.security.application-groups': ['group.com.bandchat.manager.mobile'],
      },
      infoPlist: {
        NSCameraUsageDescription: 'BandChat needs camera access to take photos for your profile and messages.',
        NSPhotoLibraryUsageDescription: 'BandChat needs photo library access to share images in messages and set your profile picture.',
        NSPhotoLibraryAddUsageDescription: 'BandChat needs permission to save images to your photo library.',
        NSMicrophoneUsageDescription: 'BandChat needs microphone access to record audio for band recordings.',
        NSCalendarsUsageDescription: 'BandChat can add gigs and rehearsals to your device calendar.',
        NSCalendarsFullAccessUsageDescription: 'BandChat can add gigs and rehearsals to your device calendar.',
        NSFaceIDUsageDescription: 'BandChat uses Face ID to quickly unlock the app.',
        ITSAppUsesNonExemptEncryption: false,
        UIBackgroundModes: ['remote-notification'],
        UIRequiresFullScreen: false,
        'UISupportedInterfaceOrientations~ipad': [
          'UIInterfaceOrientationPortrait',
          'UIInterfaceOrientationPortraitUpsideDown',
          'UIInterfaceOrientationLandscapeLeft',
          'UIInterfaceOrientationLandscapeRight',
        ],
      },
    },
    android: {
      package: 'com.bandchat.mobile',
      softwareKeyboardLayoutMode: 'pan',
      versionCode: 10640,
      allowBackup: false,
      predictiveBackGestureEnabled: true,
      adaptiveIcon: {
        backgroundColor: '#1f2937',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          data: [
            {
              scheme: 'https',
              host: 'bandchat.vercel.app',
              pathPrefix: '/join/',
            },
            {
              scheme: 'https',
              host: 'bandchat.vercel.app',
              pathPrefix: '/workspace/',
            },
          ],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
      permissions: [
        'CAMERA',
        'READ_MEDIA_IMAGES',
        'READ_MEDIA_VIDEO',
        'READ_MEDIA_AUDIO',
        'RECORD_AUDIO',
        'READ_CALENDAR',
        'WRITE_CALENDAR',
        'VIBRATE',
        'INTERNET',
        'ACCESS_NETWORK_STATE',
      ],
    },
    web: {
      favicon: './assets/favicon.png',
    },
    extra: {
      apiUrl: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api',
      socketUrl: process.env.EXPO_PUBLIC_SOCKET_URL || 'http://localhost:3001',
      revenueCatApiKeyIos: process.env.EXPO_PUBLIC_REVENUECAT_IOS || '',
      revenueCatApiKeyAndroid: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID || '',
      googleWebClientId: process.env.GOOGLE_CLIENT_ID,
      googleIosClientId: process.env.GOOGLE_IOS_CLIENT_ID,
      eas: {
        projectId: 'd4038ff4-1904-4b0d-98a0-d8bcab2cb00f',
        build: {
          experimental: {
            ios: {
              appExtensions: [
                {
                  targetName: 'BandChatWidgets',
                  bundleIdentifier: 'com.bandchat.mobile.BandChatWidgets',
                  entitlements: {
                    'com.apple.security.application-groups': ['group.com.bandchat.manager.mobile'],
                  },
                },
              ],
            },
          },
        },
      },
    },
    plugins: [
      'expo-secure-store',
      'expo-asset',
      'expo-font',
      'expo-calendar',
      'expo-image-picker',
      'expo-notifications',
      'expo-media-library',
      'expo-quick-actions',
      'expo-apple-authentication',
      [
        'expo-share-intent',
        {
          iosActivationRules: {
            NSExtensionActivationSupportsImageWithMaxCount: 10,
            NSExtensionActivationSupportsMovieWithMaxCount: 0,
          },
        },
      ],
      [
        '@react-native-google-signin/google-signin',
        {
          iosUrlScheme: process.env.GOOGLE_IOS_CLIENT_ID
            ? `com.googleusercontent.apps.${process.env.GOOGLE_IOS_CLIENT_ID.replace('.apps.googleusercontent.com', '')}`
            : 'com.googleusercontent.apps.placeholder',
        },
      ],
      [
        'expo-build-properties',
        {
          android: {
            kotlinVersion: '2.2.0',
          },
        },
      ],
      [
        'react-native-widget-extension',
        {
          widgetsFolder: 'widgets',
          deploymentTarget: '16.2',
          groupIdentifier: 'group.com.bandchat.manager.mobile',
        },
      ],
    ],
  },
};
