import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import ReactionDisplay from '../messages/ReactionDisplay';
import ReactionPicker from '../messages/ReactionPicker';

const handleDownload = async (url, filename) => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
  } catch (err) {
    console.error('Download failed:', err);
    window.open(url, '_blank');
  }
};

function ThreadView({ message, channelId, onClose }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [parentReactions, setParentReactions] = useState(message.reactions || []);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState(null);
  const repliesEndRef = useRef(null);

  useEffect(() => {
    loadReplies();
  }, [message.id]);

  useEffect(() => {
    if (socket) {
      socket.on('message:reply', handleNewReply);
      socket.on('message:updated', handleUpdatedReply);
      socket.on('message:deleted', handleDeletedReply);
      socket.on('reaction:added', handleReactionAdded);
      socket.on('reaction:removed', handleReactionRemoved);

      return () => {
        socket.off('message:reply', handleNewReply);
        socket.off('message:updated', handleUpdatedReply);
        socket.off('message:deleted', handleDeletedReply);
        socket.off('reaction:added', handleReactionAdded);
        socket.off('reaction:removed', handleReactionRemoved);
      };
    }
  }, [socket, message.id]);

  const loadReplies = async () => {
    setLoading(true);
    try {
      const data = await api.getReplies(message.id);
      setReplies(data);
      scrollToBottom();
    } catch (err) {
      console.error('Failed to load replies:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleNewReply = ({ parentId, message: newReply }) => {
    if (parentId === message.id) {
      setReplies(prev => [...prev, newReply]);
      scrollToBottom();
    }
  };

  const handleUpdatedReply = (updatedReply) => {
    setReplies(prev =>
      prev.map(r => (r.id === updatedReply.id ? updatedReply : r))
    );
  };

  const handleDeletedReply = ({ messageId, parentId }) => {
    if (parentId === message.id) {
      setReplies(prev => prev.filter(r => r.id !== messageId));
    }
  };

  const handleReactionAdded = ({ messageId, reaction }) => {
    if (messageId === message.id) {
      // Parent message reaction
      setParentReactions(prev => {
        const exists = prev.some(r => r.id === reaction.id);
        if (!exists) {
          return [...prev, reaction];
        }
        return prev;
      });
    } else {
      // Reply reaction
      setReplies(prev =>
        prev.map(r => {
          if (r.id === messageId) {
            const reactions = r.reactions || [];
            const exists = reactions.some(rx => rx.id === reaction.id);
            if (!exists) {
              return { ...r, reactions: [...reactions, reaction] };
            }
          }
          return r;
        })
      );
    }
  };

  const handleReactionRemoved = ({ messageId, emoji, userId }) => {
    if (messageId === message.id) {
      // Parent message reaction
      setParentReactions(prev =>
        prev.filter(r => !(r.emoji === emoji && r.user.id === userId))
      );
    } else {
      // Reply reaction
      setReplies(prev =>
        prev.map(r => {
          if (r.id === messageId) {
            const reactions = (r.reactions || []).filter(
              rx => !(rx.emoji === emoji && rx.user.id === userId)
            );
            return { ...r, reactions };
          }
          return r;
        })
      );
    }
  };

  const handleAddReaction = async (messageId, emoji) => {
    try {
      await api.addReaction(messageId, emoji);
    } catch (err) {
      console.error('Failed to add reaction:', err);
    }
    setReactionPickerMessageId(null);
  };

  const handleRemoveReaction = async (messageId, emoji) => {
    try {
      await api.removeReaction(messageId, emoji);
    } catch (err) {
      console.error('Failed to remove reaction:', err);
    }
  };

  const handleToggleReaction = (messageId, emoji, hasReacted) => {
    if (hasReacted) {
      handleRemoveReaction(messageId, emoji);
    } else {
      handleAddReaction(messageId, emoji);
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      repliesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!content.trim() || sending) return;

    setSending(true);
    try {
      await api.sendMessage(channelId, content.trim(), message.id);
      setContent('');
    } catch (err) {
      console.error('Failed to send reply:', err);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (date) => format(new Date(date), 'MMM d, h:mm a');

  return (
    <div className="flex flex-col h-full bg-gray-800">
      {/* Header */}
      <div className="h-14 border-b border-gray-700 px-4 flex items-center justify-between">
        <h3 className="text-white font-semibold">Thread</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors text-xl"
        >
          ×
        </button>
      </div>

      {/* Original Message */}
      <div className="p-4 border-b border-gray-700 group relative">
        <div className="flex gap-3">
          <div className="w-9 h-9 rounded bg-slack-green flex-shrink-0 flex items-center justify-center text-white font-medium">
            {message.author.displayName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="font-semibold text-white">
                {message.author.displayName}
              </span>
              <span className="text-xs text-gray-400">
                {formatTime(message.createdAt)}
              </span>
            </div>
            <div className="text-gray-200 break-words whitespace-pre-wrap">
              {message.content}
            </div>
            <ReactionDisplay
              reactions={parentReactions}
              currentUserId={user.id}
              onToggleReaction={(emoji, hasReacted) => handleToggleReaction(message.id, emoji, hasReacted)}
            />
          </div>
        </div>
        <div className="mt-2 text-xs text-gray-400">
          {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
        </div>
        {/* Reaction button for parent message */}
        <div className="absolute right-4 top-4 opacity-0 group-hover:opacity-100 transition-opacity">
          {reactionPickerMessageId === message.id && (
            <div className="absolute right-0 bottom-full mb-1 z-10">
              <ReactionPicker
                onSelect={(emoji) => handleAddReaction(message.id, emoji)}
                onClose={() => setReactionPickerMessageId(null)}
              />
            </div>
          )}
          <button
            onClick={() => setReactionPickerMessageId(
              reactionPickerMessageId === message.id ? null : message.id
            )}
            className="p-1.5 bg-gray-700 hover:bg-gray-600 rounded border border-gray-600 text-gray-300 hover:text-white"
            title="Add reaction"
          >
            😀
          </button>
        </div>
      </div>

      {/* Replies */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-400">
            Loading replies...
          </div>
        ) : replies.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
            No replies yet. Start the conversation!
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {replies.map((reply) => (
              <div key={reply.id} className="flex gap-3 group relative">
                <div className="w-8 h-8 rounded bg-slack-green flex-shrink-0 flex items-center justify-center text-white text-sm font-medium">
                  {reply.author.displayName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-white text-sm">
                      {reply.author.displayName}
                    </span>
                    <span className="text-xs text-gray-400">
                      {formatTime(reply.createdAt)}
                    </span>
                  </div>
                  <div className="text-gray-200 text-sm break-words whitespace-pre-wrap">
                    {reply.content}
                  </div>
                  {/* Attachments */}
                  {reply.attachments?.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {reply.attachments.map((att) => (
                        <div key={att.id}>
                          {att.type === 'IMAGE' && (
                            <div className="relative inline-block group/img">
                              <img
                                src={att.url}
                                alt={att.filename}
                                className="max-w-sm max-h-60 rounded cursor-pointer"
                                loading="lazy"
                                onClick={() => window.open(att.url, '_blank')}
                              />
                              <div className="absolute bottom-2 right-2 opacity-0 group-hover/img:opacity-100 transition-opacity">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownload(att.url, att.filename);
                                  }}
                                  className="bg-gray-900/80 text-white px-2 py-1 rounded text-xs hover:bg-gray-900 flex items-center gap-1"
                                  title="Download"
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                  </svg>
                                </button>
                              </div>
                              <div className="text-xs text-gray-400 mt-1">{att.filename}</div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Reactions */}
                  <ReactionDisplay
                    reactions={reply.reactions}
                    currentUserId={user.id}
                    onToggleReaction={(emoji, hasReacted) => handleToggleReaction(reply.id, emoji, hasReacted)}
                  />
                </div>
                {/* Reaction button for reply */}
                <div className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  {reactionPickerMessageId === reply.id && (
                    <div className="absolute right-0 bottom-full mb-1 z-10">
                      <ReactionPicker
                        onSelect={(emoji) => handleAddReaction(reply.id, emoji)}
                        onClose={() => setReactionPickerMessageId(null)}
                      />
                    </div>
                  )}
                  <button
                    onClick={() => setReactionPickerMessageId(
                      reactionPickerMessageId === reply.id ? null : reply.id
                    )}
                    className="p-1 bg-gray-700 hover:bg-gray-600 rounded border border-gray-600 text-gray-300 hover:text-white text-sm"
                    title="Add reaction"
                  >
                    😀
                  </button>
                </div>
              </div>
            ))}
            <div ref={repliesEndRef} />
          </div>
        )}
      </div>

      {/* Reply Input */}
      <form onSubmit={handleSend} className="p-4 border-t border-gray-700">
        <div className="bg-gray-700 rounded-lg">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend(e);
              }
            }}
            placeholder="Reply..."
            className="w-full bg-transparent text-white px-4 py-3 resize-none outline-none placeholder-gray-400 text-sm"
            rows={2}
            disabled={sending}
          />
          <div className="flex justify-end px-3 py-2">
            <button
              type="submit"
              disabled={!content.trim() || sending}
              className="bg-slack-green text-white px-3 py-1 rounded text-sm font-medium hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? '...' : 'Reply'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default ThreadView;
