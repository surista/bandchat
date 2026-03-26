import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * Reusable modal base component with portal, ARIA, focus trapping, and ESC/backdrop close.
 */
function Modal({ isOpen, onClose, title, maxWidth = 'max-w-md', children, className = '', ariaLabelledBy }) {
  const titleId = useId();
  const modalRef = useRef(null);

  // Focus first focusable element on open
  useEffect(() => {
    if (!isOpen || !modalRef.current) return;
    const focusable = modalRef.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length > 0) focusable[0].focus();
  }, [isOpen]);

  // ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Focus trapping
  useEffect(() => {
    if (!isOpen || !modalRef.current) return;
    const handleTab = (e) => {
      if (e.key !== 'Tab') return;
      const focusable = modalRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
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
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={ariaLabelledBy || titleId}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div ref={modalRef} className={`modal-content ${maxWidth} ${className}`}>
        {title && (
          <div className="modal-header">
            <h3 id={titleId}>{title}</h3>
            <button
              onClick={onClose}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] text-2xl leading-none"
              aria-label="Close"
            >
              &times;
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body
  );
}

export default Modal;
