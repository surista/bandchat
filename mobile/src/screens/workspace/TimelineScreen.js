import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Image,
  RefreshControl,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { format, isToday, isYesterday } from 'date-fns';

function formatMessageDate(date) {
  const d = new Date(date);
  if (isToday(d)) return format(d, "'Today at' h:mm a");
  if (isYesterday(d)) return format(d, "'Yesterday at' h:mm a");
  return format(d, 'EEE, MMM d, h:mm a');
}

export default function TimelineScreen({ navigation, route }) {
  const { workspaceId } = route.params;
  const { colors } = useTheme();
  const { socket } = useSocket();
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const messagesRef = useRef(messages);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    navigation.setOptions({
      title: 'All Messages',
      headerStyle: { backgroundColor: colors.bgPrimary },
      headerTintColor: colors.textPrimary,
    });
  }, [navigation, colors]);

  const loadTimeline = useCallback(async (cursor = null, isRefresh = false) => {
    try {
      const data = await api.getMessagesTimeline(workspaceId, cursor);
      const msgs = data?.messages || [];
      if (isRefresh || !cursor) {
        setMessages(msgs);
      } else {
        setMessages(prev => [...prev, ...msgs]);
      }
      setHasMore(data?.hasMore || false);
      setNextCursor(data?.nextCursor || null);
    } catch (err) {
      console.error('Failed to load timeline:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadTimeline();
  }, [loadTimeline]);

  // Listen for new messages across all channels
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (message) => {
      // Only add if it's a top-level message (not a reply)
      if (!message.parentId && message.author?.id !== user?.id) {
        setMessages(prev => [message, ...prev]);
      }
    };

    socket.on('message:new', handleNewMessage);
    return () => {
      socket.off('message:new', handleNewMessage);
    };
  }, [socket, user?.id]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadTimeline(null, true);
  }, [loadTimeline]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || !nextCursor) return;
    setLoadingMore(true);
    loadTimeline(nextCursor);
  }, [loadingMore, hasMore, nextCursor, loadTimeline]);

  const navigateToChannel = useCallback((msg) => {
    if (msg.channel) {
      // Navigate to the channel with this message
      navigation.navigate('Channel', {
        channel: {
          id: msg.channel.id,
          name: msg.channel.name,
          isDM: msg.channel.isDirect,
        },
        workspaceId,
      });
    }
  }, [navigation, workspaceId]);

  const renderItem = useCallback(({ item: msg }) => {
    const channelLabel = msg.channel?.isDirect
      ? `DM with ${msg.author?.displayName || 'User'}`
      : `#${msg.channel?.name || 'unknown'}`;

    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}
        onPress={() => navigateToChannel(msg)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Message from ${msg.author?.displayName || 'Unknown'} in ${channelLabel}`}
      >
        <View style={styles.header}>
          <View style={styles.authorRow}>
            {msg.author?.avatarUrl ? (
              <Image source={{ uri: msg.author.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatarFallback, { backgroundColor: '#16a34a' }]}>
                <Text style={styles.avatarText}>{msg.author?.displayName?.[0] || '?'}</Text>
              </View>
            )}
            <View style={styles.authorInfo}>
              <Text style={[styles.authorName, { color: colors.textPrimary }]}>
                {msg.author?.displayName || 'Unknown'}
              </Text>
              <Text style={[styles.meta, { color: colors.textSecondary }]}>
                {formatMessageDate(msg.createdAt)}
              </Text>
            </View>
          </View>
          <View style={[styles.channelBadge, { backgroundColor: colors.bgTertiary }]}>
            <Text style={[styles.channelBadgeText, { color: colors.textSecondary }]} numberOfLines={1}>
              {channelLabel}
            </Text>
          </View>
        </View>
        {msg.content ? (
          <Text style={[styles.content, { color: colors.textPrimary }]} numberOfLines={3}>
            {msg.content}
          </Text>
        ) : null}
        {msg.attachments?.length > 0 && (
          <View style={styles.attachments}>
            {msg.attachments.slice(0, 2).map((att) => (
              att.type === 'IMAGE' ? (
                <Image
                  key={att.id}
                  source={{ uri: att.thumbnailUrl || att.url }}
                  style={styles.attachmentImage}
                  resizeMode="cover"
                />
              ) : (
                <Text key={att.id} style={[styles.attachmentFile, { color: colors.textSecondary }]}>
                  📎 {att.filename}
                </Text>
              )
            ))}
            {msg.attachments.length > 2 && (
              <Text style={[styles.moreAttachments, { color: colors.textSecondary }]}>
                +{msg.attachments.length - 2} more
              </Text>
            )}
          </View>
        )}
        {msg._count?.replies > 0 && (
          <Text style={[styles.replyCount, { color: colors.primary }]}>
            {msg._count.replies} {msg._count.replies === 1 ? 'reply' : 'replies'}
          </Text>
        )}
      </TouchableOpacity>
    );
  }, [colors, navigateToChannel]);

  const renderFooter = useCallback(() => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }, [loadingMore, colors]);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.bgPrimary }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (messages.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.bgPrimary }]}>
        <Text style={styles.emptyIcon}>📜</Text>
        <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No messages yet</Text>
        <Text style={[styles.emptyDescription, { color: colors.textSecondary }]}>
          Messages from all your channels and DMs will appear here in chronological order.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={renderFooter}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  list: {
    padding: 12,
  },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  authorInfo: {
    marginLeft: 8,
    flex: 1,
  },
  authorName: {
    fontSize: 14,
    fontWeight: '600',
  },
  meta: {
    fontSize: 12,
    marginTop: 1,
  },
  channelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    maxWidth: 120,
  },
  channelBadgeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  content: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  attachments: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  attachmentImage: {
    width: 60,
    height: 60,
    borderRadius: 6,
  },
  attachmentFile: {
    fontSize: 12,
  },
  moreAttachments: {
    fontSize: 12,
    alignSelf: 'center',
  },
  replyCount: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 8,
  },
  footer: {
    paddingVertical: 16,
    alignItems: 'center',
  },
});
