import { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Alert,
  Modal,
  TextInput,
  TouchableOpacity,
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
import { format, isSameDay } from 'date-fns';

const GROUP_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export default function ChannelScreen({ navigation, route }) {
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

  // Action sheet / picker state
  const [actionMessage, setActionMessage] = useState(null);
  const [showActions, setShowActions] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [editingMessage, setEditingMessage] = useState(null);
  const [viewingImage, setViewingImage] = useState(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);

  const [seenByCount, setSeenByCount] = useState(null);
  const [lastOwnMessageId, setLastOwnMessageId] = useState(null);

  const channelIdRef = useRef(channel.id);
  const userIdRef = useRef(user?.id);
  const flatListRef = useRef(null);
  const loadingMoreRef = useRef(false);
  const blockedIdsRef = useRef(new Set());
  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  useEffect(() => {
    channelIdRef.current = channel.id;
    userIdRef.current = user?.id;
  }, [channel.id, user?.id]);

  // Header: info/settings button (hidden for DMs)
  useLayoutEffect(() => {
    if (channel.isDM) return;
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate('ChannelSettings', { channel, workspaceId })}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Channel settings"
        >
          <Text style={{ fontSize: 20 }}>{'\u2139\uFE0F'}</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, channel, workspaceId]);

  // Load blocked user IDs for socket filtering
  useEffect(() => {
    api.getBlockedUsers().then(blocks => {
      blockedIdsRef.current = new Set(blocks.map(b => b.blockedUserId));
    }).catch(() => {});
  }, []);

  // Load messages → mark read → join socket (exact order from web)
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      setLoading(true);
      setMessages([]);
      setTypingUsers([]);

      try {
        const data = await api.getMessages(channel.id);
        if (cancelled) return;
        setMessages(data.messages);
        setHasMore(data.hasMore);
        setNextCursor(data.nextCursor);

        await api.markChannelRead(channel.id);

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
      // Ignore replies (they go to threads)
      if (message.parentId) return;
      // Filter blocked users
      if (blockedIdsRef.current.has(message.author?.id)) return;

      setMessages(prev => {
        if (prev.some(m => m.id === message.id)) return prev;

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

    const handleReply = ({ parentId, message: reply }) => {
      if (reply.channelId !== channelIdRef.current) return;
      // Update reply count on parent message
      setMessages(prev => prev.map(m => {
        if (m.id !== parentId) return m;
        return { ...m, _count: { ...m._count, replies: (m._count?.replies || 0) + 1 } };
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
    socket.on('message:reply', handleReply);
    socket.on('connect', handleReconnect);

    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('message:updated', handleUpdatedMessage);
      socket.off('message:deleted', handleDeletedMessage);
      socket.off('typing:start', handleTypingStart);
      socket.off('typing:stop', handleTypingStop);
      socket.off('reaction:added', handleReactionAdded);
      socket.off('reaction:removed', handleReactionRemoved);
      socket.off('message:reply', handleReply);
      socket.off('connect', handleReconnect);
    };
  }, [socket, joinChannel]);

  const lastOwnMsgId = useMemo(() => {
    if (!messages.length || !user?.id) return null;
    const lastOwn = [...messages].reverse().find(m => m.author?.id === user.id && !m.pending);
    return lastOwn?.id || null;
  }, [messages, user?.id]);

  useEffect(() => {
    if (!lastOwnMsgId) return;
    setLastOwnMessageId(lastOwnMsgId);
    api.getMessageSeenBy(lastOwnMsgId)
      .then(data => setSeenByCount(data.count ?? data.length ?? 0))
      .catch(() => setSeenByCount(null));
  }, [lastOwnMsgId]);

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

  // Send message with optimistic update + optional attachment
  const handleSend = useCallback(async (content, attachment) => {
    const attType = attachment ? (attachment.isVideo ? 'VIDEO' : attachment.isAudio ? 'AUDIO' : 'IMAGE') : null;
    const optimisticMessage = {
      id: `temp-${Date.now()}`,
      content: content || '',
      author: { id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl },
      channelId: channel.id,
      createdAt: new Date().toISOString(),
      reactions: [],
      attachments: attachment ? [{ id: `temp-att-${Date.now()}`, type: attType, url: attachment.uri, pending: true }] : [],
      _count: { replies: 0 },
      pending: true,
    };

    setMessages(prev => [...prev, optimisticMessage]);

    try {
      let uploadedAttachments = null;
      if (attachment) {
        const uploaded = await api.uploadFile(attachment.uri, attachment.filename, attachment.mimeType);
        uploadedAttachments = [uploaded];
      }
      const savedMessage = await api.sendMessage(channel.id, content || '', null, uploadedAttachments);
      setMessages(prev => prev.map(m =>
        m.id === optimisticMessage.id ? savedMessage : m
      ));
    } catch (err) {
      setMessages(prev => prev.filter(m => m.id !== optimisticMessage.id));
      console.error('Failed to send message:', err);
    }
  }, [user, channel.id]);

  // Send voice message
  const handleSendVoice = useCallback(async (uri) => {
    const filename = `voice-${Date.now()}.m4a`;
    const optimisticMessage = {
      id: `temp-${Date.now()}`,
      content: '',
      author: { id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl },
      channelId: channel.id,
      createdAt: new Date().toISOString(),
      reactions: [],
      attachments: [{ id: `temp-att-${Date.now()}`, type: 'AUDIO', url: uri, filename, pending: true }],
      _count: { replies: 0 },
      pending: true,
    };

    setMessages(prev => [...prev, optimisticMessage]);

    try {
      const uploaded = await api.uploadFile(uri, filename, 'audio/m4a');
      const savedMessage = await api.sendMessage(channel.id, '', null, [uploaded]);
      setMessages(prev => prev.map(m =>
        m.id === optimisticMessage.id ? savedMessage : m
      ));
    } catch (err) {
      setMessages(prev => prev.filter(m => m.id !== optimisticMessage.id));
      console.error('Failed to send voice message:', err);
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
      case 'reply':
        navigation.navigate('Thread', { parentMessage: actionMessage, channelId: channel.id, workspaceId });
        break;
      case 'react':
        setShowEmojiPicker(true);
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
      case 'report':
        setReportReason('');
        setShowReportModal(true);
        break;
    }
  }, [actionMessage, navigation, channel.id, workspaceId]);

  // Submit report
  const handleSubmitReport = useCallback(async () => {
    if (!reportReason.trim() || !actionMessage) {
      Alert.alert('Error', 'Please provide a reason for your report.');
      return;
    }
    setReportSubmitting(true);
    try {
      await api.reportMessage(actionMessage.id, reportReason.trim());
      setShowReportModal(false);
      setActionMessage(null);
      Alert.alert('Report Submitted', "We'll review it shortly. Thank you.");
    } catch (err) {
      if (err.message?.includes('already reported')) {
        Alert.alert('Already Reported', "You've already reported this message.");
        setShowReportModal(false);
      } else {
        Alert.alert('Error', 'Failed to submit report. Please try again.');
      }
    } finally {
      setReportSubmitting(false);
    }
  }, [actionMessage, reportReason]);

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

  // Tap reply count → thread screen
  const handleReplyPress = useCallback((message) => {
    navigation.navigate('Thread', { parentMessage: message, channelId: channel.id, workspaceId });
  }, [navigation, channel.id, workspaceId]);

  // Tap reaction to toggle
  const handleReactionPress = useCallback(async (messageId, emoji) => {
    try {
      const msg = messagesRef.current.find(m => m.id === messageId);
      const hasReacted = msg?.reactions?.some(r => r.emoji === emoji && r.userId === user?.id);
      if (hasReacted) {
        await api.removeReaction(messageId, emoji);
      } else {
        await api.addReaction(messageId, emoji);
      }
    } catch (err) {
      console.error('Failed to toggle reaction:', err);
    }
  }, [user?.id]);

  // Image viewer
  const handleImagePress = useCallback((url) => {
    setViewingImage(url);
  }, []);

  // Prepare data for inverted FlatList
  const invertedMessages = useMemo(() => [...messages].reverse(), [messages]);

  const isGrouped = useCallback((message, index) => {
    const nextIdx = index - 1;
    if (nextIdx < 0) return false;
    const prevMsg = invertedMessages[nextIdx];
    if (!prevMsg || !message.author || !prevMsg.author) return false;
    if (prevMsg.author.id !== message.author.id) return false;
    const timeDiff = new Date(prevMsg.createdAt) - new Date(message.createdAt);
    return Math.abs(timeDiff) < GROUP_THRESHOLD_MS;
  }, [invertedMessages]);

  const needsDateSeparator = useCallback((message, index) => {
    const olderIdx = index + 1;
    if (olderIdx >= invertedMessages.length) return true;
    const olderMsg = invertedMessages[olderIdx];
    return !isSameDay(new Date(message.createdAt), new Date(olderMsg.createdAt));
  }, [invertedMessages]);

  const renderItem = useCallback(({ item, index }) => {
    const grouped = isGrouped(item, index);
    const showDate = needsDateSeparator(item, index);
    const isLastOwn = item.id === lastOwnMessageId;

    return (
      <View>
        {isLastOwn && seenByCount > 0 && (
          <Text style={[styles.seenByText, { color: colors.textSecondary }]}>
            Seen by {seenByCount}
          </Text>
        )}
        <MessageBubble
          message={item}
          isGrouped={grouped}
          onLongPress={handleLongPress}
          onReplyPress={handleReplyPress}
          onImagePress={handleImagePress}
          onReactionPress={handleReactionPress}
        />
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
  }, [isGrouped, needsDateSeparator, colors, handleLongPress, handleReplyPress, handleImagePress, handleReactionPress, lastOwnMessageId, seenByCount]);

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
      <MessageInput
        onSend={handleSend}
        onSendVoice={handleSendVoice}
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

      {/* Report Message Modal */}
      <Modal
        visible={showReportModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReportModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.modalBg || colors.bgSecondary }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]} accessibilityRole="header">Report Message</Text>
            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
              Why are you reporting this message?
            </Text>
            <TextInput
              style={[styles.reportInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.bgTertiary }]}
              placeholder="Reason for reporting..."
              placeholderTextColor={colors.textSecondary}
              value={reportReason}
              onChangeText={setReportReason}
              multiline
              maxLength={500}
              autoFocus
              accessibilityLabel="Reason for reporting"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.bgTertiary }]}
                onPress={() => { setShowReportModal(false); setActionMessage(null); }}
                accessibilityRole="button"
                accessibilityLabel="Cancel report"
              >
                <Text style={{ color: colors.textPrimary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: '#dc2626', opacity: reportSubmitting ? 0.6 : 1 }]}
                onPress={handleSubmitReport}
                disabled={reportSubmitting}
                accessibilityRole="button"
                accessibilityLabel={reportSubmitting ? 'Submitting report' : 'Submit report'}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>
                  {reportSubmitting ? 'Submitting...' : 'Report'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  seenByText: {
    fontSize: 12,
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 4,
    textAlign: 'right',
  },
  typingBar: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  typingText: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    borderRadius: 12,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    marginBottom: 12,
  },
  reportInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
});
