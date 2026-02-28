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

export default function ThreadScreen({ route }) {
  const { parentMessage, channelId, workspaceId } = route.params;
  const { user } = useAuth();
  const { colors } = useTheme();
  const { socket, startTyping, stopTyping } = useSocket();

  const [parent, setParent] = useState(parentMessage);
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);

  const parentIdRef = useRef(parentMessage.id);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const data = await api.getReplies(parentMessage.id);
        if (cancelled) return;
        setReplies(data);
        await api.markThreadRead(parentMessage.id);
      } catch (err) {
        console.error('Failed to load thread:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    init();
    return () => { cancelled = true; };
  }, [parentMessage.id]);

  // Socket events for thread updates
  useEffect(() => {
    if (!socket) return;

    const handleReply = ({ parentId, message: reply }) => {
      if (parentId !== parentIdRef.current) return;
      setReplies(prev => {
        if (prev.some(r => r.id === reply.id)) return prev;
        // Replace optimistic message if matching
        const optimisticIdx = prev.findIndex(
          m => m.pending && m.author?.id === reply.author?.id && m.content === reply.content
        );
        if (optimisticIdx !== -1) {
          const updated = [...prev];
          updated[optimisticIdx] = reply;
          return updated;
        }
        return [...prev, reply];
      });
      api.markThreadRead(parentIdRef.current).catch(() => {});
    };

    const handleUpdatedMessage = (message) => {
      if (message.id === parentIdRef.current) {
        setParent(message);
      }
      setReplies(prev => prev.map(r => r.id === message.id ? message : r));
    };

    const handleDeletedMessage = ({ messageId }) => {
      setReplies(prev => prev.filter(r => r.id !== messageId));
    };

    const handleReactionAdded = ({ messageId, reaction }) => {
      if (messageId === parentIdRef.current) {
        setParent(prev => ({ ...prev, reactions: [...(prev.reactions || []), reaction] }));
      }
      setReplies(prev => prev.map(r => {
        if (r.id !== messageId) return r;
        return { ...r, reactions: [...(r.reactions || []), reaction] };
      }));
    };

    const handleReactionRemoved = ({ messageId, emoji, userId }) => {
      const filterReactions = (reactions) =>
        (reactions || []).filter(r => !(r.emoji === emoji && r.userId === userId));

      if (messageId === parentIdRef.current) {
        setParent(prev => ({ ...prev, reactions: filterReactions(prev.reactions) }));
      }
      setReplies(prev => prev.map(r => {
        if (r.id !== messageId) return r;
        return { ...r, reactions: filterReactions(r.reactions) };
      }));
    };

    socket.on('message:reply', handleReply);
    socket.on('message:updated', handleUpdatedMessage);
    socket.on('message:deleted', handleDeletedMessage);
    socket.on('reaction:added', handleReactionAdded);
    socket.on('reaction:removed', handleReactionRemoved);

    return () => {
      socket.off('message:reply', handleReply);
      socket.off('message:updated', handleUpdatedMessage);
      socket.off('message:deleted', handleDeletedMessage);
      socket.off('reaction:added', handleReactionAdded);
      socket.off('reaction:removed', handleReactionRemoved);
    };
  }, [socket]);

  const handleSend = useCallback(async (content) => {
    const optimisticReply = {
      id: `temp-${Date.now()}`,
      content,
      author: { id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl },
      channelId,
      parentId: parentMessage.id,
      createdAt: new Date().toISOString(),
      reactions: [],
      attachments: [],
      pending: true,
    };

    setReplies(prev => [...prev, optimisticReply]);

    try {
      const saved = await api.sendMessage(channelId, content, parentMessage.id);
      setReplies(prev => prev.map(r =>
        r.id === optimisticReply.id ? saved : r
      ));
    } catch (err) {
      setReplies(prev => prev.filter(r => r.id !== optimisticReply.id));
      console.error('Failed to send reply:', err);
    }
  }, [user, channelId, parentMessage.id]);

  const handleTyping = useCallback((isTyping) => {
    if (isTyping) startTyping(channelId);
    else stopTyping(channelId);
  }, [channelId, startTyping, stopTyping]);

  // Build list: parent message + separator + replies
  const listData = useMemo(() => {
    const items = [
      { ...parent, _isParent: true, _itemType: 'parent' },
      { id: '__separator', _itemType: 'separator', replyCount: replies.length },
      ...replies.map(r => ({ ...r, _itemType: 'reply' })),
    ];
    return items;
  }, [parent, replies]);

  const renderItem = useCallback(({ item }) => {
    if (item._itemType === 'separator') {
      return (
        <View style={[styles.separator, { borderBottomColor: colors.border }]}>
          <Text style={[styles.separatorText, { color: colors.textSecondary }]}>
            {item.replyCount} {item.replyCount === 1 ? 'reply' : 'replies'}
          </Text>
        </View>
      );
    }
    return <MessageBubble message={item} isGrouped={false} />;
  }, [colors]);

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
        data={listData}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      />
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
  listContent: {
    paddingVertical: 8,
  },
  separator: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  separatorText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
