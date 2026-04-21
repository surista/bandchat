import { memo, useMemo } from 'react';
import { View, Text, Modal, Pressable, FlatList, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { CUSTOM_EMOJI, renderCustomEmoji } from './EmojiPicker';
import getAvatarColor from '../utils/getAvatarColor';

/**
 * Bottom sheet showing who reacted with a specific emoji.
 *
 * @param {boolean} visible - Whether the sheet is visible
 * @param {Array} reactions - All reactions for the message
 * @param {string} selectedEmoji - The emoji to filter by (or null for all)
 * @param {Function} onClose - Called when sheet should close
 */
function ReactionUsersSheet({ visible, reactions, selectedEmoji, onClose }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  // Group reactions by emoji with user lists
  const groupedReactions = useMemo(() => {
    if (!reactions?.length) return [];
    const groups = {};
    reactions.forEach(r => {
      if (!groups[r.emoji]) {
        groups[r.emoji] = { emoji: r.emoji, users: [] };
      }
      if (r.user) {
        groups[r.emoji].users.push(r.user);
      }
    });
    return Object.values(groups);
  }, [reactions]);

  // Filter to selected emoji or show all
  const displayGroups = useMemo(() => {
    if (!selectedEmoji) return groupedReactions;
    return groupedReactions.filter(g => g.emoji === selectedEmoji);
  }, [groupedReactions, selectedEmoji]);

  // Flatten for display: show emoji header then users
  const flatData = useMemo(() => {
    const items = [];
    displayGroups.forEach(group => {
      items.push({ type: 'header', emoji: group.emoji, count: group.users.length });
      group.users.forEach(user => {
        items.push({ type: 'user', user, emoji: group.emoji });
      });
    });
    return items;
  }, [displayGroups]);

  const renderItem = ({ item }) => {
    if (item.type === 'header') {
      return (
        <View style={[styles.headerRow, { borderBottomColor: colors.border }]}>
          {CUSTOM_EMOJI[item.emoji] ? (
            renderCustomEmoji(item.emoji, 24)
          ) : (
            <Text style={styles.headerEmoji}>{item.emoji}</Text>
          )}
          <Text style={[styles.headerCount, { color: colors.textSecondary }]}>
            {item.count} {item.count === 1 ? 'person' : 'people'}
          </Text>
        </View>
      );
    }

    const displayName = item.user.displayName || 'Unknown';
    const initial = displayName.charAt(0).toUpperCase();
    const avatarColor = getAvatarColor(displayName);

    return (
      <View style={styles.userRow}>
        <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <Text style={[styles.userName, { color: colors.textPrimary }]} numberOfLines={1}>
          {displayName}
        </Text>
      </View>
    );
  };

  if (!visible) return null;

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        style={styles.overlay}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close reactions list"
      >
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: colors.modalBg,
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
          onPress={() => {}}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <Text style={[styles.title, { color: colors.textPrimary }]}>Reactions</Text>
          <FlatList
            data={flatData}
            keyExtractor={(item, index) =>
              item.type === 'header' ? `header-${item.emoji}` : `user-${item.user.id}-${item.emoji}`
            }
            renderItem={renderItem}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default memo(ReactionUsersSheet);

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
    maxHeight: '60%',
    maxWidth: 500,
    alignSelf: 'center',
    width: '100%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
  },
  headerEmoji: {
    fontSize: 24,
  },
  headerCount: {
    fontSize: 14,
    marginLeft: 10,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingLeft: 8,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  userName: {
    fontSize: 15,
    marginLeft: 12,
    flex: 1,
  },
});
