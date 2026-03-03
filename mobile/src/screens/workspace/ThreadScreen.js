import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useSocket } from '../../context/SocketContext';
import api from '../../services/api';
import MessageBubble from '../../components/MessageBubble';
import MessageInput from '../../components/MessageInput';
import MessageActionSheet from '../../components/MessageActionSheet';
import EmojiPicker from '../../components/EmojiPicker';
import ImageViewer from '../../components/ImageViewer';

export default function ThreadScreen({ route }) {
  const { parentMessage, channelId, workspaceId } = route.params;
  const { user } = useAuth();
  const { colors } = useTheme();
  const { socket, startTyping, stopTyping } = useSocket();

  const [parent, setParent] = useState(parentMessage);
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workspaceMembers, setWorkspaceMembers] = useState([]);

  // Action sheet / picker state
  const [actionMessage, setActionMessage] = useState(null);
  const [showActions, setShowActions] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [editingMessage, setEditingMessage] = useState(null);
  const [viewingImage, setViewingImage] = useState(null);

  const parentIdRef = useRef(parentMessage.id);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const data = await api.getReplies(parentMessage.id);
        if (cancelled) return;
        setReplies(data.replies || []);
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

  // Load workspace members for @mention highlighting
  useEffect(() => {
    if (workspaceId) {
      api.getWorkspace(workspaceId).then(ws => {
        setWorkspaceMembers(ws.members || []);
      }).catch(() => {});
    }
  }, [workspaceId]);

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

  // Long-press → action sheet
  const handleLongPress = useCallback((message) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setActionMessage(message);
    setShowActions(true);
  }, []);

  // Handle action from the sheet
  const handleAction = useCallback((action) => {
    if (!actionMessage) return;

    switch (action) {
      case 'react':
        // Delay to let the action sheet Modal fully close before opening emoji picker Modal
        setTimeout(() => setShowEmojiPicker(true), 400);
        break;
      case 'copy':
        if (actionMessage.content) {
          Clipboard.setStringAsync(actionMessage.content);
        }
        break;
      case 'edit':
        setEditingMessage(actionMessage);
        break;
      case 'delete':
        Alert.alert(
          'Delete Message',
          'Are you sure you want to delete this message?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                try {
                  await api.deleteMessage(actionMessage.id);
                } catch (err) {
                  console.error('Failed to delete message:', err);
                }
              },
            },
          ]
        );
        break;
    }
  }, [actionMessage]);

  // Add reaction
  const handleAddReaction = useCallback(async (emoji) => {
    if (!actionMessage) return;
    try {
      await api.addReaction(actionMessage.id, emoji);
    } catch (err) {
      console.error('Failed to add reaction:', err);
    }
    setActionMessage(null);
  }, [actionMessage]);

  // Edit message
  const handleSendEdit = useCallback(async (messageId, content) => {
    try {
      await api.updateMessage(messageId, content);
    } catch (err) {
      console.error('Failed to edit message:', err);
    }
    setEditingMessage(null);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingMessage(null);
  }, []);

  // Tap reaction to toggle
  const handleReactionPress = useCallback(async (messageId, emoji) => {
    try {
      const allMessages = [parent, ...replies];
      const msg = allMessages.find(m => m.id === messageId);
      const hasReacted = msg?.reactions?.some(r => r.emoji === emoji && r.userId === user?.id);
      if (hasReacted) {
        await api.removeReaction(messageId, emoji);
      } else {
        await api.addReaction(messageId, emoji);
      }
    } catch (err) {
      console.error('Failed to toggle reaction:', err);
    }
  }, [parent, replies, user?.id]);

  // Image viewer
  const handleImagePress = useCallback((url) => {
    setViewingImage(url);
  }, []);

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
          <Text style={[styles.separatorText, { color: colors.textSecondary }]} accessibilityRole="header">
            {item.replyCount} {item.replyCount === 1 ? 'reply' : 'replies'}
          </Text>
        </View>
      );
    }
    return (
      <MessageBubble
        message={item}
        isGrouped={false}
        onLongPress={handleLongPress}
        onImagePress={handleImagePress}
        onReactionPress={handleReactionPress}
        members={workspaceMembers}
      />
    );
  }, [colors, handleLongPress, handleImagePress, handleReactionPress, workspaceMembers]);

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
      <MessageInput
        onSend={handleSend}
        onTyping={handleTyping}
        editingMessage={editingMessage}
        onCancelEdit={handleCancelEdit}
        onSendEdit={handleSendEdit}
      />

      {/* Action Sheet */}
      <MessageActionSheet
        visible={showActions}
        onClose={() => setShowActions(false)}
        onAction={handleAction}
        onQuickReaction={handleAddReaction}
        isOwnMessage={actionMessage?.author?.id === user?.id}
        hideReply
      />

      {/* Emoji Picker */}
      <EmojiPicker
        visible={showEmojiPicker}
        onClose={() => setShowEmojiPicker(false)}
        onSelect={handleAddReaction}
      />

      {/* Image Viewer */}
      <ImageViewer
        visible={!!viewingImage}
        imageUrl={viewingImage}
        onClose={() => setViewingImage(null)}
      />
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
