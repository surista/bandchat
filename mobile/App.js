import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as QuickActions from 'expo-quick-actions';
import { ShareIntentProvider, useShareIntent } from 'expo-share-intent';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { AuthProvider } from './src/context/AuthContext';
import { DatabaseProvider } from './src/context/DatabaseContext';
import { SocketProvider } from './src/context/SocketContext';
import { ToastProvider } from './src/context/ToastContext';
import RootNavigator from './src/navigation/RootNavigator';
import ErrorBoundary from './src/components/ErrorBoundary';
import OfflineBanner from './src/components/OfflineBanner';
import notificationService from './src/services/notifications';
import api from './src/services/api';

// Validate UUID format (v4 UUIDs used by the app)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (str) => str && UUID_REGEX.test(str);

// Invite codes are hex strings (64 chars from crypto.randomBytes(32))
const INVITE_CODE_REGEX = /^[0-9a-f]{64}$/i;
const isValidInviteCode = (str) => str && INVITE_CODE_REGEX.test(str);

// Prepare channel data for navigation (resolve DM display names)
async function prepareChannelForNav(channel) {
  if (!channel.isDirect) return channel;
  // Get current user ID from stored auth data
  let userId = null;
  try {
    const userData = await AsyncStorage.getItem('user');
    if (userData) userId = JSON.parse(userData).id;
  } catch {}
  const otherMembers = (channel.members || [])
    .filter(m => m.user?.id !== userId)
    .map(m => m.user);
  const displayName = otherMembers.length > 0
    ? otherMembers.map(m => m?.displayName || 'Unknown').join(', ')
    : 'Direct Message';
  return { ...channel, isDM: true, displayName, otherMembers };
}

function handleDeepLink(url, navigationRef) {
  if (!url || !navigationRef.current) return;
  try {
    const parsed = new URL(url);
    // Only accept our custom protocol
    if (parsed.protocol !== 'bandchat:') return;

    // Sanitize and split path
    const parts = parsed.pathname.replace(/^\/+/, '').split('/');
    // Limit path depth to prevent abuse
    if (parts.length > 4) return;

    if (parts[0] === 'workspace' && parts[1]) {
      // Validate workspace ID is a proper UUID
      if (!isValidUUID(parts[1])) {
        console.warn('Invalid workspace ID in deep link:', parts[1]);
        return;
      }

      if (parts[2] === 'channel' && parts[3]) {
        // Validate channel ID is a proper UUID
        if (!isValidUUID(parts[3])) {
          console.warn('Invalid channel ID in deep link:', parts[3]);
          return;
        }
        // bandchat://workspace/:wid/channel/:cid
        navigationRef.current.navigate('Workspace', { id: parts[1] });
        api.getChannel(parts[3]).then(async (channel) => {
          const channelData = await prepareChannelForNav(channel);
          setTimeout(() => {
            navigationRef.current.navigate('Channel', { channel: channelData, workspaceId: parts[1] });
          }, 300);
        }).catch(() => {});
      } else {
        // bandchat://workspace/:id
        navigationRef.current.navigate('Workspace', { id: parts[1] });
      }
    } else if (parts[0] === 'invite' && parts[1]) {
      // Validate invite code format
      if (!isValidInviteCode(parts[1])) {
        console.warn('Invalid invite code in deep link:', parts[1]);
        return;
      }
      // bandchat://invite/:code
      navigationRef.current.navigate('WorkspaceList', { inviteCode: parts[1] });
    }
  } catch (error) {
    console.warn('Failed to parse deep link:', error.message);
  }
}

function AppContent() {
  const navigationRef = useRef(null);
  const { mode } = useTheme();
  const { hasShareIntent, shareIntent } = useShareIntent();

  // Handle share intent - navigate to ShareReceive screen
  useEffect(() => {
    if (hasShareIntent && shareIntent?.files?.length > 0 && navigationRef.current) {
      // Small delay to ensure navigation is ready
      setTimeout(() => {
        navigationRef.current.navigate('ShareReceive');
      }, 100);
    }
  }, [hasShareIntent, shareIntent]);

  useEffect(() => {
    // Register push notifications
    notificationService.register();
    notificationService.listen(async (data) => {
      // Handle notification tap — navigate to workspace/channel if data provided
      if (data?.workspaceId && data?.channelId && navigationRef.current) {
        navigationRef.current.navigate('Workspace', { id: data.workspaceId, name: data.workspaceName || 'Workspace' });
        try {
          const channel = await api.getChannel(data.channelId);
          const channelData = await prepareChannelForNav(channel);
          setTimeout(() => {
            navigationRef.current.navigate('Channel', { channel: channelData, workspaceId: data.workspaceId });
          }, 300);
        } catch {
          // Fallback: stay on workspace screen
        }
      }
    });

    return () => notificationService.cleanup();
  }, []);

  // Quick actions (3D Touch / long press app icon)
  useEffect(() => {
    QuickActions.setItems([
      {
        id: 'next_gig',
        title: 'Next Gig',
        icon: 'symbol:calendar',
      },
      {
        id: 'new_message',
        title: 'New Message',
        icon: 'symbol:message',
      },
      {
        id: 'calendar',
        title: 'Calendar',
        icon: 'symbol:calendar.badge.clock',
      },
    ]).catch(() => {});

    const sub = QuickActions.addListener(async (action) => {
      if (!navigationRef.current) return;

      const wsId = await AsyncStorage.getItem('lastWorkspaceId');
      const wsName = await AsyncStorage.getItem('lastWorkspaceName');

      if (!wsId) {
        navigationRef.current.navigate('WorkspaceList');
        return;
      }

      navigationRef.current.navigate('Workspace', { id: wsId, name: wsName || 'Workspace' });

      if (action.id === 'next_gig' || action.id === 'calendar') {
        setTimeout(() => {
          navigationRef.current.navigate('GigList', { workspaceId: wsId });
        }, 300);
      }
      // 'new_message' lands on workspace channel list
    });

    return () => sub.remove();
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
      <ShareIntentProvider>
        <ErrorBoundary>
          <SafeAreaProvider>
            <ThemeProvider>
              <AuthProvider>
                <DatabaseProvider>
                  <SocketProvider>
                    <AppContent />
                  </SocketProvider>
                </DatabaseProvider>
              </AuthProvider>
            </ThemeProvider>
          </SafeAreaProvider>
        </ErrorBoundary>
      </ShareIntentProvider>
    </GestureHandlerRootView>
  );
}
