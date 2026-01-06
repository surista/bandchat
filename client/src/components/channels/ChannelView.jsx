import { useState, useEffect, useRef } from 'react';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import MessageList from '../messages/MessageList';
import MessageInput from '../messages/MessageInput';

function ChannelView({ channel, workspace, onOpenThread, onUpdateUnread }) {
  const { user } = useAuth();
  const { socket, joinChannel, leaveChannel, startTyping, stopTyping } = useSocket();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [typingUsers, setTypingUsers] = useState([]);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    loadMessages();
    joinChannel(channel.id);

    return () => {
      leaveChannel(channel.id);
    };
  }, [channel.id]);

  useEffect(() => {
    if (socket) {
      socket.on('message:new', handleNewMessage);
      socket.on('message:updated', handleUpdatedMessage);
      socket.on('message:deleted', handleDeletedMessage);
      socket.on('message:reply', handleNewReply);
      socket.on('typing:start', handleTypingStart);
      socket.on('typing:stop', handleTypingStop);

      return () => {
        socket.off('message:new', handleNewMessage);
        socket.off('message:updated', handleUpdatedMessage);
        socket.off('message:deleted', handleDeletedMessage);
        socket.off('message:reply', handleNewReply);
        socket.off('typing:start', handleTypingStart);
        socket.off('typing:stop', handleTypingStop);
      };
    }
  }, [socket, channel.id]);

  const loadMessages = async () => {
    setLoading(true);
    try {
      const data = await api.getMessages(channel.id);
      setMessages(data.messages);
      setHasMore(data.hasMore);
      setNextCursor(data.nextCursor);
      scrollToBottom();

      // Mark channel as read
      await api.markChannelRead(channel.id);
      onUpdateUnread(0);
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

  const handleNewMessage = (message) => {
    if (message.channelId === channel.id) {
      setMessages(prev => [...prev, message]);
      scrollToBottom();

      // Mark as read if it's not our message
      if (message.author.id !== user.id) {
        api.markChannelRead(channel.id);
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

  const handleNewReply = ({ parentId, message }) => {
    setMessages(prev =>
      prev.map(m =>
        m.id === parentId
          ? { ...m, _count: { replies: (m._count?.replies || 0) + 1 } }
          : m
      )
    );
  };

  const handleTypingStart = ({ channelId, user: typingUser }) => {
    if (channelId === channel.id && typingUser.id !== user.id) {
      setTypingUsers(prev => {
        if (!prev.find(u => u.id === typingUser.id)) {
          return [...prev, typingUser];
        }
        return prev;
      });
    }
  };

  const handleTypingStop = ({ channelId, userId }) => {
    if (channelId === channel.id) {
      setTypingUsers(prev => prev.filter(u => u.id !== userId));
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleSendMessage = async (content) => {
    try {
      await api.sendMessage(channel.id, content);
      // Message will be added via socket event
    } catch (err) {
      console.error('Failed to send message:', err);
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

  return (
    <div className="flex-1 flex flex-col bg-gray-800">
      {/* Channel Header */}
      <div className="h-14 border-b border-gray-700 px-4 flex items-center">
        <span className="text-gray-400 mr-2">
          {channel.isPrivate ? '🔒' : '#'}
        </span>
        <h2 className="text-white font-semibold">{channel.name}</h2>
        {channel.description && (
          <span className="ml-4 text-gray-400 text-sm truncate">
            {channel.description}
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            Loading messages...
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
              onOpenThread={onOpenThread}
              onEditMessage={handleEditMessage}
              onDeleteMessage={handleDeleteMessage}
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
        channelName={channel.name}
        onSend={handleSendMessage}
        onTyping={handleTyping}
      />
    </div>
  );
}

export default ChannelView;
