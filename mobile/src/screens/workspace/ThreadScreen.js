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
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import { useHeaderHeight } from '@react-navigation/elements';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useSocket } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';
import { mediumImpact, successNotification } from '../../utils/haptics';
import api from '../../services/api';
import MessageBubble from '../../components/MessageBubble';
import MessageInput from '../../components/MessageInput';
import MessageActionSheet from '../../components/MessageActionSheet';
import EmojiPicker from '../../components/EmojiPicker';
import ImageViewer from '../../components/ImageViewer';
import { useLayout } from '../../hooks/useLayout';

export default function ThreadScreen({ navigation, route }) {
  const { parentMessage, channelId, workspaceId } = route.params;
  const { user } = useAuth();
  const { colors } = useTheme();
  const { socket, startTyping, stopTyping } = useSocket();
  const toast = useToast();
  const headerHeight = useHeaderHeight();
  const { isTablet, contentMaxWidth } = useLayout();

  const [parent, setParent] = useState(parentMessage);
  const [replies, setReplies] = useState([]);
  const parentRef = useRef(parent);
  const repliesRef = useRef(replies);
  useEffect(() => { parentRef.current = parent; }, [parent]);
  useEffect(() => { repliesRef.current = replies; }, [replies]);
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
        // silently fail
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
    }
  }, [user, channelId, parentMessage.id]);

  const handleTyping = useCallback((isTyping) => {
    if (isTyping) startTyping(channelId);
    else stopTyping(channelId);
  }, [channelId, startTyping, stopTyping]);

  // Long-press → action sheet
  const handleLongPress = useCallback((message) => {
    mediumImpact();
    setActionMessage(message);
    setShowActions(true);
  }, []);

  // Handle action from the sheet
  const handleAction = useCallback((action) => {
    if (!actionMessage) return;

    switch (action) {
      case 'react':
        setShowEmojiPicker(true);
        break;
      case 'copy':
        if (actionMessage.content) {
          Clipboard.setStringAsync(actionMessage.content);
          successNotification();
          toast.success('Copied to clipboard');
        }
        break;
      case 'edit':
        setEditingMessage(actionMessage);
        break;
      case 'save':
        (async () => {
          try {
            const img = actionMessage.attachments?.find(a => a.type === 'IMAGE');
            if (!img?.url) return;
            const { status } = await MediaLibrary.requestPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Permission needed', 'Allow BandChat to save photos to your library.');
              return;
            }
            let filename = img.url.split('/').pop()?.split('?')[0] || '';
            if (!filename || !filename.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
              filename = `image-${Date.now()}.jpg`;
            }
            const localUri = FileSystem.cacheDirectory + filename;
            await FileSystem.downloadAsync(img.url, localUri);
            await MediaLibrary.saveToLibraryAsync(localUri);
            Alert.alert('Saved', 'Image saved to your photo library.');
          } catch (err) {
            Alert.alert('Error', 'Failed to save image.');
          }
        })();
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
                  // silently fail
                }
              },
            },
          ]
        );
        break;
    }
  }, [actionMessage]);

  // Add/remove reaction (toggle)
  const handleAddReaction = useCallback(async (emoji) => {
    if (!actionMessage) return;
    try {
      const hasReacted = actionMessage.reactions?.some(
        r => r.emoji === emoji && r.userId === user?.id
      );
      if (hasReacted) {
        await api.removeReaction(actionMessage.id, emoji);
      } else {
        await api.addReaction(actionMessage.id, emoji);
      }
    } catch (err) {
      // silently fail
    }
    setActionMessage(null);
  }, [actionMessage, user?.id]);

  // Edit message
  const handleSendEdit = useCallback(async (messageId, content) => {
    try {
      await api.updateMessage(messageId, content);
    } catch (err) {
      // silently fail
    }
    setEditingMessage(null);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingMessage(null);
  }, []);

  // Tap reaction to toggle
  const handleReactionPress = useCallback(async (messageId, emoji) => {
    try {
      const allMessages = [parentRef.current, ...repliesRef.current];
      const msg = allMessages.find(m => m.id === messageId);
      const hasReacted = msg?.reactions?.some(r => r.emoji === emoji && r.userId === user?.id);
      if (hasReacted) {
        await api.removeReaction(messageId, emoji);
      } else {
        await api.addReaction(messageId, emoji);
      }
    } catch (err) {
      // silently fail
    }
  }, [user?.id]);

  // Avatar press → profile
  const handleAvatarPress = useCallback((author) => {
    if (author?.id) {
      navigation.navigate('MemberProfile', {
        workspaceId,
        userId: author.id,
        displayName: author.displayName,
      });
    }
  }, [navigation, workspaceId]);

  // Image viewer
  const handleImagePress = useCallback((url) => {
    setViewingImage(url);
  }, []);

  // Toggle link preview visibility
  const handleTogglePreview = useCallback(async (messageId) => {
    try {
      await api.toggleMessagePreview(messageId);
    } catch (err) {
      // silently fail
    }
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
        onSwipeReact={handleReactionPress}
        onAvatarPress={handleAvatarPress}
        members={workspaceMembers}
        isOwn={item.author?.id === user?.id}
        onTogglePreview={handleTogglePreview}
      />
    );
  }, [colors, handleLongPress, handleImagePress, handleReactionPress, handleAvatarPress, handleTogglePreview, workspaceMembers, user?.id]);

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
      style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
    >
      <View style={[styles.chatContainer, isTablet && { maxWidth: contentMaxWidth }]}>
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
        hasImageAttachment={actionMessage?.attachments?.some(a => a.type === 'IMAGE')}
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
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabletContainer: {
    alignItems: 'center',
  },
  chatContainer: {
    flex: 1,
    width: '100%',
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
