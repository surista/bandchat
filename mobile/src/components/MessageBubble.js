import { memo } from 'react';
import { View, Text, Image, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { format, isToday, isYesterday } from 'date-fns';
import { useTheme } from '../context/ThemeContext';

const AVATAR_COLORS = [
  '#E91E63', '#9C27B0', '#673AB7', '#3F51B5', '#2196F3',
  '#009688', '#4CAF50', '#FF9800', '#FF5722', '#795548',
];

function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatTimestamp(dateStr) {
  const date = new Date(dateStr);
  if (isToday(date)) return format(date, 'h:mm a');
  if (isYesterday(date)) return 'Yesterday ' + format(date, 'h:mm a');
  return format(date, 'MMM d, h:mm a');
}

function MessageBubble({ message, isGrouped, onLongPress, onReplyPress, onImagePress }) {
  const { colors } = useTheme();
  const author = message.author || {};
  const displayName = author.displayName || 'Unknown';
  const initial = displayName.charAt(0).toUpperCase();
  const avatarColor = getAvatarColor(displayName);
  const isPending = message.pending;
  const isEdited = message.updatedAt && message.updatedAt !== message.createdAt;

  const handleLongPress = () => {
    if (!isPending && onLongPress) onLongPress(message);
  };

  if (isGrouped) {
    return (
      <Pressable
        style={[styles.groupedContainer, isPending && styles.pending]}
        onLongPress={handleLongPress}
        delayLongPress={400}
      >
        <View style={styles.groupedSpacer} />
        <View style={styles.contentContainer}>
          {message.content ? (
            <Text style={[styles.content, { color: colors.textPrimary }]}>
              {message.content}
              {isEdited && <Text style={[styles.edited, { color: colors.textSecondary }]}> (edited)</Text>}
            </Text>
          ) : null}
          {renderAttachments(message.attachments, onImagePress)}
          {renderReactions(message.reactions, colors)}
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      style={[styles.container, isPending && styles.pending]}
      onLongPress={handleLongPress}
      delayLongPress={400}
    >
      <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
        {author.avatarUrl ? (
          <Image source={{ uri: author.avatarUrl }} style={styles.avatarImage} />
        ) : (
          <Text style={styles.avatarText}>{initial}</Text>
        )}
      </View>
      <View style={styles.contentContainer}>
        <View style={styles.header}>
          <Text style={[styles.authorName, { color: colors.textPrimary }]}>
            {displayName}
          </Text>
          <Text style={[styles.timestamp, { color: colors.textSecondary }]}>
            {formatTimestamp(message.createdAt)}
          </Text>
        </View>
        {message.content ? (
          <Text style={[styles.content, { color: colors.textPrimary }]}>
            {message.content}
            {isEdited && <Text style={[styles.edited, { color: colors.textSecondary }]}> (edited)</Text>}
          </Text>
        ) : null}
        {renderAttachments(message.attachments, onImagePress)}
        {renderReactions(message.reactions, colors)}
        {message._count?.replies > 0 && (
          <TouchableOpacity onPress={() => onReplyPress?.(message)} activeOpacity={0.6}>
            <Text style={[styles.replyCount, { color: colors.primary }]}>
              {message._count.replies} {message._count.replies === 1 ? 'reply' : 'replies'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </Pressable>
  );
}

function renderAttachments(attachments, onImagePress) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <View>
      {attachments
        .filter(att => att.type === 'IMAGE' && att.url)
        .map(att => (
          <TouchableOpacity
            key={att.id}
            onPress={() => onImagePress?.(att.url)}
            activeOpacity={0.8}
          >
            <Image
              source={{ uri: att.url }}
              style={styles.attachmentImage}
              resizeMode="cover"
            />
          </TouchableOpacity>
        ))}
    </View>
  );
}

function renderReactions(reactions, colors) {
  if (!reactions || reactions.length === 0) return null;

  const grouped = {};
  reactions.forEach(r => {
    if (!grouped[r.emoji]) grouped[r.emoji] = 0;
    grouped[r.emoji]++;
  });

  return (
    <View style={styles.reactionsRow}>
      {Object.entries(grouped).map(([emoji, count]) => (
        <View key={emoji} style={[styles.reactionBadge, { backgroundColor: colors.bgTertiary }]}>
          <Text style={styles.reactionEmoji}>{emoji}</Text>
          <Text style={[styles.reactionCount, { color: colors.textSecondary }]}>{count}</Text>
        </View>
      ))}
    </View>
  );
}

export default memo(MessageBubble);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  groupedContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 1,
    paddingBottom: 1,
  },
  pending: {
    opacity: 0.5,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    marginTop: 2,
  },
  avatarImage: {
    width: 36,
    height: 36,
    borderRadius: 6,
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  groupedSpacer: {
    width: 46,
  },
  contentContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 2,
  },
  authorName: {
    fontSize: 15,
    fontWeight: '700',
    marginRight: 8,
  },
  timestamp: {
    fontSize: 12,
  },
  content: {
    fontSize: 15,
    lineHeight: 21,
  },
  edited: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  attachmentImage: {
    width: 200,
    height: 150,
    borderRadius: 8,
    marginTop: 6,
  },
  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
    gap: 4,
  },
  reactionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  reactionEmoji: {
    fontSize: 14,
    marginRight: 3,
  },
  reactionCount: {
    fontSize: 12,
    fontWeight: '600',
  },
  replyCount: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
});
