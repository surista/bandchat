/**
 * Native app initialization for iOS/Android.
 * Handles status bar, keyboard, back button, and app lifecycle.
 * No-ops on web — safe to call unconditionally.
 */
import { isNative, isIOS } from './platform';

export async function initNativeApp() {
  if (!isNative) return;

  // Status bar - light content on dark background
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark });
    if (!isIOS) {
      // Android only — iOS status bar bg is controlled by the app viewport
      await StatusBar.setBackgroundColor({ color: '#111827' });
    }
  } catch (e) {
    console.warn('StatusBar plugin not available:', e);
  }

  // Keyboard - handle resize behavior
  try {
    const { Keyboard } = await import('@capacitor/keyboard');
    Keyboard.addListener('keyboardWillShow', (info) => {
      document.documentElement.style.setProperty('--keyboard-height', `${info.keyboardHeight}px`);
      document.body.classList.add('keyboard-open');
    });
    Keyboard.addListener('keyboardWillHide', () => {
      document.documentElement.style.setProperty('--keyboard-height', '0px');
      document.body.classList.remove('keyboard-open');
    });
  } catch (e) {
    console.warn('Keyboard plugin not available:', e);
  }

  // App lifecycle - handle back button on Android, resume events
  try {
    const { App } = await import('@capacitor/app');
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        App.exitApp();
      }
    });
    App.addListener('appStateChange', ({ isActive }) => {
      // Could reconnect socket, refresh data, etc.
      if (isActive) {
        document.dispatchEvent(new CustomEvent('app:resume'));
      } else {
        document.dispatchEvent(new CustomEvent('app:pause'));
      }
    });
  } catch (e) {
    console.warn('App plugin not available:', e);
  }
}
