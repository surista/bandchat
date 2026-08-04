import { memo, useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  Pressable,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { selectionFeedback } from '../utils/haptics';
import PressableRow from './PressableRow';
import { getFrequentEmojis, peekFrequentEmojis, trackEmojiUsage } from '../utils/emojiFrequency';
import { CUSTOM_EMOJI, renderCustomEmoji } from './EmojiPicker';

// Quick row shows the user's most-used emojis; the 6th slot is the "+" that
// opens the full picker.
const QUICK_COUNT = 5;

const ACTION_HINTS = {
  reply: 'Opens thread view',
  react: 'Opens emoji picker',
  pin: 'Pin this message to the channel',
  bookmark: 'Save this message for later',
  save: 'Downloads image to your device',
  copy: 'Copies message text to clipboard',
  copyLink: 'Copies a link to this message',
  edit: 'Opens message editor',
  delete: 'Permanently removes this message',
  report: 'Reports this message to admins',
};

const ACTIONS = [
  { key: 'reply', label: 'Reply in Thread', icon: 'chatbubble-outline' },
  { key: 'react', label: 'Add Reaction', icon: 'happy-outline' },
  { key: 'pin', label: 'Pin Message', icon: 'pin-outline' },
  { key: 'bookmark', label: 'Save Message', icon: 'bookmark-outline' },
  { key: 'save', label: 'Save Image', icon: 'download-outline', imageOnly: true },
  { key: 'copy', label: 'Copy Text', icon: 'copy-outline' },
  { key: 'copyLink', label: 'Copy Link', icon: 'link-outline' },
  { key: 'edit', label: 'Edit Message', icon: 'pencil-outline', ownOnly: true },
  { key: 'delete', label: 'Delete Message', icon: 'trash-outline', ownOnly: true, destructive: true },
  { key: 'report', label: 'Report Message', icon: 'warning-outline', notOwn: true, destructive: true },
];

function MessageActionSheet({ visible, onClose, onAction, onQuickReaction, isOwnMessage, isPinned, isBookmarked, hideReply, hasImageAttachment }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [quickEmojis, setQuickEmojis] = useState(() => peekFrequentEmojis(QUICK_COUNT));

  useEffect(() => {
    if (visible) getFrequentEmojis(QUICK_COUNT).then(setQuickEmojis);
  }, [visible]);

  const filteredActions = ACTIONS.filter(a =>
    (!a.ownOnly || isOwnMessage) && (!a.notOwn || !isOwnMessage) &&
    !(hideReply && a.key === 'reply') &&
    (!a.imageOnly || hasImageAttachment)
  ).map(a => {
    if (a.key === 'pin') return { ...a, label: isPinned ? 'Unpin Message' : 'Pin Message' };
    if (a.key === 'bookmark') return { ...a, label: isBookmarked ? 'Unsave Message' : 'Save Message' };
    return a;
  });

  const handleQuickReaction = (emoji) => {
    trackEmojiUsage(emoji);
    if (onQuickReaction) {
      onQuickReaction(emoji);
    }
    onClose();
  };

  const handleOpenFullPicker = () => {
    onClose();
    onAction('react');
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.modalBg, paddingBottom: Math.max(insets.bottom, 16) }]}
          onPress={() => {}}
          accessibilityViewIsModal
        >
          {/* Quick Reaction Row */}
          <View style={[styles.quickReactionRow, { borderBottomColor: colors.border }]}>
            {quickEmojis.map((emoji) => (
              <Pressable
                key={emoji}
                style={({ pressed }) => [
                  styles.quickReactionButton,
                  { backgroundColor: colors.bgTertiary },
                  pressed && Platform.OS === 'ios' && { opacity: 0.6 },
                ]}
                onPress={() => handleQuickReaction(emoji)}
                android_ripple={{ color: colors.border, borderless: false }}
                accessibilityRole="button"
                accessibilityLabel={`React with ${CUSTOM_EMOJI[emoji]?.alt || emoji}`}
              >
                {CUSTOM_EMOJI[emoji] ? (
                  renderCustomEmoji(emoji, 24)
                ) : (
                  <Text style={styles.quickReactionEmoji} maxFontSizeMultiplier={1.2}>{emoji}</Text>
                )}
              </Pressable>
            ))}
            <Pressable
              style={({ pressed }) => [
                styles.quickReactionButton,
                { backgroundColor: colors.bgTertiary },
                pressed && Platform.OS === 'ios' && { opacity: 0.6 },
              ]}
              onPress={handleOpenFullPicker}
              android_ripple={{ color: colors.border, borderless: false }}
              accessibilityRole="button"
              accessibilityLabel="Open full emoji picker"
            >
              <Text style={styles.quickReactionPlus} maxFontSizeMultiplier={1.5}>+</Text>
            </Pressable>
          </View>

          {filteredActions.map((action, i) => (
            <PressableRow
              key={action.key}
              style={[
                styles.actionRow,
                { borderBottomColor: colors.border },
                i === filteredActions.length - 1 && styles.lastRow,
              ]}
              onPress={() => {
                selectionFeedback();
                onClose();
                // Delay on iOS to let Modal close before Alert opens; Android doesn't need it
                setTimeout(() => onAction(action.key), Platform.OS === 'ios' ? 350 : 50);
              }}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              accessibilityHint={ACTION_HINTS[action.key]}
            >
              <Ionicons name={action.icon} size={20} color={action.destructive ? '#EF4444' : colors.textSecondary} style={styles.actionIcon} />
              <Text
                style={[
                  styles.actionLabel,
                  { color: action.destructive ? '#EF4444' : colors.textPrimary },
                ]}
              maxFontSizeMultiplier={1.2}>
                {action.label}
              </Text>
            </PressableRow>
          ))}
          {Platform.OS === 'ios' && (
            <PressableRow
              style={[styles.cancelButton, { backgroundColor: colors.bgTertiary }]}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={[styles.cancelText, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.5}>Cancel</Text>
            </PressableRow>
          )}
        </Pressable>
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
    paddingBottom: 16,
    paddingHorizontal: 16,
    maxWidth: 500,
    alignSelf: 'center',
    width: '100%',
  },
  quickReactionRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  quickReactionButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickReactionEmoji: {
    fontSize: 22,
  },
  quickReactionPlus: {
    fontSize: 24,
    fontWeight: '300',
    color: '#999',
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
