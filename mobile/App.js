import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useEffect, useRef } from 'react';
import { AppState, Linking, Text, TextInput, Platform, UIManager } from 'react-native';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Support Dynamic Type / Android font scaling up to 2.0× to cover Android's
// highest accessibility levels (Pixel/Samsung) and iOS AX3/AX5 sizes.
if (Text.defaultProps == null) Text.defaultProps = {};
Text.defaultProps.maxFontSizeMultiplier = 2.0;
if (TextInput.defaultProps == null) TextInput.defaultProps = {};
TextInput.defaultProps.maxFontSizeMultiplier = 2.0;
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
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
import { updateWidgetGigData } from './src/services/widgetService';

// Validate UUID format (v4 UUIDs used by the app)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (str) => str && UUID_REGEX.test(str);

// Invite codes are 10-char base64url strings (e.g. RJ4IQFLS0A)
const INVITE_CODE_REGEX = /^[A-Z0-9_-]{4,20}$/i;
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
    // Accept our custom protocol or HTTPS from our web domain
    const isCustomScheme = parsed.protocol === 'bandchat:';
    const isWebLink = parsed.protocol === 'https:' && parsed.hostname === 'bandchat.vercel.app';
    if (!isCustomScheme && !isWebLink) return;

    // Sanitize and split path
    const parts = parsed.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
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
        // workspace/:wid/channel/:cid
        navigationRef.current.navigate('Workspace', { id: parts[1] });
        api.getChannel(parts[3]).then(async (channel) => {
          const channelData = await prepareChannelForNav(channel);
          setTimeout(() => {
            navigationRef.current.navigate('Channel', { channel: channelData, workspaceId: parts[1] });
          }, Platform.OS === 'android' ? 500 : 300);
        }).catch(() => {});
      } else {
        // workspace/:id
        navigationRef.current.navigate('Workspace', { id: parts[1] });
      }
    } else if (parts[0] === 'gig' && parts[1]) {
      // gig/:gigId?ws=:workspaceId (from widget deep links)
      if (!isValidUUID(parts[1])) return;
      const workspaceId = parsed.searchParams?.get('ws');
      if (workspaceId && isValidUUID(workspaceId)) {
        navigationRef.current.navigate('Workspace', { id: workspaceId });
        setTimeout(() => {
          navigationRef.current.navigate('GigDetail', { gigId: parts[1], workspaceId });
        }, Platform.OS === 'android' ? 500 : 300);
      }
    } else if ((parts[0] === 'invite' || parts[0] === 'join') && parts[1]) {
      // Validate invite code format
      if (!isValidInviteCode(parts[1])) {
        console.warn('Invalid invite code in deep link:', parts[1]);
        return;
      }
      // invite/:code or join/:code (web uses /join/, custom scheme uses /invite/)
      navigationRef.current.navigate('WorkspaceList', { inviteCode: parts[1] });
    }
  } catch (error) {
    console.warn('Failed to parse deep link:', error.message);
  }
}

function AppContent() {
  const navigationRef = useRef(null);
  const { mode, colors } = useTheme();
  const { hasShareIntent, shareIntent } = useShareIntent();

  // Sync Android navigation bar color with theme
  useEffect(() => {
    if (Platform.OS === 'android') {
      NavigationBar.setBackgroundColorAsync(colors.bgPrimary).catch(() => {});
      NavigationBar.setButtonStyleAsync(mode === 'dark' ? 'light' : 'dark').catch(() => {});
    }
  }, [mode, colors.bgPrimary]);

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
        // Sync badge with server after tapping notification (iOS HIG: badge = actual unread)
        notificationService.syncBadgeWithServer();
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

    // Sync badge with server and refresh widget when app comes to foreground
    // iOS HIG: Badge should always reflect actual server state, not just clear to 0
    // Also re-run push registration as self-healing: if the user revoked
    // notification permission in OS Settings, or if a previous register()
    // failed (network blip, server outage), this catches it on next foreground.
    // register() is idempotent — server upserts by token.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        notificationService.syncBadgeWithServer();
        notificationService.register().catch(() => {});
        updateWidgetGigData();
      }
    });

    return () => {
      notificationService.cleanup();
      subscription?.remove();
    };
  }, []);

  // Quick actions (3D Touch / long press app icon)
  useEffect(() => {
    QuickActions.setItems([
      {
        id: 'next_gig',
        title: 'Next Gig',
        icon: Platform.OS === 'ios' ? 'symbol:calendar' : 'shortcut_next_gig',
      },
      {
        id: 'new_message',
        title: 'New Message',
        icon: Platform.OS === 'ios' ? 'symbol:message' : 'shortcut_new_message',
      },
      {
        id: 'calendar',
        title: 'Calendar',
        icon: Platform.OS === 'ios' ? 'symbol:calendar.badge.clock' : 'shortcut_calendar',
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
    prefixes: ['bandchat://', 'https://bandchat.vercel.app'],
  };

  return (
    <NavigationContainer ref={navigationRef} linking={linking}>
      <ToastProvider>
        <OfflineBanner />
        <RootNavigator />
        <StatusBar style={colors.isLightHeader ? 'dark' : 'light'} backgroundColor="transparent" translucent />
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
