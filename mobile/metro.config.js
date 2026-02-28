const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Disable Expo Router — we use classic index.js + React Navigation
config.resolver.sourceExts = config.resolver.sourceExts.filter(
  (ext) => !ext.includes('expo-router')
);

module.exports = config;
