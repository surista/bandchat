import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';

const ToastContext = createContext(null);

let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const removeToast = useCallback((id) => {
    // Mark as exiting for animation
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      const timer = timersRef.current.get(id);
      if (timer) {
        clearTimeout(timer);
        timersRef.current.delete(id);
      }
    }, 200);
  }, []);

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, message, type, exiting: false }]);

    if (duration > 0) {
      const timer = setTimeout(() => removeToast(id), duration);
      timersRef.current.set(id, timer);
    }

    return id;
  }, [removeToast]);

  const toast = useCallback((message) => addToast(message, 'info'), [addToast]);
  toast.success = useCallback((message) => addToast(message, 'success'), [addToast]);
  toast.error = useCallback((message, duration = 6000) => addToast(message, 'error', duration), [addToast]);
  toast.warning = useCallback((message) => addToast(message, 'warning'), [addToast]);
  toast.info = useCallback((message) => addToast(message, 'info'), [addToast]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {createPortal(
        <div className="toast-container" aria-live="polite">
          {toasts.map(t => (
            <div
              key={t.id}
              className={`toast toast--${t.type}${t.exiting ? ' toast--exit' : ''}`}
              role="status"
            >
              <span className="toast-icon">
                {t.type === 'success' && '✓'}
                {t.type === 'error' && '✕'}
                {t.type === 'warning' && '!'}
                {t.type === 'info' && 'ℹ'}
              </span>
              <span className="toast-message">{t.message}</span>
              <button
                className="toast-close"
                onClick={() => removeToast(t.id)}
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
