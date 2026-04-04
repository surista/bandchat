import { registerRootComponent } from 'expo';
import { I18nManager } from 'react-native';

// Force LTR layout BEFORE any components load — prevents RTL on devices with RTL system language
// Must be unconditional and before App import to ensure it takes effect on Android
I18nManager.allowRTL(false);
I18nManager.forceRTL(false);

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
