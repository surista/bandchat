import { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect, memo } from 'react';
import {
  View,
  Text,
  FlatList,
  Alert,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  StyleSheet,
  AppState,
} from 'react-native';
import { getUiString, setUiString } from '../../services/storage';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useSocket } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';
import notificationService from '../../services/notifications';
import { addToOfflineQueue, getOfflineQueue, removeFromOfflineQueue } from '../../services/storage';
import { getLocalMessages, upsertMessages, upsertMessage as upsertLocalMessage, updateLocalMessage } from '../../services/database';
import { Ionicons } from '@expo/vector-icons';
import ErrorState from '../../components/ErrorState';
import { enqueue as enqueueSync } from '../../services/syncQueue';
import MessageBubble from '../../components/MessageBubble';
import MessageInput from '../../components/MessageInput';
import MessageActionSheet from '../../components/MessageActionSheet';
import EmojiPicker from '../../components/EmojiPicker';
import ImageViewer from '../../components/ImageViewer';
import ActionSheet from '../../components/ActionSheet';
import ReactionUsersSheet from '../../components/ReactionUsersSheet';
import { selectionFeedback, successNotification, errorNotification } from '../../utils/haptics';
import { format, isSameDay } from 'date-fns';
import { useLayout } from '../../hooks/useLayout';
import useMessageActions from '../../hooks/useMessageActions';

const GROUP_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

