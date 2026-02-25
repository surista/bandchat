import { useState, useEffect, useRef } from 'react';
import api from '../../services/api';

// Client-side cache to avoid duplicate fetches
const previewCache = new Map();

const getHostname = (url) => {
  try { return new URL(url).hostname; } catch { return url; }
};

export default function LinkPreviewCard({ url }) {
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

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block max-w-md mt-2 rounded-lg border border-gray-600 bg-gray-750 hover:bg-gray-700 transition-colors overflow-hidden no-underline"
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
  );
}
