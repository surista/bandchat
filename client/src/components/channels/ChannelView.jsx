/**
 * @fileoverview Channel view component for displaying and sending messages.
 * Handles real-time message updates, typing indicators, and reactions.
 */

import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import MessageList from '../messages/MessageList';
import MessageInput from '../messages/MessageInput';
import ChannelMembersPanel from './ChannelMembersPanel';
import PinnedMessagesPanel from './PinnedMessagesPanel';
import Skeleton from '../common/Skeleton';
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
function ChannelView({ channel, workspace, onOpenThread, onUpdateUnread, openThreadId, onOpenSearch }) {
  const { user } = useAuth();
  const { socket, joinChannel, leaveChannel, startTyping, stopTyping } = useSocket();
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
  const lastReadAtRef = useRef(null);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const typingTimeoutRef = useRef(null);
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

    loadMessages();
    loadPinnedMessages();
    joinChannel(channel.id);

    return () => {
      leaveChannel(channel.id);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [channel.id]);

  // Scroll to bottom after messages are rendered
  useLayoutEffect(() => {
    if (shouldScrollToBottom && !loading && messagesContainerRef.current) {
      // Use requestAnimationFrame to ensure DOM is fully updated
      requestAnimationFrame(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
      });
      setShouldScrollToBottom(false);
    }
  }, [shouldScrollToBottom, messages, loading]);

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
      };
    }
  }, [socket]);

  const loadMessages = async () => {
    setLoading(true);
    try {
      const data = await api.getMessages(channel.id);
      setMessages(data.messages);
      setHasMore(data.hasMore);
      setNextCursor(data.nextCursor);

      // Trigger scroll to bottom after messages render
      setShouldScrollToBottom(true);

      // Mark channel as read on server (badge already cleared optimistically)
      try {
        await api.markChannelRead(channel.id);
      } catch (err) {
        console.error('Failed to mark channel as read:', err);
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMoreMessages = async () => {
    if (!hasMore || !nextCursor) return;

    try {
      const data = await api.getMessages(channel.id, nextCursor);
      setMessages(prev => [...data.messages, ...prev]);
      setHasMore(data.hasMore);
      setNextCursor(data.nextCursor);
    } catch (err) {
      console.error('Failed to load more messages:', err);
    }
  };

  const loadPinnedMessages = async () => {
    try {
      const data = await api.getPinnedMessages(channel.id);
      setPinnedMessages(data);
    } catch (err) {
      console.error('Failed to load pinned messages:', err);
    }
  };

  const handleNewMessage = (message) => {
    if (message.channelId === channelIdRef.current) {
      setMessages(prev => {
        // Check if this is confirming an optimistic message we sent
        const optimisticIndex = prev.findIndex(
          m => m.pending && m.author.id === message.author.id && m.content === message.content
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
      if (message.author.id !== userIdRef.current) {
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
              unreadReplies: (reply.author.id !== userIdRef.current && openThreadIdRef.current !== parentId)
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
    }
  };

  const handleTypingStop = ({ channelId, userId }) => {
    if (channelId === channelIdRef.current) {
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

  const pinnedMessageIds = new Set(pinnedMessages.map(p => p.messageId));

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
        const uploadPromises = files.map(file => api.uploadFile(file));
        const uploadedFiles = await Promise.all(uploadPromises);
        attachments = uploadedFiles.map(file => ({
          type: file.type,
          url: file.url,
          filename: file.filename,
          size: file.size
        }));
      }

      // Send message with attachments
      await api.sendMessage(channel.id, content || '', null, attachments);
      // Real message will replace optimistic one via socket event

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
    startTyping(channel.id);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      stopTyping(channel.id);
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
    <div className="flex-1 flex flex-col bg-gray-800 min-h-0">
      {/* Channel Header */}
      <div className="h-14 border-b border-gray-700 px-4 flex items-center shrink-0">
        {channel.isDirect ? (
          <>
            <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-white font-medium mr-2">
              {channel.otherMembers?.[0]?.displayName?.charAt(0).toUpperCase() || '?'}
            </div>
            <h2 className="text-white font-semibold">
              {channel.otherMembers?.map(m => m.displayName).join(', ') || 'Direct Message'}
            </h2>
          </>
        ) : (
          <>
            <span className="text-gray-400 mr-2">
              {channel.isPrivate ? '🔒' : '#'}
            </span>
            <h2 className="text-white font-semibold">{channel.name}</h2>
            {channel.description && (
              <span className="ml-4 text-gray-400 text-sm truncate hidden md:inline">
                {channel.description}
              </span>
            )}
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          {onOpenSearch && (
            <button
              onClick={onOpenSearch}
              className="p-2 rounded hover:bg-gray-700 transition-colors text-gray-400 hover:text-white hidden md:block"
              title="Search messages"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          )}
          <button
            onClick={() => setShowPinned(prev => !prev)}
            className={`p-2 rounded hover:bg-gray-700 transition-colors relative ${showPinned ? 'text-white bg-gray-700' : 'text-gray-400 hover:text-white'}`}
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
            className={`p-2 rounded hover:bg-gray-700 transition-colors ${showMembers ? 'text-white bg-gray-700' : 'text-gray-400 hover:text-white'}`}
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
              <div className="text-center py-4">
                <button
                  onClick={loadMoreMessages}
                  className="text-slack-blue hover:underline text-sm"
                >
                  Load older messages
                </button>
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
              lastReadAt={lastReadAtRef.current}
            />
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Typing Indicator */}
      {typingUsers.length > 0 && (
        <div className="px-4 py-2 text-gray-400 text-sm">
          <span className="inline-flex items-center gap-1">
            <span className="typing-dot w-1.5 h-1.5 bg-gray-400 rounded-full" />
            <span className="typing-dot w-1.5 h-1.5 bg-gray-400 rounded-full" />
            <span className="typing-dot w-1.5 h-1.5 bg-gray-400 rounded-full" />
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
      />

      {/* Members Panel */}
      {showMembers && (
        <>
          <div className="hidden md:block fixed inset-0 z-40" onClick={() => setShowMembers(false)} />
          <div className="fixed inset-0 z-50 md:left-auto md:w-80 md:border-l md:border-gray-700">
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
          <div className="hidden md:block fixed inset-0 z-40" onClick={() => setShowPinned(false)} />
          <div className="fixed inset-0 z-50 md:left-auto md:w-80 md:border-l md:border-gray-700">
            <PinnedMessagesPanel
              pinnedMessages={pinnedMessages}
              onUnpin={handleUnpinMessage}
              onClose={() => setShowPinned(false)}
            />
          </div>
        </>
      )}
    </div>
  );
}

export default ChannelView;
