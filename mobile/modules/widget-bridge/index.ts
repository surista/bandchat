import { requireNativeModule, Platform } from 'expo-modules-core';

const MODULE_NAME = 'WidgetBridge';

// Only load on iOS — returns a no-op stub on other platforms
const WidgetBridge = Platform.OS === 'ios'
  ? requireNativeModule(MODULE_NAME)
  : { updateWidgetData: () => {}, reloadWidgets: () => {} };

export function updateWidgetData(jsonString: string): void {
  WidgetBridge.updateWidgetData(jsonString);
}

export function reloadWidgets(): void {
  WidgetBridge.reloadWidgets();
}

export default WidgetBridge;
