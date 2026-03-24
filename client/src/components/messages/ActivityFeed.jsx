import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import ErrorMessage from '../common/ErrorMessage';
import Skeleton from '../common/Skeleton';

function ActivityFeed({ workspaceId, onSelectChannel }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadActivity = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getActivity(workspaceId);
      setItems(data.items || []);
    } catch (err) {
      setError(err.message || 'Failed to load activity');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { loadActivity(); }, [loadActivity]);

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

  const getIcon = (type) => {
    if (type === 'reaction') return '👍';
    if (type === 'mention') return '@';
    if (type === 'thread_reply') return '💬';
    return '•';
  };

  const getDescription = (item) => {
    if (item.type === 'reaction') {
      return <><strong>{item.actor?.displayName}</strong> reacted {item.emoji} to your message in <span className="text-[var(--color-text-muted)]">#{item.channelName}</span></>;
    }
    if (item.type === 'mention') {
      return <><strong>{item.actor?.displayName}</strong> mentioned you in <span className="text-[var(--color-text-muted)]">#{item.channelName}</span></>;
    }
    if (item.type === 'thread_reply') {
      return <><strong>{item.actor?.displayName}</strong> replied to a thread in <span className="text-[var(--color-text-muted)]">#{item.channelName}</span></>;
    }
    return null;
  };

  if (loading) {
    return (
      <div className="p-4 space-y-1">
        <div className="h-6 w-32 mb-4"><Skeleton className="h-6 w-32" /></div>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton.Message key={i} />
        ))}
      </div>
    );
  }

  if (error && items.length === 0) {
    return <ErrorMessage message={error} onRetry={loadActivity} />;
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-5xl mb-4">🔔</div>
        <h3 className="text-lg font-medium text-[var(--color-text-primary)] mb-2">
          No activity yet
        </h3>
        <p className="text-[var(--color-text-muted)] max-w-sm">
          Reactions to your messages, mentions, and thread replies will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[var(--color-bg-primary)] p-4 space-y-1">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Activity</h2>
        <button
          onClick={loadActivity}
          className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
        >
          Refresh
        </button>
      </div>

      {items.map(item => (
        <button
          key={item.id}
          onClick={() => onSelectChannel?.(item.channelId, item.type === 'thread_reply' ? { threadId: item.parentId } : undefined)}
          className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors"
        >
          <div className="flex items-start gap-3">
            {item.actor?.avatarUrl ? (
              <img src={item.actor.avatarUrl} alt="" className="w-8 h-8 rounded-full flex-shrink-0 mt-0.5" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-[var(--color-bg-tertiary)] flex items-center justify-center text-sm font-medium text-[var(--color-text-muted)] flex-shrink-0 mt-0.5">
                {item.type === 'mention' ? '@' : (item.actor?.displayName || '?')[0]}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm text-[var(--color-text-secondary)]">
                  {getDescription(item)}
                </span>
                <span className="text-xs text-[var(--color-text-muted)] ml-auto flex-shrink-0">
                  {formatDate(item.createdAt)}
                </span>
              </div>
              {item.message?.content && (
                <p className="text-sm text-[var(--color-text-muted)] line-clamp-1">
                  {item.message.content}
                </p>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

export default ActivityFeed;
