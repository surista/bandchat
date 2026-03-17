import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

export function LyricsModal({ lyrics, songTitle, duration, onClose }) {
  const [fontSize, setFontSize] = useState(18);
  const [autoScrolling, setAutoScrolling] = useState(false);
  const scrollRef = useRef(null);
  const scrollIntervalRef = useRef(null);
  const modalRef = useRef(null);

  const MIN_FONT = 12;
  const MAX_FONT = 32;

  // ESC to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Focus trap
  useEffect(() => {
    if (!modalRef.current) return;
    const focusable = modalRef.current.querySelectorAll('button');
    if (focusable.length > 0) focusable[0].focus();

    const handleTab = (e) => {
      if (e.key !== 'Tab') return;
      const items = modalRef.current.querySelectorAll('button');
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleTab);
    return () => document.removeEventListener('keydown', handleTab);
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }

    if (!autoScrolling || !scrollRef.current) return;

    const el = scrollRef.current;
    const scrollableDistance = el.scrollHeight - el.clientHeight;
    if (scrollableDistance <= 0) return;

    const totalDuration = duration || 120;
    const pixelsPerSecond = scrollableDistance / totalDuration;
    const intervalMs = 50;
    const pixelsPerInterval = pixelsPerSecond * (intervalMs / 1000);

    scrollIntervalRef.current = setInterval(() => {
      el.scrollTop += pixelsPerInterval;
      if (el.scrollTop >= scrollableDistance) {
        setAutoScrolling(false);
      }
    }, intervalMs);

    // Pause on manual scroll
    const handleWheel = () => {
      setAutoScrolling(false);
    };
    el.addEventListener('wheel', handleWheel);

    return () => {
      if (scrollIntervalRef.current) clearInterval(scrollIntervalRef.current);
      el.removeEventListener('wheel', handleWheel);
    };
  }, [autoScrolling, duration]);

  return createPortal(
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Lyrics: ${songTitle}`}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.85)',
        zIndex: 10001,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        flexShrink: 0,
      }}>
        <h2 style={{ color: '#fff', margin: 0, fontSize: 20, fontWeight: 700 }}>{songTitle}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setFontSize(prev => Math.max(prev - 2, MIN_FONT))}
            disabled={fontSize <= MIN_FONT}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              color: fontSize <= MIN_FONT ? 'rgba(255,255,255,0.3)' : '#fff',
              width: 36,
              height: 36,
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: fontSize <= MIN_FONT ? 'default' : 'pointer',
            }}
            title="Decrease font size"
            aria-label="Decrease font size"
          >
            A-
          </button>
          <button
            onClick={() => setFontSize(prev => Math.min(prev + 2, MAX_FONT))}
            disabled={fontSize >= MAX_FONT}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              color: fontSize >= MAX_FONT ? 'rgba(255,255,255,0.3)' : '#fff',
              width: 36,
              height: 36,
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: fontSize >= MAX_FONT ? 'default' : 'pointer',
            }}
            title="Increase font size"
            aria-label="Increase font size"
          >
            A+
          </button>
          <button
            onClick={() => setAutoScrolling(prev => !prev)}
            style={{
              background: autoScrolling ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.1)',
              border: 'none',
              color: autoScrolling ? '#10b981' : 'rgba(255,255,255,0.6)',
              padding: '6px 14px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 1,
              cursor: 'pointer',
            }}
            title={autoScrolling ? 'Stop auto-scroll' : 'Start auto-scroll'}
            aria-label={autoScrolling ? 'Stop auto-scroll' : 'Start auto-scroll'}
          >
            {autoScrolling ? 'STOP' : 'SCROLL'}
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
              fontSize: 20,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: 8,
            }}
            title="Close (ESC)"
            aria-label="Close lyrics"
          >
            &times;
          </button>
        </div>
      </div>

      {/* Lyrics */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '24px 32px',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <pre style={{
          fontFamily: '"SF Mono", "Fira Code", "Fira Mono", Menlo, Consolas, monospace',
          fontSize,
          lineHeight: 1.6,
          color: 'rgba(255,255,255,0.9)',
          whiteSpace: 'pre-wrap',
          wordWrap: 'break-word',
          margin: 0,
          maxWidth: 800,
          width: '100%',
        }}>
          {lyrics}
        </pre>
      </div>
    </div>,
    document.body
  );
}

export default LyricsModal;
