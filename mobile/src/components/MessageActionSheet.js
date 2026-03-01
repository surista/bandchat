import { memo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Pressable,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';

const ACTIONS = [
  { key: 'reply', label: 'Reply in Thread', icon: '\u{1F4AC}' },
  { key: 'react', label: 'Add Reaction', icon: '\u{1F600}' },
  { key: 'copy', label: 'Copy Text', icon: '\u{1F4CB}' },
  { key: 'edit', label: 'Edit Message', icon: '\u{270F}\u{FE0F}', ownOnly: true },
  { key: 'delete', label: 'Delete Message', icon: '\u{1F5D1}\u{FE0F}', ownOnly: true, destructive: true },
  { key: 'report', label: 'Report Message', icon: '\u{26A0}\u{FE0F}', notOwn: true, destructive: true },
];

function MessageActionSheet({ visible, onClose, onAction, isOwnMessage, hideReply }) {
  const { colors } = useTheme();

  const filteredActions = ACTIONS.filter(a =>
    (!a.ownOnly || isOwnMessage) && (!a.notOwn || !isOwnMessage) &&
    !(hideReply && a.key === 'reply')
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={[styles.sheet, { backgroundColor: colors.modalBg }]}>
          {filteredActions.map((action, i) => (
            <TouchableOpacity
              key={action.key}
              style={[
                styles.actionRow,
                { borderBottomColor: colors.border },
                i === filteredActions.length - 1 && styles.lastRow,
              ]}
              onPress={() => {
                onClose();
                onAction(action.key);
              }}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel={action.label}
            >
              <Text style={styles.actionIcon}>{action.icon}</Text>
              <Text
                style={[
                  styles.actionLabel,
                  { color: action.destructive ? '#EF4444' : colors.textPrimary },
                ]}
              >
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.cancelButton, { backgroundColor: colors.bgTertiary }]}
            onPress={onClose}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={[styles.cancelText, { color: colors.textPrimary }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

export default memo(MessageActionSheet);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    paddingBottom: 34,
    paddingHorizontal: 16,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  actionIcon: {
    fontSize: 20,
    marginRight: 14,
    width: 28,
    textAlign: 'center',
  },
  actionLabel: {
    fontSize: 16,
  },
  cancelButton: {
    marginTop: 10,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
