import { memo, useEffect, useRef } from 'react';
import { View, Text, Modal, Pressable, StyleSheet, Platform, ActionSheetIOS } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import PressableRow from './PressableRow';

// iOS renders via native UIAlertController (ActionSheetIOS); Android uses the
// custom themed bottom sheet below so it can match app theme and Material polish.
function ActionSheet({ visible, title, actions, onClose }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const lastVisibleRef = useRef(false);

  // iOS: imperatively show native action sheet whenever `visible` flips to true
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    if (!visible || lastVisibleRef.current === visible) {
      lastVisibleRef.current = visible;
      return;
    }
    lastVisibleRef.current = visible;
    const labels = actions.map(a => a.label);
    const options = [...labels, 'Cancel'];
    const destructiveIndices = actions
      .map((a, i) => (a.destructive ? i : -1))
      .filter(i => i >= 0);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: title || undefined,
        options,
        cancelButtonIndex: options.length - 1,
        destructiveButtonIndex: destructiveIndices.length === 1 ? destructiveIndices[0] : undefined,
        userInterfaceStyle: undefined,
      },
      (idx) => {
        // Close immediately — parent state drives `visible`
        onClose?.();
        if (idx >= 0 && idx < actions.length) {
          actions[idx].onPress?.();
        }
      },
    );
  }, [visible, actions, title, onClose]);

  if (Platform.OS === 'ios') return null;
  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.overlay} onPress={onClose} accessibilityRole="button" accessibilityLabel="Dismiss action sheet">
        <Pressable style={[styles.sheet, { backgroundColor: colors.modalBg, paddingBottom: Math.max(insets.bottom, 16) }]} onPress={() => {}}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          {title ? <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>{title}</Text> : null}
          {actions.map((action, i) => (
            <PressableRow key={i} style={styles.actionItem} onPress={() => { onClose?.(); action.onPress?.(); }} accessibilityRole="button" accessibilityLabel={action.label}>
              <Text style={[styles.actionText, { color: action.destructive ? colors.error : colors.textPrimary }]}>{action.label}</Text>
            </PressableRow>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
export default memo(ActionSheet);
const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 8, maxWidth: 500, alignSelf: 'center', width: '100%' },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  title: { fontSize: 15, fontWeight: '600', paddingHorizontal: 20, paddingBottom: 12, textAlign: 'center' },
  actionItem: { minHeight: 48, paddingVertical: 16, paddingHorizontal: 20, justifyContent: 'center' },
  actionText: { fontSize: 16, textAlign: 'center' },
});
