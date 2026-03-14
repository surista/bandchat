/**
 * @fileoverview Channel view component for displaying and sending messages.
 * Handles real-time message updates, typing indicators, and reactions.
 */

import { useState, useEffect, useRef, useLayoutEffect, useMemo, useCallback } from 'react';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import MessageList from '../messages/MessageList';
import MessageInput from '../messages/MessageInput';
import ChannelMembersPanel from './ChannelMembersPanel';
import PinnedMessagesPanel from './PinnedMessagesPanel';
import Skeleton from '../common/Skeleton';
import MemberProfile from '../common/MemberProfile';
import SlashCommandPicker from '../messages/SlashCommandPicker';
import useOnlineStatus from '../../hooks/useOnlineStatus';

/**
 * Main channel view component displaying messages and input.
 * Manages Socket.IO subscriptions for real-time updates.
 *
 * @param {Object} props
 * @param {Object} props.channel - Channel object with id, name, description, isDirect, isPrivate
 * @param {Object} props.workspace - Current workspace with members array
 * @param {function} props.onOpenThread - Callback when user clicks to open a thread
 * @param {function} props.onUpdateUnread - Callback to update unread count (called with 0 on channel select)
 */
function ChannelView({ channel, workspace, onOpenThread, onUpdateUnread, openThreadId, onOpenSearch, onStartDM, onMuteChannel, onAddToLibrary }) {
  const { user } = useAuth();
  const { socket, joinChannel, leaveChannel, startTyping, stopTyping, presenceMap } = useSocket();
  const isOnline = useOnlineStatus();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [typingUsers, setTypingUsers] = useState([]);
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [showPinned, setShowPinned] = useState(false);
  const [savedMessageIds, setSavedMessageIds] = useState(new Set());
  const [profileUserId, setProfileUserId] = useState(null);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [slashCommandType, setSlashCommandType] = useState(null);
  const isAdmin = workspace?.members?.find(m => m.user?.id === user?.id)?.role === 'ADMIN';
  const lastReadAtRef = useRef(null);
  const descriptionSavedRef = useRef(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const typingTimersRef = useRef({});
  const channelIdRef = useRef(channel.id);
  channelIdRef.current = channel.id;
  const userIdRef = useRef(user.id);
  userIdRef.current = user.id;
  const openThreadIdRef = useRef(openThreadId);
  openThreadIdRef.current = openThreadId;

  useEffect(() => {
    // Capture lastRead before marking channel as read
    lastReadAtRef.current = channel.lastRead || null;

    // Immediately clear the unread badge when channel is selected
    onUpdateUnread(0);

    let cancelled = false;

    // Load messages FIRST, then join socket room to prevent race condition.
    // This ensures no gap between the API snapshot and socket subscription
    // where messages could be lost.
    const init = async () => {
      setLoading(true);
      try {
        const data = await api.getMessages(channel.id);
        if (cancelled) return;
        setMessages(data.messages);
        setHasMore(data.hasMore);
        setNextCursor(data.nextCursor);
        setShouldScrollToBottom(true);

        // Mark channel as read BEFORE joining socket room so any new messages
        // that arrive after join will correctly be "after" the read timestamp
        try {
          await api.markChannelRead(channel.id);
        } catch (err) {
          console.error('Failed to mark channel as read:', err);
        }

        // Join socket room after mark-read completes
        if (!cancelled) joinChannel(channel.id);
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load messages:', err);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          // Fallback scroll: ensure we reach the bottom after React renders messages
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (!cancelled && messagesContainerRef.current) {
                messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
              }
            });
          });
        }
      }
    };

    init();
    loadPinnedMessages();
    loadSavedMessageIds();

    return () => {
      cancelled = true;
      leaveChannel(channel.id);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [channel.id]);

  // Scroll to bottom after messages are rendered (useLayoutEffect runs
  // synchronously before paint, so the user never sees an unscrolled state)
  useLayoutEffect(() => {
    if (shouldScrollToBottom && !loading && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      setShouldScrollToBottom(false);
    }
  }, [shouldScrollToBottom, messages, loading]);

  // Re-join channel room and refresh messages on socket reconnection
  // (server loses room memberships, and messages sent during disconnect are missed)
  useEffect(() => {
    if (socket) {
      const handleReconnect = () => {
        const chId = channelIdRef.current;
        joinChannel(chId);
        // Re-fetch messages to catch anything missed during disconnect
        api.getMessages(chId).then(data => {
          if (chId === channelIdRef.current) {
            setMessages(data.messages);
            setHasMore(data.hasMore);
            setNextCursor(data.nextCursor);
          }
        }).catch(err => console.warn('Failed to refresh messages on reconnect:', err.message));
      };
      socket.on('connect', handleReconnect);
      return () => socket.off('connect', handleReconnect);
    }
  }, [socket]);

  useEffect(() => {
    if (socket) {
      socket.on('message:new', handleNewMessage);
      socket.on('message:updated', handleUpdatedMessage);
      socket.on('message:deleted', handleDeletedMessage);
      socket.on('message:reply', handleNewReply);
      socket.on('typing:start', handleTypingStart);
      socket.on('typing:stop', handleTypingStop);
      socket.on('reaction:added', handleReactionAdded);
      socket.on('reaction:removed', handleReactionRemoved);
      socket.on('message:pinned', handleMessagePinned);
      socket.on('message:unpinned', handleMessageUnpinned);

      return () => {
        socket.off('message:new', handleNewMessage);
        socket.off('message:updated', handleUpdatedMessage);
        socket.off('message:deleted', handleDeletedMessage);
        socket.off('message:reply', handleNewReply);
        socket.off('typing:start', handleTypingStart);
        socket.off('typing:stop', handleTypingStop);
        socket.off('reaction:added', handleReactionAdded);
        socket.off('reaction:removed', handleReactionRemoved);
        socket.off('message:pinned', handleMessagePinned);
        socket.off('message:unpinned', handleMessageUnpinned);
        Object.values(typingTimersRef.current).forEach(clearTimeout);
        typingTimersRef.current = {};
      };
    }
  }, [socket]);

  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef(null);

  const loadMoreMessages = useCallback(async () => {
    if (!hasMore || !nextCursor || loadingMore) return;
    setLoadingMore(true);

    const container = messagesContainerRef.current;
    const prevScrollHeight = container?.scrollHeight || 0;

    try {
      const data = await api.getMessages(channel.id, nextCursor);
      setMessages(prev => [...data.messages, ...prev]);
      setHasMore(data.hasMore);
      setNextCursor(data.nextCursor);

      // Restore scroll position after prepending
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = container.scrollHeight - prevScrollHeight;
        }
      });
    } catch (err) {
      console.error('Failed to load more messages:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, nextCursor, loadingMore, channel.id]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const container = messagesContainerRef.current;
    if (!sentinel || !container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadMoreMessages();
        }
      },
      { root: container, threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadMoreMessages]);

  const loadPinnedMessages = async () => {
    try {
      const chId = channelIdRef.current;
      const data = await api.getPinnedMessages(chId);
      if (chId === channelIdRef.current) {
        setPinnedMessages(data);
      }
    } catch (err) {
      console.error('Failed to load pinned messages:', err);
    }
  };

  const handleNewMessage = (message) => {
    if (message.channelId === channelIdRef.current) {
      setMessages(prev => {
        // Deduplicate: if message already exists (e.g., from API response), skip
        if (prev.some(m => m.id === message.id)) {
          return prev;
        }

        // Check if this is confirming an optimistic message we sent
        const optimisticIndex = prev.findIndex(
          m => m.pending && m.author?.id === message.author?.id && m.content === message.content
        );

        if (optimisticIndex !== -1) {
          // Replace optimistic message with real one
          const updated = [...prev];
          updated[optimisticIndex] = message;
          return updated;
        }

        // New message from someone else (or no matching optimistic)
        return [...prev, message];
      });
      scrollToBottom();

      // Mark as read if it's not our message
      if (message.author?.id !== userIdRef.current) {
        api.markChannelRead(channelIdRef.current);
      }
    }
  };

  const handleUpdatedMessage = (message) => {
    setMessages(prev =>
      prev.map(m => (m.id === message.id ? message : m))
    );
  };

  const handleDeletedMessage = ({ messageId }) => {
    setMessages(prev => prev.filter(m => m.id !== messageId));
  };

  const handleNewReply = ({ parentId, message: reply }) => {
    setMessages(prev =>
      prev.map(m =>
        m.id === parentId
          ? {
              ...m,
              _count: { replies: (m._count?.replies || 0) + 1 },
              unreadReplies: (reply.author?.id !== userIdRef.current && openThreadIdRef.current !== parentId)
                ? (m.unreadReplies || 0) + 1
                : m.unreadReplies || 0
            }
          : m
      )
    );
  };

  const handleTypingStart = ({ channelId, user: typingUser }) => {
    if (channelId === channelIdRef.current && typingUser.id !== userIdRef.current) {
      setTypingUsers(prev => {
        if (!prev.find(u => u.id === typingUser.id)) {
          return [...prev, typingUser];
        }
        return prev;
      });
      // Auto-clear after 5 seconds if no typing:stop received
      clearTimeout(typingTimersRef.current[typingUser.id]);
      typingTimersRef.current[typingUser.id] = setTimeout(() => {
        setTypingUsers(prev => prev.filter(u => u.id !== typingUser.id));
        delete typingTimersRef.current[typingUser.id];
      }, 5000);
    }
  };

  const handleTypingStop = ({ channelId, userId }) => {
    if (channelId === channelIdRef.current) {
      clearTimeout(typingTimersRef.current[userId]);
      delete typingTimersRef.current[userId];
      setTypingUsers(prev => prev.filter(u => u.id !== userId));
    }
  };

  const handleReactionAdded = ({ messageId, reaction }) => {
    setMessages(prev =>
      prev.map(m => {
        if (m.id === messageId) {
          const reactions = m.reactions || [];
          // Check if this exact reaction already exists
          const exists = reactions.some(r => r.id === reaction.id);
          if (!exists) {
            return { ...m, reactions: [...reactions, reaction] };
          }
        }
        return m;
      })
    );
  };

  const handleReactionRemoved = ({ messageId, emoji, userId }) => {
    setMessages(prev =>
      prev.map(m => {
        if (m.id === messageId) {
          const reactions = (m.reactions || []).filter(
            r => !(r.emoji === emoji && r.user.id === userId)
          );
          return { ...m, reactions };
        }
        return m;
      })
    );
  };

  const handleMessagePinned = (pinnedMessage) => {
    if (pinnedMessage.message?.channelId === channelIdRef.current || pinnedMessage.channelId === channelIdRef.current) {
      setPinnedMessages(prev => {
        // Avoid duplicates
        if (prev.some(p => p.id === pinnedMessage.id)) return prev;
        return [pinnedMessage, ...prev];
      });
    }
  };

  const handleMessageUnpinned = ({ messageId, channelId }) => {
    if (channelId === channelIdRef.current) {
      setPinnedMessages(prev => prev.filter(p => p.messageId !== messageId));
    }
  };

  const handlePinMessage = async (messageId) => {
    try {
      await api.pinMessage(messageId);
    } catch (err) {
      console.error('Failed to pin message:', err);
    }
  };

  const handleUnpinMessage = async (messageId) => {
    try {
      await api.unpinMessage(messageId);
    } catch (err) {
      console.error('Failed to unpin message:', err);
    }
  };

  const pinnedMessageIds = useMemo(() => new Set(pinnedMessages.map(p => p.messageId)), [pinnedMessages]);

  const loadSavedMessageIds = async () => {
    try {
      const data = await api.getSavedMessages(channel.workspaceId);
      setSavedMessageIds(new Set(data.map(s => s.messageId)));
    } catch (err) {
      console.error('Failed to load saved messages:', err);
    }
  };

  const handleSaveMessage = async (messageId) => {
    try {
      await api.saveMessage(messageId);
      setSavedMessageIds(prev => new Set([...prev, messageId]));
    } catch (err) {
      console.error('Failed to save message:', err);
    }
  };

  const handleUnsaveMessage = async (messageId) => {
    try {
      await api.unsaveMessage(messageId);
      setSavedMessageIds(prev => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
    } catch (err) {
      console.error('Failed to unsave message:', err);
    }
  };

  const scrollToBottom = (instant = false) => {
    // Use requestAnimationFrame to ensure DOM is updated
    requestAnimationFrame(() => {
      if (messagesContainerRef.current) {
        if (instant) {
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        } else {
          messagesContainerRef.current.scrollTo({
            top: messagesContainerRef.current.scrollHeight,
            behavior: 'smooth'
          });
        }
      }
    });
  };

  const handleSendMessage = async (content, files = []) => {
    // Build optimistic attachments from local files (show preview before upload)
    const optimisticAttachments = files.map((file, i) => ({
      id: `temp-att-${Date.now()}-${i}`,
      type: file.type.startsWith('image/') ? 'IMAGE' : file.type.startsWith('audio/') ? 'AUDIO' : file.type.startsWith('video/') ? 'VIDEO' : 'DOCUMENT',
      url: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      filename: file.name,
      size: file.size,
      pending: true
    }));

    // Create optimistic message immediately for instant feedback
    const optimisticMessage = {
      id: `temp-${Date.now()}`,
      content: content || '',
      channelId: channel.id,
      author: {
        id: user.id,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl
      },
      attachments: optimisticAttachments,
      reactions: [],
      createdAt: new Date().toISOString(),
      pending: true,
      _count: { replies: 0 }
    };

    // Add optimistic message to UI immediately
    if (content || files.length > 0) {
      setMessages(prev => [...prev, optimisticMessage]);
      scrollToBottom();
    }

    try {
      let attachments = null;

      // Upload files if any
      if (files.length > 0) {
        const uploadPromises = files.map(file => api.uploadFile(file, channel.workspaceId));
        const uploadedFiles = await Promise.all(uploadPromises);
        attachments = uploadedFiles.map(file => ({
          type: file.type,
          url: file.url,
          filename: file.filename,
          size: file.size,
          ...(file.thumbnailUrl && { thumbnailUrl: file.thumbnailUrl }),
          ...(file.width && { width: file.width }),
          ...(file.height && { height: file.height })
        }));
      }

      // Send message with attachments — use API response to replace optimistic message
      // directly instead of relying solely on socket event (which can be missed)
      const savedMessage = await api.sendMessage(channel.id, content || '', null, attachments);
      setMessages(prev => prev.map(m =>
        m.id === optimisticMessage.id ? savedMessage : m
      ));

      // Revoke object URLs to free memory
      optimisticAttachments.forEach(a => {
        if (a.url?.startsWith('blob:')) URL.revokeObjectURL(a.url);
      });
    } catch (err) {
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => m.id !== optimisticMessage.id));
      // Revoke object URLs on error too
      optimisticAttachments.forEach(a => {
        if (a.url?.startsWith('blob:')) URL.revokeObjectURL(a.url);
      });
      console.error('Failed to send message:', err);
      throw err; // Re-throw to show error in MessageInput
    }
  };

  const handleTyping = () => {
    startTyping(channelIdRef.current);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      stopTyping(channelIdRef.current);
    }, 2000);
  };

  const handleEditMessage = async (messageId, content) => {
    try {
      await api.updateMessage(messageId, content);
    } catch (err) {
      console.error('Failed to edit message:', err);
    }
  };

  const handleDeleteMessage = async (messageId) => {
    try {
      await api.deleteMessage(messageId);
    } catch (err) {
      console.error('Failed to delete message:', err);
    }
  };

  const handleTogglePreview = async (messageId) => {
    try {
      await api.toggleMessagePreview(messageId);
    } catch (err) {
      console.error('Failed to toggle preview:', err);
    }
  };

  const handleOpenThread = (message) => {
    // Clear local unread state for this thread
    setMessages(prev =>
      prev.map(m => m.id === message.id ? { ...m, unreadReplies: 0 } : m)
    );
    onOpenThread(message);
  };

  const handleAddReaction = async (messageId, emoji) => {
    try {
      await api.addReaction(messageId, emoji);
    } catch (err) {
      console.error('Failed to add reaction:', err);
    }
  };

  const handleRemoveReaction = async (messageId, emoji) => {
    try {
      await api.removeReaction(messageId, emoji);
    } catch (err) {
      console.error('Failed to remove reaction:', err);
    }
  };

  return (
    <>
    <div className="flex-1 flex flex-col bg-[var(--color-bg-secondary)] min-h-0">
      {/* Channel Header */}
      <div className="h-14 border-b border-[var(--color-border)] px-4 flex items-center shrink-0">
        {channel.isDirect ? (
          <>
            <div className="relative mr-2">
              <div className="w-8 h-8 rounded-full bg-[var(--color-bg-tertiary)] flex items-center justify-center text-[var(--color-text-primary)] font-medium">
                {channel.otherMembers?.[0]?.displayName?.charAt(0).toUpperCase() || '?'}
              </div>
              {channel.otherMembers?.[0]?.id && (
                <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[var(--color-bg-secondary)] ${
                  presenceMap[channel.otherMembers[0].id] === 'online' ? 'bg-green-500' :
                  presenceMap[channel.otherMembers[0].id] === 'away' ? 'bg-yellow-500' :
                  'bg-gray-500'
                }`} />
              )}
            </div>
            <div>
              <h2 className="text-[var(--color-text-primary)] font-semibold leading-tight">
                {channel.otherMembers?.map(m => m.displayName).join(', ') || 'Direct Message'}
              </h2>
              {channel.otherMembers?.[0]?.id && presenceMap[channel.otherMembers[0].id] === 'online' && (
                <span className="text-xs text-green-500">Active</span>
              )}
              {channel.otherMembers?.[0]?.id && presenceMap[channel.otherMembers[0].id] === 'away' && (
                <span className="text-xs text-yellow-500">Away</span>
              )}
            </div>
          </>
        ) : (
          <>
            <span className="text-[var(--color-text-muted)] mr-2">
              {channel.isPrivate ? '🔒' : '#'}
            </span>
            <h2 className="text-[var(--color-text-primary)] font-semibold">{channel.name}</h2>
            {editingDescription ? (
              <input
                autoFocus
                className="ml-4 text-sm bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] border border-[var(--color-border)] rounded px-2 py-0.5 hidden md:inline-block flex-1 max-w-xs"
                value={descriptionDraft}
                onChange={(e) => setDescriptionDraft(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter') {
                    descriptionSavedRef.current = true;
                    try {
                      await api.updateChannel(channel.id, { description: descriptionDraft || null });
                    } catch (err) {
                      if (import.meta.env.DEV) console.error('Failed to update description:', err);
                    }
                    setEditingDescription(false);
                  } else if (e.key === 'Escape') {
                    descriptionSavedRef.current = true;
                    setEditingDescription(false);
                  }
                }}
                onBlur={async () => {
                  if (descriptionSavedRef.current) {
                    descriptionSavedRef.current = false;
                    return;
                  }
                  try {
                    await api.updateChannel(channel.id, { description: descriptionDraft || null });
                  } catch (err) {
                    if (import.meta.env.DEV) console.error('Failed to update description:', err);
                  }
                  setEditingDescription(false);
                }}
                placeholder="Add a topic..."
                maxLength={200}
              />
            ) : (
              <span
                className={`ml-4 text-[var(--color-text-muted)] text-sm truncate hidden md:inline ${isAdmin ? 'cursor-pointer hover:text-[var(--color-text-secondary)]' : ''}`}
                onClick={isAdmin ? () => { setDescriptionDraft(channel.description || ''); setEditingDescription(true); } : undefined}
              >
                {channel.description || (isAdmin ? 'Add a topic...' : '')}
              </span>
            )}
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={async () => {
              const newMuted = !channel.muted;
              try {
                await api.muteChannel(channel.id, newMuted);
                onMuteChannel?.(channel.id, newMuted);
              } catch (err) {
                if (import.meta.env.DEV) console.error('Failed to toggle mute:', err);
              }
            }}
            className={`p-2 rounded hover:bg-[var(--color-bg-tertiary)] transition-colors ${channel.muted ? 'text-yellow-500' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'}`}
            title={channel.muted ? 'Unmute channel' : 'Mute channel'}
          >
            {channel.muted ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            )}
          </button>
          {onOpenSearch && (
            <button
              onClick={onOpenSearch}
              className="p-2 rounded hover:bg-[var(--color-bg-tertiary)] transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hidden md:block"
              title="Search messages"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          )}
          <button
            onClick={() => setShowPinned(prev => !prev)}
            className={`p-2 rounded hover:bg-[var(--color-bg-tertiary)] transition-colors relative ${showPinned ? 'text-[var(--color-text-primary)] bg-[var(--color-bg-tertiary)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'}`}
            title="Pinned messages"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            {pinnedMessages.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-medium">
                {pinnedMessages.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setShowMembers(prev => !prev)}
            className={`p-2 rounded hover:bg-[var(--color-bg-tertiary)] transition-colors ${showMembers ? 'text-[var(--color-text-primary)] bg-[var(--color-bg-tertiary)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'}`}
            title="Members"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Offline Banner */}
      {!isOnline && (
        <div className="offline-banner px-4 py-2 text-center text-sm flex items-center justify-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728M5.636 18.364a9 9 0 010-12.728m2.828 9.9a5 5 0 010-7.072m7.072 0a5 5 0 010 7.072" />
          </svg>
          You're offline — showing cached messages
        </div>
      )}

      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        {loading ? (
          <div className="px-4 py-2">
            {Array.from({length: 8}).map((_, i) => <Skeleton.Message key={i} />)}
          </div>
        ) : (
          <>
            {hasMore && (
              <div ref={sentinelRef} className="text-center py-2">
                {loadingMore && (
                  <div className="flex items-center justify-center gap-2 text-[var(--color-text-muted)] text-sm py-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Loading...
                  </div>
                )}
              </div>
            )}
            <MessageList
              messages={messages}
              currentUser={user}
              onOpenThread={handleOpenThread}
              onEditMessage={handleEditMessage}
              onDeleteMessage={handleDeleteMessage}
              onAddReaction={handleAddReaction}
              onRemoveReaction={handleRemoveReaction}
              onPinMessage={handlePinMessage}
              onUnpinMessage={handleUnpinMessage}
              pinnedMessageIds={pinnedMessageIds}
              onSaveMessage={handleSaveMessage}
              onUnsaveMessage={handleUnsaveMessage}
              savedMessageIds={savedMessageIds}
              lastReadAt={lastReadAtRef.current}
              members={workspace?.members || []}
              onAvatarClick={setProfileUserId}
              onAddToLibrary={onAddToLibrary}
              onTogglePreview={handleTogglePreview}
              workspaceId={workspace?.id}
            />
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Typing Indicator */}
      {typingUsers.length > 0 && (
        <div className="px-4 py-2 text-[var(--color-text-muted)] text-sm">
          <span className="inline-flex items-center gap-1">
            <span className="typing-dot w-1.5 h-1.5 bg-[var(--color-text-muted)] rounded-full" />
            <span className="typing-dot w-1.5 h-1.5 bg-[var(--color-text-muted)] rounded-full" />
            <span className="typing-dot w-1.5 h-1.5 bg-[var(--color-text-muted)] rounded-full" />
          </span>
          <span className="ml-2">
            {typingUsers.map(u => u.displayName).join(', ')}{' '}
            {typingUsers.length === 1 ? 'is' : 'are'} typing...
          </span>
        </div>
      )}

      {/* Message Input */}
      <MessageInput
        channelName={channel.isDirect
          ? channel.otherMembers?.map(m => m.displayName).join(', ') || 'Direct Message'
          : channel.name
        }
        onSend={handleSendMessage}
        onTyping={handleTyping}
        members={workspace?.members || []}
        disabled={!isOnline}
        workspaceId={workspace?.id}
        onSlashCommand={setSlashCommandType}
      />

      {/* Members Panel */}
      {showMembers && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 md:bg-transparent" onClick={() => setShowMembers(false)} />
          <div className="fixed inset-0 z-50 md:left-auto md:w-80 md:border-l md:border-[var(--color-border)] safe-area-top bg-[var(--color-bg-secondary)]">
            <ChannelMembersPanel
              channel={channel}
              workspace={workspace}
              onClose={() => setShowMembers(false)}
            />
          </div>
        </>
      )}

      {/* Pinned Messages Panel */}
      {showPinned && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 md:bg-transparent" onClick={() => setShowPinned(false)} />
          <div className="fixed inset-0 z-50 md:left-auto md:w-80 md:border-l md:border-[var(--color-border)] safe-area-top bg-[var(--color-bg-secondary)]">
            <PinnedMessagesPanel
              pinnedMessages={pinnedMessages}
              onUnpin={handleUnpinMessage}
              onClose={() => setShowPinned(false)}
            />
          </div>
        </>
      )}
    </div>

    {profileUserId && (
      <MemberProfile
        userId={profileUserId}
        workspaceId={workspace?.id}
        onClose={() => setProfileUserId(null)}
        onStartDM={profileUserId !== user?.id ? onStartDM : null}
      />
    )}
    {slashCommandType && (
      <SlashCommandPicker
        type={slashCommandType}
        workspaceId={workspace?.id}
        onClose={() => setSlashCommandType(null)}
        onSelect={(type, id, title) => {
          setSlashCommandType(null);
          handleSendMessage(`[${type}:${id}]`);
        }}
      />
    )}
    </>
  );
}

export default ChannelView;
