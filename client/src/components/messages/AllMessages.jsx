import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import ErrorMessage from '../common/ErrorMessage';

function AllMessages({ workspaceId, onSelectChannel }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadMessages = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getMessageTimeline(workspaceId);
      setMessages(data.messages);
      setHasMore(data.hasMore);
      setNextCursor(data.nextCursor);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const loadMore = async () => {
    if (loadingMore || !hasMore || !nextCursor) return;
    setLoadingMore(true);
    try {
      const data = await api.getMessageTimeline(workspaceId, nextCursor);
      setMessages(prev => [...prev, ...data.messages]);
      setHasMore(data.hasMore);
      setNextCursor(data.nextCursor);
    } catch {}
    setLoadingMore(false);
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    if (diff < 604800000) return d.toLocaleDateString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500" />
      </div>
    );
  }

  if (error && messages.length === 0) {
    return <ErrorMessage message={error} onRetry={loadMessages} />;
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-5xl mb-4">💬</div>
        <h3 className="text-lg font-medium text-[var(--color-text-primary)] mb-2">
          No messages yet
        </h3>
        <p className="text-[var(--color-text-muted)] max-w-sm">
          Messages from all your channels will appear here in one feed.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-1">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">All Messages</h2>
        <button
          onClick={loadMessages}
          className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
        >
          Refresh
        </button>
      </div>

      {messages.map(msg => (
        <button
          key={msg.id}
          onClick={() => onSelectChannel?.(msg.channel?.id)}
          className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors group"
        >
          <div className="flex items-start gap-3">
            {msg.author?.avatarUrl ? (
              <img
                src={msg.author.avatarUrl}
                alt=""
                className="w-8 h-8 rounded-full flex-shrink-0 mt-0.5"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-[var(--color-bg-tertiary)] flex items-center justify-center text-sm font-medium text-[var(--color-text-muted)] flex-shrink-0 mt-0.5">
                {(msg.author?.displayName || msg.removedUserName || '?')[0]}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-medium text-sm text-[var(--color-text-primary)]">
                  {msg.author?.displayName || msg.removedUserName || 'Unknown'}
                </span>
                <span className="text-xs text-[var(--color-text-muted)]">
                  in #{msg.channel?.name || 'unknown'}
                </span>
                <span className="text-xs text-[var(--color-text-muted)] ml-auto">
                  {formatDate(msg.createdAt)}
                </span>
              </div>
              <p className="text-sm text-[var(--color-text-secondary)] line-clamp-2">
                {msg.content || (msg._count?.attachments > 0 ? `📎 ${msg._count.attachments} attachment${msg._count.attachments > 1 ? 's' : ''}` : '')}
              </p>
              {msg._count?.replies > 0 && (
                <span className="text-xs text-[var(--color-primary)] mt-0.5 inline-block">
                  {msg._count.replies} {msg._count.replies === 1 ? 'reply' : 'replies'}
                </span>
              )}
            </div>
          </div>
        </button>
      ))}

      {hasMore && (
        <div className="text-center py-3">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="text-sm text-[var(--color-primary)] hover:underline disabled:opacity-50"
          >
            {loadingMore ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}

export default AllMessages;
