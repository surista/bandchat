// Jest setup — mock native modules before any imports
// This file runs before test files via setupFiles config

// Prevent expo's runtime bootstrap from failing
jest.mock('expo', () => ({}));
jest.mock('expo-modules-core', () => ({
  requireNativeModule: jest.fn(() => ({})),
  requireOptionalNativeModule: jest.fn(() => null),
  NativeModule: class {},
  EventEmitter: class { addListener() {} removeAllListeners() {} },
}));

// Native keyboard module — use the library's own mock.
jest.mock('react-native-keyboard-controller', () => require('react-native-keyboard-controller/jest'));
