import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bandchat.app',
  appName: 'BandChat',
  webDir: 'dist',
  server: {
    // During development, point to your Vite dev server
    // Uncomment the line below and run `npx cap copy` to use live reload
    // url: 'http://YOUR_LOCAL_IP:5173',
    androidScheme: 'https',
    iosScheme: 'https',
  },
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    scheme: 'BandChat',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: '#1f2937', // matches bg-gray-800
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: 'dark', // light text on dark background
      backgroundColor: '#111827', // matches bg-gray-900
    },
  },
};

export default config;
