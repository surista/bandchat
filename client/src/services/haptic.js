/**
 * Haptic feedback service using Navigator Vibration API.
 * No-op on iOS Safari and desktop (vibrate not supported).
 */

const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator;

export function hapticLight() {
  if (canVibrate) navigator.vibrate(10);
}

export function hapticMedium() {
  if (canVibrate) navigator.vibrate([15, 30, 15]);
}

export function hapticHeavy() {
  if (canVibrate) navigator.vibrate([20, 50, 20]);
}