// Memoized row component so MessageBubble's React.memo actually prevents re-renders.
// Each prop is a primitive or stable callback — no inline objects/arrays that break shallow comparison.
const MessageRow = memo(function MessageRow({
  item,
  isGrouped,
  showDate,
  dateLabel,
  showUnreadDivider,
  seenByText,
  isOwn,
  onLongPress,
  onReplyPress,
  onImagePress,
  onReactionPress,
  onReactionLongPress,
  onSwipeReply,
  onSwipeReact,
  onAvatarPress,
  members,
  onTogglePreview,
  blockedDomains,
  onLinkLongPress,
  channels,
  onChannelPress,
  colors,
}) {
  return (
    <View>
      {seenByText ? (
        <Text style={[styles.seenByText, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.5}>
          {seenByText}
        </Text>
      ) : null}
      {showUnreadDivider ? (
        <View style={styles.unreadDivider}>
          <View style={styles.unreadLine} />
          <Text style={styles.unreadText} maxFontSizeMultiplier={1.5}>New messages</Text>
          <View style={styles.unreadLine} />
        </View>
      ) : null}
      {showDate ? (
        <View style={styles.dateSeparator}>
          <View style={[styles.dateLine, { backgroundColor: colors.border }]} />
          <Text style={[styles.dateText, { color: colors.textSecondary, backgroundColor: colors.bgPrimary }]} maxFontSizeMultiplier={1.2}>
            {dateLabel}
          </Text>
          <View style={[styles.dateLine, { backgroundColor: colors.border }]} />
        </View>
      ) : null}
      <MessageBubble
        message={item}
        isGrouped={isGrouped}
        onLongPress={onLongPress}
        onReplyPress={onReplyPress}
        onImagePress={onImagePress}
        onReactionPress={onReactionPress}
        onReactionLongPress={onReactionLongPress}
        onSwipeReply={onSwipeReply}
        onSwipeReact={onSwipeReact}
        onAvatarPress={onAvatarPress}
        members={members}
        isOwn={isOwn}
        onTogglePreview={onTogglePreview}
        blockedDomains={blockedDomains}
        onLinkLongPress={onLinkLongPress}
        channels={channels}
        onChannelPress={onChannelPress}
      />
    </View>
  );
});

export default function ChannelScreen({ navigation, route }) {
  const { channel, workspaceId, _splitPane: splitPane = false, openThreadId = null } = route.params;
  const { user } = useAuth();
  const { colors } = useTheme();
  const { socket, joinChannel, leaveChannel, startTyping, stopTyping } = useSocket();
  const toast = useToast();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const { isTablet, contentMaxWidth } = useLayout();

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  // IDs of messages this client just sent (API response confirmed). The server
  // broadcasts message:new to all channel members INCLUDING the sender's
  // socket, so without this we'd race the API swap against the echo. The Set
  // is bounded by sendMessage clearing entries 30s after add.
  const recentSentIdsRef = useRef(new Set());

  // Auto-open thread when arriving from a thread-reply notification
  // (App.js passes openThreadId from the push URL's &thread= param). Waits
  // for messages to load so we can resolve the parent message object, then
  // pushes ThreadScreen onto the stack. Guarded by a ref so it only fires
  // once per mount — otherwise re-renders during message updates would
  // re-navigate.
  const threadAutoOpenedRef = useRef(false);
  useEffect(() => {
    if (!openThreadId || threadAutoOpenedRef.current) return;
    if (!messages.length) return;
    const parent = messages.find(m => m.id === openThreadId);
    if (!parent) return;
    threadAutoOpenedRef.current = true;
    navigation.navigate('Thread', { parentMessage: parent, channelId: channel.id, workspaceId });
  }, [openThreadId, messages.length, navigation, channel.id, workspaceId]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [pinnedSetlist, setPinnedSetlist] = useState(channel.pinnedSetlist || null);
  const [setlistExpanded, setSetlistExpanded] = useState(false);
  const [setlistSongs, setSetlistSongs] = useState(null);
  const [showSetlistPicker, setShowSetlistPicker] = useState(false);
  const [setlistPickerList, setSetlistPickerList] = useState([]);

  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);

  const [seenByCount, setSeenByCount] = useState(null);
  const [lastOwnMessageId, setLastOwnMessageId] = useState(null);
  const [workspaceMembers, setWorkspaceMembers] = useState([]);
  const [pinnedMessageIds, setPinnedMessageIds] = useState(new Set());
  const [savedMessageIds, setSavedMessageIds] = useState(new Set());
  const [uploadProgress, setUploadProgress] = useState(null);
  const [lastReadAt, setLastReadAt] = useState(null);
  const [workspaceChannels, setWorkspaceChannels] = useState([]);
  const channelIdRef = useRef(channel.id);
  const userIdRef = useRef(user?.id);
  const flatListRef = useRef(null);
  const scrollOffsetRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const blockedIdsRef = useRef(new Set());
  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Android: manually track keyboard height and apply as bottom padding.
  // With softwareKeyboardLayoutMode='pan', the system pans the window up, but
  // edge-to-edge rendering + inverted FlatList makes this unreliable. We bypass
  // all native keyboard handling and directly compensate with padding.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardHeight(e.endCoordinates.height);
      if (flatListRef.current && scrollOffsetRef.current < 100) {
        flatListRef.current.scrollToOffset({ offset: 0, animated: true });
      }
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const findMessage = useCallback((id) => messagesRef.current.find(m => m.id === id), []);

  // Extra actions specific to ChannelScreen (reply, pin, bookmark, report)
  const extraActions = useMemo(() => ({
    reply: (msg) => navigation.navigate('Thread', { parentMessage: msg, channelId: channel.id, workspaceId }),
    pin: (msg) => {
      (async () => {
        try {
          if (pinnedMessageIds.has(msg.id)) {
            await api.unpinMessage(msg.id);
          } else {
            await api.pinMessage(msg.id);
          }
        } catch (err) {
          Alert.alert('Error', err.message || 'Failed to pin/unpin message');
        }
      })();
    },
    bookmark: (msg) => {
      (async () => {
        const wasSaved = savedMessageIds.has(msg.id);
        try {
          if (wasSaved) {
            await api.unsaveMessage(msg.id);
            setSavedMessageIds(prev => { const next = new Set(prev); next.delete(msg.id); return next; });
            selectionFeedback();
            toast.success('Removed from Saved Messages');
          } else {
            await api.saveMessage(msg.id);
            setSavedMessageIds(prev => new Set([...prev, msg.id]));
            successNotification();
            toast.success('Saved');
          }
        } catch (err) {
          errorNotification();
          Alert.alert('Error', err.message || 'Failed to save/unsave message');
        }
      })();
    },
    report: () => { setReportReason(''); setShowReportModal(true); },
  }), [navigation, channel.id, workspaceId, pinnedMessageIds, savedMessageIds]);

  const {
    actionMessage, showActions, showEmojiPicker, editingMessage, viewingImage,
    blockedDomains, linkActionUrl, reactionUsers,
    setShowActions, setShowEmojiPicker, setViewingImage, setLinkActionUrl, setActionMessage,
    handleLongPress, handleAction, handleAddReaction, handleSendEdit,
    handleCancelEdit, handleReactionPress, handleReactionLongPress, closeReactionUsers,
    handleImagePress, handleTogglePreview, handleLinkLongPress, toggleBlockedDomain,
  } = useMessageActions({ findMessage, extraActions, workspaceId, channelId: channel.id });

  useEffect(() => {
    channelIdRef.current = channel.id;
    userIdRef.current = user?.id;
  }, [channel.id, user?.id]);

  // Manage push notifications: suppress foreground alerts for this channel, clear badge & dismiss
  useEffect(() => {
    notificationService.setActiveChannel(channel.id);
    notificationService.clearBadge();
    notificationService.dismissChannelNotifications(channel.id);
    return () => notificationService.clearActiveChannel();
  }, [channel.id]);

  // Save scroll position on unmount
  useEffect(() => {
    return () => {
      if (scrollOffsetRef.current > 0) {
        setUiString(`scrollPos:${channel.id}`, String(scrollOffsetRef.current));
      }
    };
  }, [channel.id]);

  // Restore scroll position on mount — but not when the channel has unread
  // messages waiting. Jumping back to a stale scroll position instead of
  // showing the new message is exactly the "tapping the unread badge doesn't
  // take me to the new message" bug. Skipping the restore leaves the inverted
  // FlatList at its natural start position (offset 0 = bottom = newest),
  // which is what the user expects when they opened the channel for new
  // content. `channel.unreadCount` is the value from the channel list at the
  // moment the row was tapped, so it reflects "was there unread content when
  // I opened this."
  useEffect(() => {
    if (channel.unreadCount > 0) return;
    getUiString(`scrollPos:${channel.id}`).then(pos => {
      if (pos && flatListRef.current) {
        setTimeout(() => {
          flatListRef.current.scrollToOffset({ offset: parseFloat(pos), animated: false });
        }, 100);
      }
    });
  }, [channel.id, channel.unreadCount]);

  // Header: "..." menu button (hidden for DMs)
  useLayoutEffect(() => {
    if (channel.isDM) return;
    // In iPad split mode, the parent ChannelListScreen owns the stack header
    // and the proxy navigation no-ops setOptions — the ellipsis is rendered
    // inline below (`splitPane` branch in the return) instead.
    if (splitPane) return;
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => setShowHeaderMenu(true)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="More options"
          accessibilityHint="Channel options"
          style={{ paddingHorizontal: 8 }}
        >
          <Ionicons name="ellipsis-horizontal" size={22} color="#ffffff" />
        </TouchableOpacity>
      ),
    });
  }, [navigation, channel, splitPane]);

  // Load blocked user IDs for socket filtering
  useEffect(() => {
    api.getBlockedUsers().then(blocks => {
      blockedIdsRef.current = new Set(blocks.map(b => b.blockedUserId));
    }).catch(() => {});
  }, []);

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

  // Load pinned message IDs
  useEffect(() => {
    api.getPinnedMessages(channel.id).then(pins => {
      setPinnedMessageIds(new Set(pins.map(p => p.messageId)));
    }).catch(() => {});
  }, [channel.id]);

  // Load saved message IDs
  useEffect(() => {
    api.getSavedMessages(workspaceId).then(saved => {
      setSavedMessageIds(new Set(saved.map(s => s.messageId)));
    }).catch(() => {});
  }, [workspaceId]);

  // Load messages → mark read → join socket (exact order from web)
  useEffect(() => {
    let cancelled = false;

    // Capture lastRead before marking channel as read (for "New messages" divider)
    setLastReadAt(channel.lastRead || null);

    const init = async () => {
      setLoading(true);
      setMessages([]);
      setTypingUsers([]);

      // Pre-load from SQLite for instant display
      try {
        const cached = await getLocalMessages(channel.id, 50);
        if (!cancelled && cached.length > 0) {
          setMessages(cached);
          setLoading(false);
        }
      } catch (e) {
        console.error('Failed to load cached messages from SQLite:', e);
      }

      try {
        const data = await api.getMessages(channel.id);
        if (cancelled) return;
        setMessages(data.messages);
        setHasMore(data.hasMore);
        setNextCursor(data.nextCursor);

        // Persist to SQLite
        upsertMessages(data.messages).catch(() => {});

        await api.markChannelRead(channel.id);

        if (!cancelled) joinChannel(channel.id);
      } catch (err) {
        if (!cancelled) setLoadError('Could not load messages');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    init();

    return () => {
      cancelled = true;
      leaveChannel(channel.id);
    };
  }, [channel.id, joinChannel, leaveChannel, retryCount]);

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
        // We just sent this — the API response already swapped the optimistic
        // entry to the real message. The socket echo would otherwise race
        // ahead of the swap (rare but possible under load) and append a
        // duplicate.
        if (recentSentIdsRef.current.has(message.id)) return prev;

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
        const chId = channelIdRef.current;
        api.markChannelRead(chId).catch(() => {
          setTimeout(() => api.markChannelRead(chId).catch(() => {}), 2000);
        });
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

    const typingTimers = {};
    const handleTypingStart = ({ channelId, user: typingUser }) => {
      if (channelId !== channelIdRef.current) return;
      if (typingUser.id === userIdRef.current) return;
      setTypingUsers(prev => {
        if (prev.find(u => u.id === typingUser.id)) return prev;
        return [...prev, typingUser];
      });
      // Auto-clear after 5 seconds if no typing:stop received
      clearTimeout(typingTimers[typingUser.id]);
      typingTimers[typingUser.id] = setTimeout(() => {
        setTypingUsers(prev => prev.filter(u => u.id !== typingUser.id));
        delete typingTimers[typingUser.id];
      }, 5000);
    };

    const handleTypingStop = ({ channelId, userId }) => {
      if (channelId !== channelIdRef.current) return;
      clearTimeout(typingTimers[userId]);
      delete typingTimers[userId];
      setTypingUsers(prev => prev.filter(u => u.id !== userId));
    };

    const handleReactionAdded = ({ messageId, reaction, channelId }) => {
      if (channelId !== channelIdRef.current) return;
      setMessages(prev => prev.map(m => {
        if (m.id !== messageId) return m;
        // Dedupe by (emoji, userId): the reactor's own client made the HTTP
        // POST AND receives the socket echo. Without this check both fire and
        // the reactor sees their reaction with count: 2.
        const exists = (m.reactions || []).some(
          r => r.emoji === reaction.emoji && (r.user?.id || r.userId) === (reaction.user?.id || reaction.userId)
        );
        if (exists) return m;
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
      // Update reply count on parent message AND persist to SQLite so the
      // badge survives an app restart. Without the SQLite update, the next
      // session's pre-load shows the parent message with stale `_count`
      // (replies: 0). If the parent has since rolled off the API's latest
      // 50 (i.e. user has to scroll up to find it), the stale cache version
      // is what the user sees and the "N replies" badge is missing.
      let updatedCount = null;
      setMessages(prev => prev.map(m => {
        if (m.id !== parentId) return m;
        updatedCount = { ...m._count, replies: (m._count?.replies || 0) + 1 };
        return { ...m, _count: updatedCount };
      }));
      if (updatedCount) {
        updateLocalMessage(parentId, { _count: updatedCount }).catch(() => {});
      }
    };

    const handleReconnect = async () => {
      const chId = channelIdRef.current;
      joinChannel(chId);
      api.getMessages(chId).then(data => {
        if (chId !== channelIdRef.current) return;
        // Merge fresh latest-50 with the existing list instead of replacing.
        // A bare setMessages(data.messages) would silently wipe any older
        // messages the user had paged in — after a transient blip they'd be
        // teleported back to "latest" mid-scroll. Dedupe by id, keep the
        // freshest copy of any overlap (server has newer reactions/edits).
        setMessages(prev => {
          const byId = new Map();
          for (const m of prev) byId.set(m.id, m);
          for (const m of data.messages) byId.set(m.id, m);
          return Array.from(byId.values()).sort(
            (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
          );
        });
        // Only update pagination state if we don't already have older messages
        // loaded. If we paged back, the existing cursor is still authoritative.
        setHasMore(prevHasMore => prevHasMore || data.hasMore);
        setNextCursor(prev => prev || data.nextCursor);
      }).catch(() => {});
      // Mark channel as read after reconnect (was missing — caused stale unread badges)
      api.markChannelRead(chId).catch(() => {
        // Retry once after 2s if first attempt fails
        setTimeout(() => api.markChannelRead(chId).catch(() => {}), 2000);
      });

      // Flush offline queue
      try {
        const queue = await getOfflineQueue();
        const channelQueue = queue.filter(m => m.channelId === chId);
        for (const queued of channelQueue) {
          try {
            await api.sendMessage(queued.channelId, queued.content);
            await removeFromOfflineQueue(queued.tempId);
            setMessages(prev => prev.filter(m => m.id !== queued.tempId));
          } catch (e) {
            console.error('Failed to send queued offline message:', e);
          }
        }
      } catch (e) {
        console.error('Failed to process offline message queue:', e);
      }
    };

    const handleMessagePinned = (data) => {
      if (data.channelId === channelIdRef.current) {
        setPinnedMessageIds(prev => new Set([...prev, data.messageId]));
      }
    };
    const handleMessageUnpinned = (data) => {
      if (data.channelId === channelIdRef.current) {
        setPinnedMessageIds(prev => {
          const next = new Set(prev);
          next.delete(data.messageId);
          return next;
        });
      }
    };

    socket.on('message:new', handleNewMessage);
    socket.on('message:updated', handleUpdatedMessage);
    socket.on('message:deleted', handleDeletedMessage);
    socket.on('typing:start', handleTypingStart);
    socket.on('typing:stop', handleTypingStop);
    socket.on('reaction:added', handleReactionAdded);
    socket.on('reaction:removed', handleReactionRemoved);
    socket.on('message:reply', handleReply);
    socket.on('message:pinned', handleMessagePinned);
    socket.on('message:unpinned', handleMessageUnpinned);
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
      socket.off('message:pinned', handleMessagePinned);
      socket.off('message:unpinned', handleMessageUnpinned);
      socket.off('connect', handleReconnect);
      Object.values(typingTimers).forEach(clearTimeout);
    };
  }, [socket, joinChannel]);

  // Re-mark channel as read when app returns from background
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && channelIdRef.current) {
        api.markChannelRead(channelIdRef.current).catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

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
      // Persist the paginated batch to SQLite so older messages get fresh
      // _count/reactions/etc. instead of the stale version that may have
      // been cached when the message was newer (e.g. before replies existed).
      upsertMessages(data.messages).catch(() => {});
    } catch (err) {
      // silently fail
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, nextCursor, channel.id]);

  // Send message with optimistic update + optional attachment
  const handleSend = useCallback(async (content, attachmentOrArray) => {
    // Normalize to array
    const fileList = !attachmentOrArray ? [] :
      Array.isArray(attachmentOrArray) ? attachmentOrArray :
      [attachmentOrArray];
    const hasFiles = fileList.length > 0;

    const tempId = `temp-${Date.now()}`;
    const optimisticMessage = {
      id: tempId,
      content: content || '',
      author: { id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl },
      channelId: channel.id,
      createdAt: new Date().toISOString(),
      reactions: [],
      attachments: fileList.map((att, i) => ({
        id: `temp-att-${Date.now()}-${i}`,
        type: att.isVideo ? 'VIDEO' : att.isAudio ? 'AUDIO' : 'IMAGE',
        url: att.uri,
        pending: true,
      })),
      _count: { replies: 0 },
      pending: true,
    };

    setMessages(prev => [...prev, optimisticMessage]);
    upsertLocalMessage(optimisticMessage).catch(() => {});

    try {
      let uploadedAttachments = null;
      if (hasFiles) {
        setUploadProgress(0);
        const uploads = [];
        for (let i = 0; i < fileList.length; i++) {
          const att = fileList[i];
          const uploaded = await api.uploadFileWithProgress(
            att.uri, att.filename, att.mimeType,
            (progress) => setUploadProgress((i + progress) / fileList.length),
            workspaceId
          );
          uploads.push(uploaded);
        }
        setUploadProgress(null);
        uploadedAttachments = uploads;
      }
      const savedMessage = await api.sendMessage(channel.id, content || '', null, uploadedAttachments);
      // Register the confirmed id so the socket echo (which fires for the
      // sender too) doesn't duplicate. 30s is generous — the echo usually
      // arrives within ~100ms.
      recentSentIdsRef.current.add(savedMessage.id);
      setTimeout(() => recentSentIdsRef.current.delete(savedMessage.id), 30000);
      setMessages(prev => prev.map(m =>
        m.id === optimisticMessage.id ? savedMessage : m
      ));
      upsertLocalMessage(savedMessage).catch(() => {});
    } catch (err) {
      setUploadProgress(null);
      if (!hasFiles && content) {
        setMessages(prev => prev.map(m =>
          m.id === tempId ? { ...m, queued: true, pending: false } : m
        ));
        addToOfflineQueue({ tempId, channelId: channel.id, content, createdAt: optimisticMessage.createdAt });
        enqueueSync('create', 'message', tempId, { channelId: channel.id, content }, workspaceId).catch(() => {});
      } else {
        setMessages(prev => prev.filter(m => m.id !== optimisticMessage.id));
        toast.error(err.message || 'Failed to send message');
      }
    }
  }, [user, channel.id, workspaceId]);

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
      const uploaded = await api.uploadFile(uri, filename, 'audio/mp4', workspaceId);
      const savedMessage = await api.sendMessage(channel.id, '', null, [uploaded]);
      recentSentIdsRef.current.add(savedMessage.id);
      setTimeout(() => recentSentIdsRef.current.delete(savedMessage.id), 30000);
      setMessages(prev => prev.map(m =>
        m.id === optimisticMessage.id ? savedMessage : m
      ));
    } catch (err) {
      setMessages(prev => prev.filter(m => m.id !== optimisticMessage.id));
    }
  }, [user, channel.id, workspaceId]);

  // Typing handler
  const handleTyping = useCallback((isTyping) => {
    if (isTyping) {
      startTyping(channel.id);
    } else {
      stopTyping(channel.id);
    }
  }, [channel.id, startTyping, stopTyping]);

  // Avatar tap → member profile
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

  // Tap reply count → thread screen
  const handleReplyPress = useCallback((message) => {
    navigation.navigate('Thread', { parentMessage: message, channelId: channel.id, workspaceId });
  }, [navigation, channel.id, workspaceId]);

  // Compute first unread message index (in original message order)
  const firstUnreadId = useMemo(() => {
    if (!lastReadAt) return null;
    const lastReadTime = new Date(lastReadAt).getTime();
    const msg = messages.find(m =>
      m.author?.id !== user?.id &&
      new Date(m.createdAt).getTime() > lastReadTime
    );
    return msg?.id || null;
  }, [messages, lastReadAt, user?.id]);

  // Prepare data for inverted FlatList with precomputed grouping, date labels, and decorators
  const invertedMessages = useMemo(() => {
    const reversed = [...messages].reverse();
    return reversed.map((msg, i) => {
      const olderMsg = reversed[i + 1];
      let grouped = false;
      if (olderMsg && msg.author && olderMsg.author) {
        const sameAuthor = olderMsg.author.id === msg.author.id;
        const sameDay = isSameDay(new Date(msg.createdAt), new Date(olderMsg.createdAt));
        const timeDiff = Math.abs(new Date(msg.createdAt) - new Date(olderMsg.createdAt));
        grouped = sameAuthor && sameDay && timeDiff < GROUP_THRESHOLD_MS;
      }
      const showDate = !olderMsg || !isSameDay(new Date(msg.createdAt), new Date(olderMsg.createdAt));
      const dateLabel = showDate ? format(new Date(msg.createdAt), 'EEEE, MMMM d') : null;
      const isOwn = msg.author?.id === user?.id;
      const isLastOwn = msg.id === lastOwnMessageId;
      const seenByText = isLastOwn && seenByCount > 0 ? `Seen by ${seenByCount}` : null;
      const showUnreadDivider = msg.id === firstUnreadId;
      return { ...msg, _grouped: grouped, _showDate: showDate, _dateLabel: dateLabel, _isOwn: isOwn, _seenByText: seenByText, _showUnreadDivider: showUnreadDivider };
    });
  }, [messages, user?.id, lastOwnMessageId, seenByCount, firstUnreadId]);

  const renderItem = useCallback(({ item }) => (
    <MessageRow
      item={item}
      isGrouped={item._grouped}
      showDate={item._showDate}
      dateLabel={item._dateLabel}
      showUnreadDivider={item._showUnreadDivider}
      seenByText={item._seenByText}
      isOwn={item._isOwn}
      onLongPress={handleLongPress}
      onReplyPress={handleReplyPress}
      onImagePress={handleImagePress}
      onReactionPress={handleReactionPress}
      onReactionLongPress={handleReactionLongPress}
      onSwipeReply={handleReplyPress}
      onSwipeReact={handleReactionPress}
      onAvatarPress={handleAvatarPress}
      members={workspaceMembers}
      onTogglePreview={handleTogglePreview}
      blockedDomains={blockedDomains}
      onLinkLongPress={handleLinkLongPress}
      channels={workspaceChannels}
      onChannelPress={handleChannelRefPress}
      colors={colors}
    />
  ), [colors, handleLongPress, handleReplyPress, handleImagePress, handleReactionPress, handleReactionLongPress, handleAvatarPress, handleTogglePreview, workspaceMembers, blockedDomains, handleLinkLongPress, workspaceChannels, handleChannelRefPress]);

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

  if (loadError && messages.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
        <ErrorState iconName="chatbubble-outline" title="Couldn't load messages" message={loadError} onRetry={() => { setLoadError(null); setRetryCount(c => c + 1); }} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.bgPrimary, paddingBottom: Platform.OS === 'android' ? keyboardHeight : 0 }, isTablet && styles.tabletContainer]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? (splitPane ? 0 : headerHeight) : 0}
    >
      <View style={[styles.chatContainer, isTablet && { maxWidth: contentMaxWidth }]}>
      {/* Split-mode inline header bar — only rendered on iPad landscape,
          where the native stack header belongs to ChannelListScreen and the
          proxy navigation drops setOptions(). Gives split-mode users access
          to the channel-options menu (pinned messages, pin setlist, etc). */}
      {splitPane && (
        <View style={[styles.splitHeader, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
          <View style={styles.splitHeaderTitleRow}>
            {!channel.isDM && channel.isPrivate && <Ionicons name="lock-closed" size={14} color={colors.headerText} style={{ marginRight: 6 }} />}
            <Text style={[styles.splitHeaderTitle, { color: colors.headerText }]} numberOfLines={1} maxFontSizeMultiplier={1.6}>
              {channel.isDM
                ? (channel.displayName || 'Direct Message')
                : (channel.isPrivate ? channel.name : `#${channel.name}`)}
            </Text>
          </View>
          {!channel.isDM && (
            <TouchableOpacity
              onPress={() => setShowHeaderMenu(true)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.splitHeaderMenuButton}
              accessibilityRole="button"
              accessibilityLabel="More options"
              accessibilityHint="Channel options"
            >
              <Ionicons name="ellipsis-horizontal" size={22} color={colors.headerText} />
            </TouchableOpacity>
          )}
        </View>
      )}
      {/* Pinned Setlist Banner */}
      {pinnedSetlist && (
        <View style={[styles.setlistBanner, { backgroundColor: colors.bgTertiary, borderBottomColor: colors.border }]}>
          <TouchableOpacity
            style={styles.setlistHeader}
            onPress={async () => {
              if (!setlistExpanded && !setlistSongs) {
                try {
                  const data = await api.getSetlist(pinnedSetlist.id);
                  setSetlistSongs(data.songs || []);
                } catch (e) {
                  console.error('Failed to load pinned setlist songs:', e);
                }
              }
              setSetlistExpanded(prev => !prev);
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Toggle pinned setlist"
          >
            <Ionicons name={setlistExpanded ? 'chevron-down' : 'chevron-forward'} size={12} color={colors.textSecondary} style={{ marginRight: 4 }} />
            <Ionicons name="list-outline" size={14} color={colors.textSecondary} />
            <Text style={[styles.setlistName, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.5}>{pinnedSetlist.name}</Text>
            <Text style={[styles.setlistCount, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.2}>{pinnedSetlist._count?.songs || 0} songs</Text>
          </TouchableOpacity>
          {setlistExpanded && (
            <ScrollView style={styles.setlistScroll}>
              {!setlistSongs ? (
                <Text style={[styles.setlistMsg, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.5}>Loading...</Text>
              ) : setlistSongs.length === 0 ? (
                <Text style={[styles.setlistMsg, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.5}>No songs in this setlist</Text>
              ) : (
                (() => {
                  let setNumber = 1;
                  let songIndex = 0;
                  const hasSetBreaks = setlistSongs.some(ss => ss.type === 'SET_BREAK');
                  return setlistSongs.map((ss) => {
                    if (ss.type === 'SET_BREAK') {
                      setNumber++;
                      songIndex = 0;
                      return (
                        <View key={ss.id} style={[styles.setlistBreak, { borderTopColor: colors.border }]} />
                      );
                    }
                    songIndex++;
                    const showSetHeader = hasSetBreaks && songIndex === 1;
                    return (
                      <View key={ss.id}>
                        {showSetHeader && (
                          <View style={styles.setlistSetHeader}>
                            <Text style={[styles.setlistSetLabel, { color: colors.badgeSet }]} maxFontSizeMultiplier={1.2}>Set {setNumber}</Text>
                          </View>
                        )}
                        <View style={styles.setlistSongRow}>
                          <Text style={[styles.setlistSongIndex, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.5}>{songIndex}</Text>
                          {ss.type === 'MC' ? (
                            <Text style={[styles.setlistMcText, { color: colors.badgeMc }]} maxFontSizeMultiplier={1.2}>{ss.label || 'MC Break'}</Text>
                          ) : ss.song ? (
                            <View style={styles.setlistSongInfo}>
                              <Text style={[styles.setlistSongTitle, { color: colors.textPrimary }]} numberOfLines={1} maxFontSizeMultiplier={1.6}>{ss.song.shortName || ss.song.title}</Text>
                              {ss.song.key ? <Text style={[styles.setlistKeyText, { color: colors.badgeKey }]} maxFontSizeMultiplier={1.2}>{ss.song.key}</Text> : null}
                              {ss.song.bpm ? <Text style={[styles.setlistBpmText, { color: colors.badgeBpm }]} maxFontSizeMultiplier={1.2}>{ss.song.bpm}</Text> : null}
                            </View>
                          ) : (
                            <Text style={[styles.setlistUnknown, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.5}>{ss.label || 'Unknown'}</Text>
                          )}
                        </View>
                      </View>
                    );
                  });
                })()
              )}
            </ScrollView>
          )}
        </View>
      )}
      {!loading && messages.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="chatbubble-outline" size={40} color={colors.textSecondary} style={{ marginBottom: 8 }} />
          <Text style={{ color: colors.textSecondary, fontSize: 16, textAlign: 'center' }} maxFontSizeMultiplier={1.5}>No messages yet. Say something!</Text>
        </View>
      ) : (
      <FlatList
        ref={flatListRef}
        data={invertedMessages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        inverted
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        onScroll={(e) => { scrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={100}
        ListFooterComponent={renderFooter}
        contentContainerStyle={styles.messageList}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        // Performance optimizations
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        windowSize={10}
        removeClippedSubviews={false} // Disabled — inverted FlatList + removeClippedSubviews causes rendering bugs on Android
        initialNumToRender={15}
        getItemLayout={undefined} // Can't use with variable height items
      />
      )}
      {uploadProgress !== null && (
        <View style={[styles.uploadBar, { backgroundColor: colors.bgSecondary }]}>
          <View style={[styles.uploadProgress, { backgroundColor: colors.primary, width: `${Math.round(uploadProgress * 100)}%` }]} />
          <Text style={[styles.uploadText, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.5}>
            Uploading... {Math.round(uploadProgress * 100)}%
          </Text>
        </View>
      )}
      {typingText && (
        <View style={[styles.typingBar, { backgroundColor: colors.bgSecondary }]}>
          <Text style={[styles.typingText, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.5}>
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
        members={workspaceMembers}
        channels={workspaceChannels}
      />
      {insets.bottom > 0 && keyboardHeight === 0 && <View style={{ height: insets.bottom }} />}
      </View>

      {/* Action Sheet */}
      <MessageActionSheet
        visible={showActions}
        onClose={() => setShowActions(false)}
        onAction={handleAction}
        onQuickReaction={handleAddReaction}
        isOwnMessage={actionMessage?.author?.id === user?.id}
        isPinned={actionMessage ? pinnedMessageIds.has(actionMessage.id) : false}
        isBookmarked={actionMessage ? savedMessageIds.has(actionMessage.id) : false}
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

      {/* Reaction Users Sheet */}
      <ReactionUsersSheet
        visible={reactionUsers.visible}
        reactions={reactionUsers.reactions}
        selectedEmoji={reactionUsers.emoji}
        onClose={closeReactionUsers}
      />

      {/* Header Menu ActionSheet */}
      <ActionSheet
        visible={showHeaderMenu}
        onClose={() => setShowHeaderMenu(false)}
        title={channel.name}
        actions={[
          {
            label: 'Pinned Messages',
            onPress: () => {
              setShowHeaderMenu(false);
              navigation.navigate('PinnedMessages', { channelId: channel.id });
            },
          },
          {
            label: pinnedSetlist ? 'Change Pinned Setlist' : 'Pin a Setlist',
            onPress: async () => {
              setShowHeaderMenu(false);
              try {
                const data = await api.getSetlists(workspaceId);
                setSetlistPickerList(data);
                setShowSetlistPicker(true);
              } catch (e) {
                console.error('Failed to load setlists for picker:', e);
              }
            },
          },
          ...(pinnedSetlist ? [{
            label: 'Unpin Setlist',
            destructive: true,
            onPress: async () => {
              setShowHeaderMenu(false);
              try {
                await api.unpinSetlist(channel.id);
                setPinnedSetlist(null);
                setSetlistExpanded(false);
                setSetlistSongs(null);
              } catch (err) {
                Alert.alert('Error', err.message || 'Failed to unpin setlist');
              }
            },
          }] : []),
          {
            label: 'Channel Settings',
            onPress: () => {
              setShowHeaderMenu(false);
              navigation.navigate('ChannelSettings', { channel, workspaceId });
            },
          },
        ]}
      />

      {/* Setlist Picker ActionSheet */}
      <ActionSheet
        visible={showSetlistPicker}
        onClose={() => setShowSetlistPicker(false)}
        title="Pin a Setlist"
        actions={setlistPickerList.map(s => ({
          label: s.name + (pinnedSetlist?.id === s.id ? ' (pinned)' : ''),
          onPress: async () => {
            setShowSetlistPicker(false);
            try {
              await api.pinSetlist(channel.id, s.id);
              setPinnedSetlist({ id: s.id, name: s.name, _count: { songs: s.songs?.length || s._count?.songs || 0 } });
              setSetlistExpanded(false);
              setSetlistSongs(null);
            } catch (err) {
              Alert.alert('Error', err.message || 'Failed to pin setlist');
            }
          },
        }))}
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

      {/* Report Message Modal */}
      <Modal
        visible={showReportModal}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setShowReportModal(false)}
      >
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.modalContent, { backgroundColor: colors.modalBg || colors.bgSecondary }]} accessibilityViewIsModal>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]} accessibilityRole="header" maxFontSizeMultiplier={1.6}>Report Message</Text>
            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.6}>
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
              autoFocus={Platform.OS === 'ios'}
              accessibilityLabel="Reason for reporting"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.bgTertiary }]}
                onPress={() => { setShowReportModal(false); setActionMessage(null); }}
                accessibilityRole="button"
                accessibilityLabel="Cancel report"
              >
                <Text style={{ color: colors.textPrimary }} maxFontSizeMultiplier={1.5}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.error || '#dc2626', opacity: reportSubmitting ? 0.6 : 1 }]}
                onPress={handleSubmitReport}
                disabled={reportSubmitting}
                accessibilityRole="button"
                accessibilityLabel={reportSubmitting ? 'Submitting report' : 'Submit report'}
              >
                <Text style={{ color: colors.errorText || '#fff', fontWeight: '600' }} maxFontSizeMultiplier={1.5}>
                  {reportSubmitting ? 'Submitting...' : 'Report'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  splitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 48,
  },
  splitHeaderTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  splitHeaderTitle: {
    fontSize: 17,
    fontWeight: '600',
    flexShrink: 1,
  },
  splitHeaderMenuButton: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
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
  unreadDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginVertical: 8,
  },
  unreadLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#ef4444',
  },
  unreadText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ef4444',
    paddingHorizontal: 12,
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
  uploadBar: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    position: 'relative',
    overflow: 'hidden',
  },
  uploadProgress: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    opacity: 0.15,
  },
  uploadText: {
    fontSize: 12,
    fontWeight: '500',
  },
  typingBar: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  typingText: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  setlistBanner: {
    borderBottomWidth: 1,
  },
  setlistHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  setlistChevron: {
    fontSize: 10,
  },
  setlistIcon: {
    fontSize: 14,
  },
  setlistName: {
    fontWeight: '600',
    fontSize: 14,
    flex: 1,
  },
  setlistCount: {
    fontSize: 12,
  },
  setlistScroll: {
    maxHeight: 250,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  setlistMsg: {
    fontSize: 13,
    paddingVertical: 4,
  },
  setlistBreak: {
    marginVertical: 8,
    borderTopWidth: 1,
  },
  setlistSetHeader: {
    paddingVertical: 4,
  },
  setlistSetLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  setlistSongRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    gap: 8,
  },
  setlistSongIndex: {
    fontSize: 11,
    width: 20,
    textAlign: 'right',
  },
  setlistMcText: {
    fontStyle: 'italic',
    fontSize: 13,
  },
  setlistSongInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  setlistSongTitle: {
    fontSize: 13,
    flex: 1,
  },
  setlistKeyText: {
    fontSize: 11,
  },
  setlistBpmText: {
    fontSize: 11,
  },
  setlistUnknown: {
    fontStyle: 'italic',
    fontSize: 13,
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
    maxWidth: 500,
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
