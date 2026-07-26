import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useEffect, useRef } from 'react';
import { AppState, Linking, Text, TextInput, Platform, UIManager } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { isLargeScreenDevice } from './src/utils/isLargeScreenDevice';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Lock phones to portrait at runtime; let tablets and foldables rotate.
// We can't do this via app.config.js `orientation` because:
//   (1) it's not per-device-type, and
//   (2) Android 16 force-ignores manifest-level screenOrientation on large
//       screens regardless of what we set, and Google Play flags it as a
//       recommended action.
//
// Screens that want rotation on phones too (e.g. the full-screen image
// viewer, ImageViewer.js) temporarily lift this lock while they're open and
// restore it on close — see isLargeScreenDevice.js for the shared heuristic.
//
// Fire-and-forget — lockAsync resolves quickly and any failure (e.g. no
// permission on a managed environment) is logged but never blocks startup.
(() => {
  if (isLargeScreenDevice()) return;
  ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch((err) => {
    if (__DEV__) console.warn('Failed to lock orientation:', err?.message);
  });
})();

// Support Dynamic Type / Android font scaling up to 2.0× to cover Android's
// highest accessibility levels (Pixel/Samsung) and iOS AX3/AX5 sizes.
if (Text.defaultProps == null) Text.defaultProps = {};
Text.defaultProps.maxFontSizeMultiplier = 2.0;
if (TextInput.defaultProps == null) TextInput.defaultProps = {};
TextInput.defaultProps.maxFontSizeMultiplier = 2.0;
import { getUiString, getUiState } from './src/services/storage';
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
import WhatsNewModal from './src/components/WhatsNewModal';
import userPreferences from './src/services/userPreferences';
import { useAuth } from './src/context/AuthContext';
import { useSocket } from './src/context/SocketContext';
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
  // Get current user ID from stored auth data. getUiState parses JSON and
  // swallows storage errors — falls back to null and the DM-name resolution
  // below handles that gracefully.
  const userData = await getUiState('user');
  const userId = userData?.id || null;
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

/**
 * Loads user preferences from the server when the user becomes authenticated
 * and applies remote patches arriving on the socket. Renders nothing —
 * mounts next to RootNavigator so it sits inside Auth + Socket providers.
 *
 * Legacy migration: when the server returns an empty prefs blob (first
 * launch of the sync feature), this gathers the user's pre-existing local
 * storage values into a single patch and PUTs them up. Workspace-scoped
 * legacy values (sidebar collapse, channel sort) are migrated lazily in
 * their respective consumers — they're keyed by workspaceId and we don't
 * always know which workspaces the user has at this point.
 */
function PreferencesSync() {
  const { user } = useAuth();
  const { socket } = useSocket();

  useEffect(() => {
    if (!user) {
      userPreferences.clear();
      return;
    }
    const legacyMigrate = async () => {
      // mode/theme/density/biometricPromptShown were written with setUiString
      // (raw strings, e.g. "dark") — read them with getUiString. workspaceThemes
      // and blockedDomains were written with setUiState (JSON-encoded objects/
      // arrays) — read those with getUiState. Mixing these up means
      // JSON.parse('dark') throws and the value silently comes back null.
      const [mode, theme, density, workspaceThemes, blockedDomains, biometricPromptShown] = await Promise.all([
        getUiString('bandchat-mode').catch(() => null),
        getUiString('bandchat-theme').catch(() => null),
        getUiString('bandchat-density').catch(() => null),
        getUiState('bandchat-workspace-themes').catch(() => null),
        getUiState('bandchat_blocked_preview_domains').catch(() => null),
        getUiString('biometricPromptShown').catch(() => null),
      ]);
      const patch = {};
      const themePatch = {};
      if (typeof mode === 'string') themePatch.mode = mode;
      if (typeof theme === 'string') themePatch.global = theme;
      if (typeof density === 'string') themePatch.density = density;
      if (workspaceThemes && typeof workspaceThemes === 'object' && !Array.isArray(workspaceThemes)) {
        themePatch.workspaceThemes = workspaceThemes;
      }
      if (Object.keys(themePatch).length > 0) patch.theme = themePatch;
      if (Array.isArray(blockedDomains)) {
        patch.messages = { blockedPreviewDomains: blockedDomains };
      }
      if (biometricPromptShown === 'true') {
        patch.auth = { biometricPromptShown: true };
      }
      return patch;
    };
    userPreferences.load(legacyMigrate);
  }, [user]);

  // Real-time sync: when another device PUTs a patch the server broadcasts
  // it to all of this user's sockets. We dedupe self-sent patches inside
  // applyRemotePatch so we don't bounce our own writes.
  useEffect(() => {
    if (!socket) return;
    const handler = ({ patch }) => userPreferences.applyRemotePatch(patch);
    socket.on('preferences:updated', handler);
    return () => socket.off('preferences:updated', handler);
  }, [socket]);

  return null;
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

        // Thread-reply notifications include &thread=<parentId> in the URL
        // so we can deep-link the user into the thread view, not just the
        // channel. Without this, tapping a thread-reply notification lands
        // the user in the channel and they can't see the reply (which lives
        // nested in a thread). Parse it out and pass through to ChannelScreen
        // which auto-opens the thread on mount.
        let openThreadId = null;
        if (data.url) {
          try {
            const u = new URL(data.url, 'https://placeholder');
            openThreadId = u.searchParams.get('thread') || null;
          } catch { /* malformed url, no-op */ }
        }

        navigationRef.current.navigate('Workspace', { id: data.workspaceId, name: data.workspaceName || 'Workspace' });
        try {
          const channel = await api.getChannel(data.channelId);
          const channelData = await prepareChannelForNav(channel);
          setTimeout(() => {
            navigationRef.current.navigate('Channel', { channel: channelData, workspaceId: data.workspaceId, openThreadId });
          }, 300);
        } catch {
          // Fallback: stay on workspace screen
        }
      }
    });

    // Sync badge with server and refresh widget when app comes to foreground
    // iOS HIG: Badge should always reflect actual server state, not just clear to 0
    // (NOTE: v1.06.75 added a notificationService.register() call here as a
    // self-healing measure for failed registrations. It was reverted in v1.06.81
    // because — in combination with the new AuthContext register-on-auth-change —
    // it produced severe UI lag on real devices. Don't reintroduce without first
    // proving on-device that repeated register() calls don't block.)
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        notificationService.syncBadgeWithServer();
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

      const wsId = await getUiString('lastWorkspaceId');
      const wsName = await getUiString('lastWorkspaceName');

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
      {/* PreferencesSync sits outside ToastProvider — it never raises toasts,
          so re-renders of the toast tree shouldn't cause it to unmount. */}
      <PreferencesSync />
      <ToastProvider>
        <OfflineBanner />
        <RootNavigator />
        {/* Self-guards on isAuthenticated, so this is a no-op while the user
            is still on Login / Signup / BiometricLock. */}
        <WhatsNewModal />
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
