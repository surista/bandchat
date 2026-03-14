import { useState, useEffect, useCallback, useRef } from 'react';
import { formatDuration } from '../../utils/formatDuration';

export function LiveMode({ setlistItems, setlistName, onClose }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const timerRef = useRef(null);
  const containerRef = useRef(null);

  const items = setlistItems || [];

  // Request fullscreen on mount
  useEffect(() => {
    try {
      document.documentElement.requestFullscreen?.();
    } catch (e) {
      // Fullscreen may not be available
    }
    return () => {
      try {
        if (document.fullscreenElement) {
          document.exitFullscreen?.();
        }
      } catch (e) {
        // ignore
      }
    };
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setCurrentIndex(prev => Math.min(prev + 1, items.length - 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setCurrentIndex(prev => Math.max(prev - 1, 0));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items.length, onClose]);

  // Auto-advance timer
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!autoAdvance || currentIndex >= items.length - 1) return;

    const currentItem = items[currentIndex];
    let durationSecs = 0;

    if (currentItem.type === 'SET_BREAK') {
      durationSecs = currentItem.duration || 15;
    } else if (currentItem.type === 'MC') {
      durationSecs = currentItem.duration || 60;
    } else if (currentItem.song?.duration) {
      durationSecs = currentItem.song.duration;
    }

    if (durationSecs > 0) {
      timerRef.current = setTimeout(() => {
        setCurrentIndex(prev => Math.min(prev + 1, items.length - 1));
      }, durationSecs * 1000);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [autoAdvance, currentIndex, items]);

  // Song counter
  const songNumber = (() => {
    let count = 0;
    for (let i = 0; i <= currentIndex && i < items.length; i++) {
      const item = items[i];
      if (item.type === 'SONG' || (!item.type && item.song)) count++;
    }
    return count;
  })();
  const totalSongs = items.filter(i => i.type === 'SONG' || (!i.type && i.song)).length;

  const currentItem = items[currentIndex];
  const isBreak = currentItem?.type === 'SET_BREAK';
  const isMC = currentItem?.type === 'MC';
  const song = currentItem?.song;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#111',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        color: '#fff',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Top bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 24px',
        flexShrink: 0,
      }}>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
          {setlistName}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => setAutoAdvance(prev => !prev)}
            style={{
              background: autoAdvance ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.15)',
              border: 'none',
              color: autoAdvance ? '#10b981' : 'rgba(255,255,255,0.6)',
              padding: '6px 14px',
              borderRadius: 16,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 1,
              cursor: 'pointer',
            }}
            title={autoAdvance ? 'Disable auto-advance' : 'Enable auto-advance'}
          >
            {autoAdvance ? 'AUTO ON' : 'AUTO'}
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              color: '#fff',
              width: 36,
              height: 36,
              borderRadius: 18,
              fontSize: 18,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Close live mode (ESC)"
          >
            &times;
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: isBreak || isMC ? 'center' : 'flex-start', overflow: 'hidden', padding: '0 24px' }}>
        {isBreak ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, color: 'rgba(255,255,255,0.3)', marginBottom: 16 }}>&#9835;</div>
            <div style={{ fontSize: 32, fontWeight: 700 }}>{currentItem.label || 'Break'}</div>
            {currentItem.duration ? (
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 18, marginTop: 8 }}>{formatDuration(currentItem.duration)}</div>
            ) : null}
          </div>
        ) : isMC ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>&#127908;</div>
            <div style={{ fontSize: 32, fontWeight: 700 }}>{currentItem.label || 'MC'}</div>
            {currentItem.duration ? (
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 18, marginTop: 8 }}>{formatDuration(currentItem.duration)}</div>
            ) : null}
          </div>
        ) : (
          <>
            {/* Song info */}
            <div style={{ textAlign: 'center', marginBottom: 24, flexShrink: 0, paddingTop: 16 }}>
              <h1 style={{ fontSize: 36, fontWeight: 800, margin: 0, lineHeight: 1.2 }}>{song?.title || 'Unknown'}</h1>
              {song?.artist && (
                <div style={{ fontSize: 22, color: '#9ca3af', marginTop: 6 }}>{song.artist}</div>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
                {song?.key && (
                  <span style={{ padding: '5px 14px', borderRadius: 8, backgroundColor: 'rgba(192,132,252,0.2)', color: '#c084fc', fontWeight: 600, fontSize: 15 }}>{song.key}</span>
                )}
                {song?.bpm && (
                  <span style={{ padding: '5px 14px', borderRadius: 8, backgroundColor: 'rgba(96,165,250,0.2)', color: '#60a5fa', fontWeight: 600, fontSize: 15 }}>{song.bpm} BPM</span>
                )}
                {song?.duration && (
                  <span style={{ padding: '5px 14px', borderRadius: 8, backgroundColor: 'rgba(156,163,175,0.2)', color: '#9ca3af', fontWeight: 600, fontSize: 15 }}>{formatDuration(song.duration)}</span>
                )}
              </div>
            </div>

            {/* Lyrics */}
            {song?.lyrics ? (
              <div style={{ flex: 1, overflow: 'auto', width: '100%', maxWidth: 700 }}>
                <pre style={{
                  fontFamily: '"SF Mono", "Fira Code", "Fira Mono", Menlo, Consolas, monospace',
                  fontSize: 15,
                  lineHeight: 1.6,
                  color: 'rgba(255,255,255,0.85)',
                  whiteSpace: 'pre-wrap',
                  wordWrap: 'break-word',
                  margin: 0,
                  paddingBottom: 40,
                }}>
                  {song.lyrics}
                </pre>
              </div>
            ) : (
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 16 }}>No lyrics available</div>
            )}
          </>
        )}
      </div>

      {/* Bottom bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 24px',
        flexShrink: 0,
      }}>
        <button
          onClick={() => setCurrentIndex(prev => Math.max(prev - 1, 0))}
          disabled={currentIndex === 0}
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: 'none',
            color: currentIndex === 0 ? 'rgba(255,255,255,0.2)' : '#fff',
            padding: '8px 20px',
            borderRadius: 8,
            fontSize: 16,
            cursor: currentIndex === 0 ? 'default' : 'pointer',
          }}
        >
          &#8592; Prev
        </button>
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: 600 }}>
          {isBreak ? 'Break' : isMC ? 'MC' : `Song ${songNumber} of ${totalSongs}`}
        </span>
        <button
          onClick={() => setCurrentIndex(prev => Math.min(prev + 1, items.length - 1))}
          disabled={currentIndex === items.length - 1}
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: 'none',
            color: currentIndex === items.length - 1 ? 'rgba(255,255,255,0.2)' : '#fff',
            padding: '8px 20px',
            borderRadius: 8,
            fontSize: 16,
            cursor: currentIndex === items.length - 1 ? 'default' : 'pointer',
          }}
        >
          Next &#8594;
        </button>
      </div>
    </div>
  );
}

export default LiveMode;
