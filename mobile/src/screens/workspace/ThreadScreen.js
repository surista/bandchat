import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  StyleSheet,
} from 'react-native';
import { useHeaderHeight } from '@react-navigation/elements';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useSocket } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';
import notificationService from '../../services/notifications';
import MessageBubble from '../../components/MessageBubble';
import MessageInput from '../../components/MessageInput';
import MessageActionSheet from '../../components/MessageActionSheet';
import EmojiPicker from '../../components/EmojiPicker';
import ImageViewer from '../../components/ImageViewer';
import ActionSheet from '../../components/ActionSheet';
import ErrorState from '../../components/ErrorState';
import { useLayout } from '../../hooks/useLayout';
import useMessageActions from '../../hooks/useMessageActions';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ThreadScreen({ navigation, route }) {
  const { parentMessage, channelId, workspaceId } = route.params;
  const { user } = useAuth();
  const { colors } = useTheme();
  const { socket, startTyping, stopTyping } = useSocket();
  const toast = useToast();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const { isTablet, contentMaxWidth } = useLayout();

  const [parent, setParent] = useState(parentMessage);
  const [replies, setReplies] = useState([]);
  const parentRef = useRef(parent);
  const repliesRef = useRef(replies);
  const flatListRef = useRef(null);
  useEffect(() => { parentRef.current = parent; }, [parent]);
  useEffect(() => { repliesRef.current = replies; }, [replies]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [workspaceMembers, setWorkspaceMembers] = useState([]);
  const [workspaceChannels, setWorkspaceChannels] = useState([]);

  const parentIdRef = useRef(parentMessage.id);

  // Track keyboard visibility for Android bottom inset + scroll handling
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const showSub = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardVisible(true);
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
    });
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  // Suppress foreground notifications for this channel while viewing thread
  useEffect(() => {
    notificationService.setActiveChannel(channelId);
    notificationService.clearBadge();
    return () => notificationService.clearActiveChannel();
  }, [channelId]);

  const findMessage = useCallback((id) => {
    if (parentRef.current?.id === id) return parentRef.current;
    return repliesRef.current.find(m => m.id === id);
  }, []);

  const {
    actionMessage, showActions, showEmojiPicker, editingMessage, viewingImage,
    blockedDomains, linkActionUrl,
    setShowActions, setShowEmojiPicker, setViewingImage, setLinkActionUrl,
    handleLongPress, handleAction, handleAddReaction, handleSendEdit,
    handleCancelEdit, handleReactionPress, handleImagePress, handleTogglePreview,
    handleLinkLongPress, toggleBlockedDomain,
  } = useMessageActions({ findMessage, workspaceId, channelId });

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        setLoadError(null);
        const data = await api.getReplies(parentMessage.id);
        if (cancelled) return;
        setReplies(data.replies || []);
        await api.markThreadRead(parentMessage.id);
      } catch (err) {
        if (!cancelled) setLoadError('Failed to load replies');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    init();
    return () => { cancelled = true; };
  }, [parentMessage.id]);

  // Load workspace members for @mention highlighting and channels for #channel references
  useEffect(() => {
    if (workspaceId) {
      api.getWorkspace(workspaceId).then(ws => {
        setWorkspaceMembers(ws.members || []);
      }).catch(() => {});
      api.getChannels(workspaceId).then(ch => {
        setWorkspaceChannels(ch);
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

  const handleSend = useCallback(async (content, attachmentOrArray) => {
    const fileList = !attachmentOrArray ? [] :
      Array.isArray(attachmentOrArray) ? attachmentOrArray :
      [attachmentOrArray];
    const hasFiles = fileList.length > 0;

    const optimisticReply = {
      id: `temp-${Date.now()}`,
      content: content || '',
      author: { id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl },
      channelId,
      parentId: parentMessage.id,
      createdAt: new Date().toISOString(),
      reactions: [],
      attachments: fileList.map((att, i) => ({
        id: `temp-att-${Date.now()}-${i}`,
        type: att.isVideo ? 'VIDEO' : att.isAudio ? 'AUDIO' : 'IMAGE',
        url: att.uri,
        pending: true,
      })),
      pending: true,
    };

    setReplies(prev => [...prev, optimisticReply]);

    try {
      let uploadedAttachments = null;
      if (hasFiles) {
        const uploads = [];
        for (const att of fileList) {
          const uploaded = await api.uploadFile(att.uri, att.filename, att.mimeType, workspaceId);
          uploads.push(uploaded);
        }
        uploadedAttachments = uploads;
      }
      const saved = await api.sendMessage(channelId, content || '', parentMessage.id, uploadedAttachments);
      setReplies(prev => prev.map(r =>
        r.id === optimisticReply.id ? saved : r
      ));
    } catch (err) {
      setReplies(prev => prev.filter(r => r.id !== optimisticReply.id));
      toast.error('Failed to send reply');
    }
  }, [user, channelId, parentMessage.id, workspaceId, toast]);

  const handleSendVoice = useCallback(async (uri) => {
    const filename = `voice-${Date.now()}.m4a`;
    const optimisticReply = {
      id: `temp-${Date.now()}`,
      content: '',
      author: { id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl },
      channelId,
      parentId: parentMessage.id,
      createdAt: new Date().toISOString(),
      reactions: [],
      attachments: [{ id: `temp-att-${Date.now()}`, type: 'AUDIO', url: uri, filename, pending: true }],
      pending: true,
    };

    setReplies(prev => [...prev, optimisticReply]);

    try {
      const uploaded = await api.uploadFile(uri, filename, 'audio/mp4', workspaceId);
      const saved = await api.sendMessage(channelId, '', parentMessage.id, [uploaded]);
      setReplies(prev => prev.map(r =>
        r.id === optimisticReply.id ? saved : r
      ));
    } catch (err) {
      setReplies(prev => prev.filter(r => r.id !== optimisticReply.id));
      toast.error('Failed to send voice message');
    }
  }, [user, channelId, parentMessage.id, workspaceId, toast]);

  const handleTyping = useCallback((isTyping) => {
    if (isTyping) startTyping(channelId);
    else stopTyping(channelId);
  }, [channelId, startTyping, stopTyping]);

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

  // Channel reference tap → navigate to that channel
  const handleChannelRefPress = useCallback((ch) => {
    if (ch?.id) {
      navigation.navigate('Channel', { channel: ch, workspaceId });
    }
  }, [navigation, workspaceId]);

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
        blockedDomains={blockedDomains}
        onLinkLongPress={handleLinkLongPress}
        channels={workspaceChannels}
        onChannelPress={handleChannelRefPress}
      />
    );
  }, [colors, handleLongPress, handleImagePress, handleReactionPress, handleAvatarPress, handleTogglePreview, workspaceMembers, user?.id, blockedDomains, handleLinkLongPress, workspaceChannels, handleChannelRefPress]);

  const handleRetry = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const data = await api.getReplies(parentMessage.id);
        setReplies(data.replies || []);
        await api.markThreadRead(parentMessage.id);
      } catch (err) {
        setLoadError('Failed to load replies');
      } finally {
        setLoading(false);
      }
    })();
  }, [parentMessage.id]);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
        <ErrorState
          title="Couldn't load thread"
          message={loadError}
          onRetry={handleRetry}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
    >
      <View style={[styles.chatContainer, isTablet && { maxWidth: contentMaxWidth }]}>
      <FlatList
        ref={flatListRef}
        data={listData}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        maxToRenderPerBatch={10}
        windowSize={10}
        initialNumToRender={15}
        removeClippedSubviews={Platform.OS === 'android'}
      />
      <MessageInput
        onSend={handleSend}
        onSendVoice={handleSendVoice}
        onTyping={handleTyping}
        editingMessage={editingMessage}
        onCancelEdit={handleCancelEdit}
        onSendEdit={handleSendEdit}
        members={workspaceMembers}
        channels={workspaceChannels}
      />
      {insets.bottom > 0 && !keyboardVisible && <View style={{ height: insets.bottom }} />}

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

      {/* Link Preview Domain Block ActionSheet */}
      <ActionSheet
        visible={!!linkActionUrl}
        onClose={() => setLinkActionUrl(null)}
        title={linkActionUrl ? (() => { try { return new URL(linkActionUrl).hostname; } catch { return linkActionUrl; } })() : ''}
        actions={(() => {
          if (!linkActionUrl) return [];
          let domain;
          try { domain = new URL(linkActionUrl).hostname; } catch { return []; }
          const isBlocked = blockedDomains.has(domain);
          return [{
            label: isBlocked ? `Show previews from ${domain}` : `Block previews from ${domain}`,
            onPress: () => toggleBlockedDomain(linkActionUrl),
          }];
        })()}
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
