import { useState, useEffect } from 'react';
import api from '../../services/api';

const embedCache = new Map();

/**
 * Renders a rich embed card for [type:uuid] tokens in messages.
 * Fetches item data and displays as a card with title, metadata, and artwork.
 */
export default function EmbedCard({ type, id, workspaceId, onClick }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const cacheKey = `${type}:${id}`;
    if (embedCache.has(cacheKey)) {
      setData(embedCache.get(cacheKey));
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        let item;
        let embed;
        if (type === 'song') {
          item = await api.getSong(id);
          embed = {
            title: item.title,
            subtitle: item.artist || '',
            image: item.artworkUrl,
            meta: [item.key, item.bpm ? `${item.bpm} BPM` : null].filter(Boolean).join(' · '),
            icon: '🎵',
          };
        } else if (type === 'setlist') {
          item = await api.getSetlist(id);
          embed = {
            title: item.name,
            subtitle: `${item.songs?.length || 0} songs`,
            meta: item.description || '',
            icon: '📋',
          };
        } else if (type === 'gig') {
          item = await api.getGig(id);
          embed = {
            title: item.title,
            subtitle: new Date(item.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
            meta: item.venue || '',
            icon: '🎤',
          };
        } else if (type === 'poll') {
          item = await api.getPoll(id);
          embed = {
            title: item.question,
            subtitle: `${item.options?.length || 0} options`,
            meta: item.closed ? 'Closed' : 'Active',
            icon: '📊',
          };
        }
        if (embed) {
          setData(embed);
          embedCache.set(cacheKey, embed);
          // Cap cache size
          if (embedCache.size > 100) {
            embedCache.delete(embedCache.keys().next().value);
          }
        }
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [type, id, workspaceId]);

  if (loading) {
    return (
      <div className="my-2 max-w-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-3 animate-pulse">
        <div className="h-4 bg-[var(--color-bg-secondary)] rounded w-3/4 mb-2" />
        <div className="h-3 bg-[var(--color-bg-secondary)] rounded w-1/2" />
      </div>
    );
  }

  if (error || !data) {
    const handleRetry = () => {
      setError(false);
      setLoading(true);
      setData(null);
      const cacheKey = `${type}:${id}`;
      embedCache.delete(cacheKey);
      // Re-trigger by forcing a state change — the useEffect depends on type/id
      // so we manually re-run the fetch
      (async () => {
        try {
          let item;
          if (type === 'song') {
            item = await api.getSong(id);
            setData({ title: item.title, subtitle: item.artist || '', image: item.artworkUrl, meta: [item.key, item.bpm ? `${item.bpm} BPM` : null].filter(Boolean).join(' · '), icon: '🎵' });
          } else if (type === 'setlist') {
            item = await api.getSetlist(id);
            setData({ title: item.name, subtitle: `${item.songs?.length || 0} songs`, meta: item.description || '', icon: '📋' });
          } else if (type === 'gig') {
            item = await api.getGig(id);
            setData({ title: item.title, subtitle: new Date(item.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }), meta: item.venue || '', icon: '🎤' });
          } else if (type === 'poll') {
            item = await api.getPoll(id);
            setData({ title: item.question, subtitle: `${item.options?.length || 0} options`, meta: item.closed ? 'Closed' : 'Active', icon: '📊' });
          }
        } catch {
          setError(true);
        } finally {
          setLoading(false);
        }
      })();
    };

    return (
      <div className="my-2 max-w-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-3 text-[var(--color-text-muted)] text-sm italic flex items-center justify-between">
        <span>Could not load {type}</span>
        <button
          onClick={handleRetry}
          className="ml-2 text-xs text-blue-400 hover:text-blue-300 not-italic font-medium"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onClick?.(type, id)}
      className="my-2 max-w-sm w-full text-left rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-secondary)] transition-colors overflow-hidden cursor-pointer block"
    >
      <div className="flex items-start gap-3 p-3">
        {data.image ? (
          <img src={data.image} alt="" className="w-12 h-12 rounded object-cover flex-shrink-0" />
        ) : (
          <span className="text-2xl flex-shrink-0">{data.icon}</span>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[var(--color-text-primary)] font-medium text-sm truncate">{data.title}</div>
          {data.subtitle && (
            <div className="text-[var(--color-text-muted)] text-xs truncate">{data.subtitle}</div>
          )}
          {data.meta && (
            <div className="text-[var(--color-text-muted)] text-xs mt-1 truncate">{data.meta}</div>
          )}
        </div>
      </div>
    </button>
  );
}
