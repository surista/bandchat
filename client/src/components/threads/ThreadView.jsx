import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

function ThreadView({ message, channelId, onClose }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const repliesEndRef = useRef(null);

  useEffect(() => {
    loadReplies();
  }, [message.id]);

  useEffect(() => {
    if (socket) {
      socket.on('message:reply', handleNewReply);
      socket.on('message:updated', handleUpdatedReply);
      socket.on('message:deleted', handleDeletedReply);

      return () => {
        socket.off('message:reply', handleNewReply);
        socket.off('message:updated', handleUpdatedReply);
        socket.off('message:deleted', handleDeletedReply);
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
      <div className="p-4 border-b border-gray-700">
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
          </div>
        </div>
        <div className="mt-2 text-xs text-gray-400">
          {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
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
              <div key={reply.id} className="flex gap-3">
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
