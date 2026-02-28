import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useSocket } from '../../context/SocketContext';
import api from '../../services/api';
import MessageBubble from '../../components/MessageBubble';
import MessageInput from '../../components/MessageInput';
import { format, isSameDay } from 'date-fns';

const GROUP_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export default function ChannelScreen({ route }) {
  const { channel, workspaceId } = route.params;
  const { user } = useAuth();
  const { colors } = useTheme();
  const { socket, joinChannel, leaveChannel, startTyping, stopTyping } = useSocket();

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [typingUsers, setTypingUsers] = useState([]);

  const channelIdRef = useRef(channel.id);
  const userIdRef = useRef(user?.id);
  const flatListRef = useRef(null);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    channelIdRef.current = channel.id;
    userIdRef.current = user?.id;
  }, [channel.id, user?.id]);

  // Load messages → mark read → join socket (exact order from web)
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      setLoading(true);
      setMessages([]);
      setTypingUsers([]);

      try {
        // Step 1: Load messages
        const data = await api.getMessages(channel.id);
        if (cancelled) return;
        setMessages(data.messages);
        setHasMore(data.hasMore);
        setNextCursor(data.nextCursor);

        // Step 2: Mark channel as read
        await api.markChannelRead(channel.id);

        // Step 3: Join socket room
        if (!cancelled) joinChannel(channel.id);
      } catch (err) {
        console.error('Failed to load messages:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    init();

    return () => {
      cancelled = true;
      leaveChannel(channel.id);
    };
  }, [channel.id, joinChannel, leaveChannel]);

  // Socket event handlers
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (message) => {
      if (message.channelId !== channelIdRef.current) return;

      setMessages(prev => {
        // Deduplicate: skip if message already exists
        if (prev.some(m => m.id === message.id)) return prev;

        // Check if this confirms an optimistic message
        const optimisticIdx = prev.findIndex(
          m => m.pending && m.author?.id === message.author?.id && m.content === message.content
        );
        if (optimisticIdx !== -1) {
          const updated = [...prev];
          updated[optimisticIdx] = message;
          return updated;
        }

        return [...prev, message];
      });

      // Mark as read if from another user
      if (message.author?.id !== userIdRef.current) {
        api.markChannelRead(channelIdRef.current).catch(() => {});
      }
    };

    const handleUpdatedMessage = (message) => {
      if (message.channelId !== channelIdRef.current) return;
      setMessages(prev => prev.map(m => m.id === message.id ? message : m));
    };

    const handleDeletedMessage = ({ messageId, channelId }) => {
      if (channelId !== channelIdRef.current) return;
      setMessages(prev => prev.filter(m => m.id !== messageId));
    };

    const handleTypingStart = ({ channelId, user: typingUser }) => {
      if (channelId !== channelIdRef.current) return;
      if (typingUser.id === userIdRef.current) return;
      setTypingUsers(prev => {
        if (prev.find(u => u.id === typingUser.id)) return prev;
        return [...prev, typingUser];
      });
    };

    const handleTypingStop = ({ channelId, userId }) => {
      if (channelId !== channelIdRef.current) return;
      setTypingUsers(prev => prev.filter(u => u.id !== userId));
    };

    const handleReactionAdded = ({ messageId, reaction, channelId }) => {
      if (channelId !== channelIdRef.current) return;
      setMessages(prev => prev.map(m => {
        if (m.id !== messageId) return m;
        return { ...m, reactions: [...(m.reactions || []), reaction] };
      }));
    };

    const handleReactionRemoved = ({ messageId, emoji, userId, channelId }) => {
      if (channelId !== channelIdRef.current) return;
      setMessages(prev => prev.map(m => {
        if (m.id !== messageId) return m;
        const reactions = (m.reactions || []).filter(
          r => !(r.emoji === emoji && r.userId === userId)
        );
        return { ...m, reactions };
      }));
    };

    const handleReconnect = () => {
      const chId = channelIdRef.current;
      joinChannel(chId);
      api.getMessages(chId).then(data => {
        if (chId === channelIdRef.current) {
          setMessages(data.messages);
          setHasMore(data.hasMore);
          setNextCursor(data.nextCursor);
        }
      }).catch(err => console.warn('Failed to refresh on reconnect:', err.message));
    };

    socket.on('message:new', handleNewMessage);
    socket.on('message:updated', handleUpdatedMessage);
    socket.on('message:deleted', handleDeletedMessage);
    socket.on('typing:start', handleTypingStart);
    socket.on('typing:stop', handleTypingStop);
    socket.on('reaction:added', handleReactionAdded);
    socket.on('reaction:removed', handleReactionRemoved);
    socket.on('connect', handleReconnect);

    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('message:updated', handleUpdatedMessage);
      socket.off('message:deleted', handleDeletedMessage);
      socket.off('typing:start', handleTypingStart);
      socket.off('typing:stop', handleTypingStop);
      socket.off('reaction:added', handleReactionAdded);
      socket.off('reaction:removed', handleReactionRemoved);
      socket.off('connect', handleReconnect);
    };
  }, [socket, joinChannel]);

  // Load older messages (pagination)
  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMoreRef.current || !nextCursor) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const data = await api.getMessages(channel.id, nextCursor);
      setMessages(prev => [...data.messages, ...prev]);
      setHasMore(data.hasMore);
      setNextCursor(data.nextCursor);
    } catch (err) {
      console.error('Failed to load more messages:', err);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, nextCursor, channel.id]);

  // Send message with optimistic update
  const handleSend = useCallback(async (content) => {
    const optimisticMessage = {
      id: `temp-${Date.now()}`,
      content,
      author: { id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl },
      channelId: channel.id,
      createdAt: new Date().toISOString(),
      reactions: [],
      attachments: [],
      _count: { replies: 0 },
      pending: true,
    };

    setMessages(prev => [...prev, optimisticMessage]);

    try {
      const savedMessage = await api.sendMessage(channel.id, content);
      setMessages(prev => prev.map(m =>
        m.id === optimisticMessage.id ? savedMessage : m
      ));
    } catch (err) {
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => m.id !== optimisticMessage.id));
      console.error('Failed to send message:', err);
    }
  }, [user, channel.id]);

  // Typing handler
  const handleTyping = useCallback((isTyping) => {
    if (isTyping) {
      startTyping(channel.id);
    } else {
      stopTyping(channel.id);
    }
  }, [channel.id, startTyping, stopTyping]);

  // Prepare data for inverted FlatList
  const invertedMessages = useMemo(() => [...messages].reverse(), [messages]);

  // Check if message should be grouped with the one after it (visually above in inverted list)
  const isGrouped = useCallback((message, index) => {
    // In inverted list, index 0 is the newest. The next message (index+1) is older.
    // We want to group with the message that comes BEFORE this one chronologically
    // (which is index-1 in the inverted array = the visually-below message).
    const nextIdx = index - 1; // the next message chronologically (newer)
    if (nextIdx < 0) return false;
    const prevMsg = invertedMessages[nextIdx];
    if (!prevMsg || !message.author || !prevMsg.author) return false;
    if (prevMsg.author.id !== message.author.id) return false;
    const timeDiff = new Date(prevMsg.createdAt) - new Date(message.createdAt);
    return Math.abs(timeDiff) < GROUP_THRESHOLD_MS;
  }, [invertedMessages]);

  // Date separator check
  const needsDateSeparator = useCallback((message, index) => {
    // In inverted list, check the message above (index+1 = older message)
    const olderIdx = index + 1;
    if (olderIdx >= invertedMessages.length) return true; // first message ever
    const olderMsg = invertedMessages[olderIdx];
    return !isSameDay(new Date(message.createdAt), new Date(olderMsg.createdAt));
  }, [invertedMessages]);

  const renderItem = useCallback(({ item, index }) => {
    const grouped = isGrouped(item, index);
    const showDate = needsDateSeparator(item, index);

    // In inverted FlatList, render date separator AFTER the message
    // so it appears visually above the message group
    return (
      <View>
        <MessageBubble message={item} isGrouped={grouped} />
        {showDate && (
          <View style={styles.dateSeparator}>
            <View style={[styles.dateLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.dateText, { color: colors.textSecondary, backgroundColor: colors.bgPrimary }]}>
              {format(new Date(item.createdAt), 'EEEE, MMMM d')}
            </Text>
            <View style={[styles.dateLine, { backgroundColor: colors.border }]} />
          </View>
        )}
      </View>
    );
  }, [isGrouped, needsDateSeparator, colors]);

  const renderFooter = useCallback(() => {
    if (!loadingMore) return null;
    return (
      <View style={styles.loadingMore}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }, [loadingMore, colors]);

  const typingText = useMemo(() => {
    if (typingUsers.length === 0) return null;
    if (typingUsers.length === 1) return `${typingUsers[0].displayName} is typing...`;
    if (typingUsers.length === 2) return `${typingUsers[0].displayName} and ${typingUsers[1].displayName} are typing...`;
    return 'Several people are typing...';
  }, [typingUsers]);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.bgPrimary }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <FlatList
        ref={flatListRef}
        data={invertedMessages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        inverted
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={renderFooter}
        contentContainerStyle={styles.messageList}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      />
      {typingText && (
        <View style={[styles.typingBar, { backgroundColor: colors.bgSecondary }]}>
          <Text style={[styles.typingText, { color: colors.textSecondary }]}>
            {typingText}
          </Text>
        </View>
      )}
      <MessageInput onSend={handleSend} onTyping={handleTyping} />
    </KeyboardAvoidingView>
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
  messageList: {
    paddingVertical: 8,
  },
  loadingMore: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  dateSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dateLine: {
    flex: 1,
    height: 1,
  },
  dateText: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 12,
  },
  typingBar: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  typingText: {
    fontSize: 13,
    fontStyle: 'italic',
  },
});
