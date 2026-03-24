import { useState, useEffect } from 'react';
import api from '../../services/api';
import ErrorMessage from '../common/ErrorMessage';
import Skeleton from '../common/Skeleton';

function SavedMessages({ workspaceId }) {
  const [savedMessages, setSavedMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadSavedMessages();
  }, [workspaceId]);

  const loadSavedMessages = async () => {
    try {
      setLoading(true);
      const data = await api.getSavedMessages(workspaceId);
      setSavedMessages(data);
      setError(null);
    } catch (err) {
      console.error('Failed to load saved messages:', err);
      setError(err.message || 'Failed to load saved messages');
    } finally {
      setLoading(false);
    }
  };

  const handleUnsave = async (messageId) => {
    try {
      await api.unsaveMessage(messageId);
      setSavedMessages(prev => prev.filter(s => s.messageId !== messageId));
    } catch (err) {
      console.error('Failed to unsave message:', err);
    }
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton.Card key={i} />
        ))}
      </div>
    );
  }

  if (error && savedMessages.length === 0) {
    return (
      <ErrorMessage
        message={error}
        onRetry={loadSavedMessages}
        className="py-16"
      />
    );
  }

  if (savedMessages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-5xl mb-4">🔖</div>
        <h3 className="text-lg font-medium text-[var(--color-text-primary)] mb-2">
          No saved messages yet
        </h3>
        <p className="text-[var(--color-text-muted)] max-w-sm mb-4">
          Save important messages to find them quickly later. Click the bookmark icon on any message to save it.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <p className="text-sm text-[var(--color-text-muted)] mb-4">
        {savedMessages.length} saved message{savedMessages.length !== 1 ? 's' : ''}
      </p>
      {savedMessages.map((saved) => {
        const msg = saved.message;
        if (!msg) return null;
        return (
          <div
            key={saved.id}
            className="bg-[var(--color-bg-secondary)] rounded-lg p-3 border border-[var(--color-border)]"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {msg.author?.avatarUrl ? (
                  <img
                    src={msg.author.avatarUrl}
                    alt=""
                    className="w-8 h-8 rounded-full flex-shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-white text-sm flex-shrink-0">
                    {msg.author?.displayName?.[0] || '?'}
                  </div>
                )}
                <div className="min-w-0">
                  <span className="font-medium text-[var(--color-text-primary)] text-sm">
                    {msg.author?.displayName || 'Unknown'}
                  </span>
                  <span className="text-xs text-[var(--color-text-muted)] ml-2">
                    {formatDate(msg.createdAt)}
                  </span>
                  {msg.channel && (
                    <span className="text-xs text-[var(--color-text-muted)] ml-2">
                      in #{msg.channel.name}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleUnsave(msg.id)}
                className="text-blue-400 hover:text-blue-300 p-1 flex-shrink-0"
                title="Unsave message"
                aria-label="Unsave message"
              >
                🔖
              </button>
            </div>
            {msg.content && (
              <p className="mt-2 text-sm text-[var(--color-text-primary)] whitespace-pre-wrap break-words">
                {msg.content}
              </p>
            )}
            {msg.attachments?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {msg.attachments.map((att) => (
                  <div key={att.id} className="text-xs text-[var(--color-text-muted)]">
                    {att.type === 'IMAGE' ? (
                      <img
                        src={att.thumbnailUrl || att.url}
                        alt={att.filename}
                        className="max-w-[200px] max-h-[150px] rounded"
                      />
                    ) : (
                      <span>📎 {att.filename}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default SavedMessages;
