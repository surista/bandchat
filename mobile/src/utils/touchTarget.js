import { Platform } from 'react-native';

/**
 * Minimum interactive touch target size.
 *
 * Apple HIG: 44pt (iOS).
 * Material spec: 48dp (Android).
 *
 * Using the platform's own guidance avoids one platform's tap targets feeling
 * cramped to users of the other. RN's pt and dp are 1:1 at the API level.
 */
export const MIN_TOUCH_TARGET = Platform.OS === 'android' ? 48 : 44;
