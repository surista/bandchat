import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { AuthProvider } from './src/context/AuthContext';
import { SocketProvider } from './src/context/SocketContext';
import { ToastProvider } from './src/context/ToastContext';
import RootNavigator from './src/navigation/RootNavigator';
import ErrorBoundary from './src/components/ErrorBoundary';
import OfflineBanner from './src/components/OfflineBanner';
import notificationService from './src/services/notifications';
import api from './src/services/api';

function handleDeepLink(url, navigationRef) {
  if (!url || !navigationRef.current) return;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'bandchat:') return;
    const parts = parsed.pathname.replace(/^\/+/, '').split('/');

    if (parts[0] === 'workspace' && parts[1]) {
      if (parts[2] === 'channel' && parts[3]) {
        // bandchat://workspace/:wid/channel/:cid
        navigationRef.current.navigate('Workspace', { id: parts[1] });
        api.getChannel(parts[3]).then(channel => {
          setTimeout(() => {
            navigationRef.current.navigate('Channel', { channel, workspaceId: parts[1] });
          }, 300);
        }).catch(() => {});
      } else {
        // bandchat://workspace/:id
        navigationRef.current.navigate('Workspace', { id: parts[1] });
      }
    } else if (parts[0] === 'invite' && parts[1]) {
      // bandchat://invite/:code
      navigationRef.current.navigate('WorkspaceList', { inviteCode: parts[1] });
    }
  } catch {}
}

function AppContent() {
  const navigationRef = useRef(null);
  const { mode } = useTheme();

  useEffect(() => {
    // Register push notifications
    notificationService.register();
    notificationService.listen(async (data) => {
      // Handle notification tap — navigate to workspace/channel if data provided
      if (data?.workspaceId && data?.channelId && navigationRef.current) {
        navigationRef.current.navigate('Workspace', { id: data.workspaceId, name: data.workspaceName || 'Workspace' });
        try {
          const channel = await api.getChannel(data.channelId);
          setTimeout(() => {
            navigationRef.current.navigate('Channel', { channel, workspaceId: data.workspaceId });
          }, 300);
        } catch {
          // Fallback: stay on workspace screen
        }
      }
    });

    return () => notificationService.cleanup();
  }, []);

  // Deep linking
  useEffect(() => {
    // Handle initial URL (app opened via deep link)
    Linking.getInitialURL().then(url => handleDeepLink(url, navigationRef));

    // Handle subsequent deep links while app is open
    const sub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url, navigationRef));
    return () => sub.remove();
  }, []);

  const linking = {
    prefixes: ['bandchat://'],
  };

  return (
    <NavigationContainer ref={navigationRef} linking={linking}>
      <ToastProvider>
        <OfflineBanner />
        <RootNavigator />
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      </ToastProvider>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <SafeAreaProvider>
          <ThemeProvider>
            <AuthProvider>
              <SocketProvider>
                <AppContent />
              </SocketProvider>
            </AuthProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
