import { memo } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';

function ActionSheet({ visible, title, actions, onClose }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} accessibilityRole="button" accessibilityLabel="Dismiss action sheet">
        <View style={[styles.sheet, { backgroundColor: colors.modalBg, paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          {title ? <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>{title}</Text> : null}
          {actions.map((action, i) => (
            <TouchableOpacity key={i} style={styles.actionItem} onPress={action.onPress} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel={action.label}>
              <Text style={[styles.actionText, { color: action.destructive ? '#ef4444' : colors.textPrimary }]}>{action.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[styles.actionItem, styles.cancelItem]} onPress={onClose} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel="Cancel">
            <Text style={[styles.actionText, { color: colors.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}
export default memo(ActionSheet);
const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 8, maxWidth: 500, alignSelf: 'center', width: '100%' },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  title: { fontSize: 15, fontWeight: '600', paddingHorizontal: 20, paddingBottom: 12, textAlign: 'center' },
  actionItem: { paddingVertical: 16, paddingHorizontal: 20 },
  cancelItem: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(128,128,128,0.3)', marginTop: 4 },
  actionText: { fontSize: 16, textAlign: 'center' },
});
