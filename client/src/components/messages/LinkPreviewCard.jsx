import { useState, useEffect, useRef } from 'react';
import api from '../../services/api';

// Client-side cache to avoid duplicate fetches
const previewCache = new Map();

export function clearPreviewCache() {
  previewCache.clear();
}

const getHostname = (url) => {
  try { return new URL(url).hostname; } catch { return url; }
};

const isMusicUrl = (url) => {
  try {
    const host = new URL(url).hostname;
    return host.includes('spotify.com') || host.includes('music.apple.com') || host.includes('youtube.com') || host.includes('youtu.be') || host.includes('soundcloud.com') || host.includes('deezer.com');
  } catch { return false; }
};

export default function LinkPreviewCard({ url, onAddToLibrary, isOwn, onDismiss }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    // Check cache first
    if (previewCache.has(url)) {
      const cached = previewCache.get(url);
      if (cached.error) {
        setError(true);
        setLoading(false);
      } else {
        setPreview(cached);
        setLoading(false);
      }
      return;
    }

    const fetchPreview = async () => {
      try {
        const data = await api.getLinkPreview(url);
        if (!mountedRef.current) return;
        if (data.title || data.description) {
          previewCache.set(url, data);
          if (previewCache.size > 200) {
            const firstKey = previewCache.keys().next().value;
            previewCache.delete(firstKey);
          }
          setPreview(data);
        } else {
          previewCache.set(url, { error: true });
          if (previewCache.size > 200) {
            const firstKey = previewCache.keys().next().value;
            previewCache.delete(firstKey);
          }
          setError(true);
        }
      } catch {
        if (!mountedRef.current) return;
        previewCache.set(url, { error: true });
        if (previewCache.size > 200) {
          const firstKey = previewCache.keys().next().value;
          previewCache.delete(firstKey);
        }
        setError(true);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };

    fetchPreview();

    return () => {
      mountedRef.current = false;
    };
  }, [url]);

  if (loading || error || !preview) return null;

  const showAddToLibrary = isMusicUrl(url) && onAddToLibrary;

  return (
    <div className="max-w-md mt-2 relative group" data-preview-url={url}>
      {isOwn && onDismiss && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDismiss(); }}
          className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gray-700 border border-gray-500 text-gray-300 hover:text-white hover:bg-gray-600 flex items-center justify-center text-xs z-10 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Remove preview"
        >
          &times;
        </button>
      )}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`block rounded-lg border border-gray-600 bg-gray-750 hover:bg-gray-700 transition-colors overflow-hidden no-underline ${showAddToLibrary ? 'rounded-b-none' : ''}`}
      >
        <div className="flex">
          <div className="flex-1 p-3 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {preview.favicon && (
                <img
                  src={preview.favicon}
                  alt=""
                  className="w-4 h-4 rounded"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              )}
              <span className="text-xs text-gray-400 truncate">
                {getHostname(url)}
              </span>
            </div>
            {preview.title && (
              <div className="text-sm text-blue-400 font-medium truncate mb-1">
                {preview.title}
              </div>
            )}
            {preview.description && (
              <div className="text-xs text-gray-400 line-clamp-2">
                {preview.description}
              </div>
            )}
          </div>
          {preview.image && (
            <div className="w-20 h-20 flex-shrink-0">
              <img
                src={preview.image}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => { e.target.parentElement.style.display = 'none'; }}
              />
            </div>
          )}
        </div>
      </a>
      {showAddToLibrary && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAddToLibrary(url, preview.title);
          }}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-green-600/20 border border-t-0 border-gray-600 rounded-b-lg text-green-400 hover:bg-green-600/30 transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
          </svg>
          Add to Song Library
        </button>
      )}
    </div>
  );
}
