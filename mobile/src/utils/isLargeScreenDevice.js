import { Dimensions, Platform } from 'react-native';

/**
 * Orientation-invariant "is this a tablet/large-screen device" check, used to
 * decide whether the app-wide portrait lock (mobile/App.js) applies. Uses
 * Dimensions.get (not the reactive useWindowDimensions hook) because this
 * answers "what kind of device is this", not "what's the current window
 * shape" — shortestSide doesn't change on rotation, so a large phone held
 * sideways is never misclassified as a tablet. Threshold matches Android's
 * sw600dp "large screen" convention (the same one Google uses).
 */
export function isLargeScreenDevice() {
  const { width, height } = Dimensions.get('window');
  const shortestSide = Math.min(width, height);
  return shortestSide >= 600 || Platform.isPad === true;
}
