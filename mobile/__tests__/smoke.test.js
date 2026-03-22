/**
 * Smoke tests — verify critical modules can be imported without crashing.
 * These catch broken variable references, missing imports, and syntax errors
 * that would prevent screens from rendering.
 *
 * Run: npm test
 */

// Mock expo core to prevent import scope errors
jest.mock('expo', () => ({}));
jest.mock('expo-modules-core', () => ({ requireNativeModule: jest.fn(() => ({})), NativeModule: class {} }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(), isLoaded: jest.fn(() => true) }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: jest.fn(() => ({ downloadAsync: jest.fn() })) } }));
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn(), hideAsync: jest.fn() }));
jest.mock('expo-status-bar', () => ({ StatusBar: 'StatusBar' }));
jest.mock('expo-file-system', () => ({ documentDirectory: '/mock/', deleteAsync: jest.fn(), getInfoAsync: jest.fn() }));

// Mock all native modules that would crash in a Jest environment
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(() => ({ status: 'granted' })),
}));
jest.mock('expo-av', () => ({
  Audio: {
    Recording: jest.fn(),
    requestPermissionsAsync: jest.fn(() => ({ granted: true })),
    setAudioModeAsync: jest.fn(),
    RecordingOptionsPresets: { HIGH_QUALITY: {} },
  },
}));
jest.mock('expo-print', () => ({ printToFileAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setBadgeCountAsync: jest.fn(),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));
jest.mock('expo-constants', () => ({ expoConfig: { version: '1.0.0' } }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
jest.mock('expo-quick-actions', () => ({
  initial: null,
  setItems: jest.fn(),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => null),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  multiGet: jest.fn(() => []),
}));
jest.mock('react-native-purchases', () => ({
  configure: jest.fn(),
  getOfferings: jest.fn(),
}));
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(() => ({
    execAsync: jest.fn(),
    getAllAsync: jest.fn(() => []),
    runAsync: jest.fn(),
  })),
}));
jest.mock('socket.io-client', () => ({
  io: jest.fn(() => ({
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    connected: false,
  })),
}));
jest.mock('expo-calendar', () => ({}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-local-authentication', () => ({}));
jest.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: jest.fn(), deactivateKeepAwake: jest.fn() }));
jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('expo-document-picker', () => ({}));
jest.mock('expo-media-library', () => ({}));
jest.mock('expo-share-intent', () => ({ useShareIntent: jest.fn(() => ({ shareIntent: null, resetShareIntent: jest.fn() })) }));

// ---- Smoke tests: import-only (no rendering) ----
// These catch ReferenceErrors, syntax errors, and broken imports

describe('Critical component imports (smoke tests)', () => {
  test('MessageInput imports without error', () => {
    expect(() => require('../src/components/MessageInput')).not.toThrow();
  });

  test('MessageBubble imports without error', () => {
    expect(() => require('../src/components/MessageBubble')).not.toThrow();
  });

  test('ThemeContext imports without error', () => {
    expect(() => require('../src/context/ThemeContext')).not.toThrow();
  });

  test('AuthContext imports without error', () => {
    expect(() => require('../src/context/AuthContext')).not.toThrow();
  });

  test('ApiService imports without error', () => {
    expect(() => require('../src/services/api')).not.toThrow();
  });
});

describe('Screen imports (smoke tests)', () => {
  test('ChannelScreen imports without error', () => {
    expect(() => require('../src/screens/workspace/ChannelScreen')).not.toThrow();
  });

  test('ThreadScreen imports without error', () => {
    expect(() => require('../src/screens/workspace/ThreadScreen')).not.toThrow();
  });

  test('ChannelListScreen imports without error', () => {
    expect(() => require('../src/screens/workspace/ChannelListScreen')).not.toThrow();
  });

  test('WorkspaceListScreen imports without error', () => {
    expect(() => require('../src/screens/workspaces/WorkspaceListScreen')).not.toThrow();
  });

  test('SongListScreen imports without error', () => {
    expect(() => require('../src/screens/band/SongListScreen')).not.toThrow();
  });

  test('SetlistDetailScreen imports without error', () => {
    expect(() => require('../src/screens/band/SetlistDetailScreen')).not.toThrow();
  });

  test('AppearanceScreen imports without error', () => {
    expect(() => require('../src/screens/settings/AppearanceScreen')).not.toThrow();
  });
});

describe('Utility imports (smoke tests)', () => {
  test('haptics imports without error', () => {
    expect(() => require('../src/utils/haptics')).not.toThrow();
  });

  test('buildSetlistHTML imports without error', () => {
    expect(() => require('../src/utils/buildSetlistHTML')).not.toThrow();
  });

  test('buildSongListHTML imports without error', () => {
    expect(() => require('../src/utils/buildSongListHTML')).not.toThrow();
  });
});
