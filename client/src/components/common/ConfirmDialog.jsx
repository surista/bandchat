import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * Styled confirmation dialog to replace browser's native confirm()
 *
 * Usage:
 * <ConfirmDialog
 *   isOpen={showConfirm}
 *   title="Delete Message"
 *   message="Are you sure you want to delete this message?"
 *   confirmText="Delete"
 *   confirmVariant="danger"
 *   onConfirm={() => { handleDelete(); setShowConfirm(false); }}
 *   onCancel={() => setShowConfirm(false)}
 * />
 */
function ConfirmDialog({
  isOpen,
  title = 'Confirm',
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmVariant = 'primary', // 'primary' | 'danger'
  onConfirm,
  onCancel,
  loading = false
}) {
  const confirmButtonRef = useRef(null);
  const cancelButtonRef = useRef(null);

  // Focus cancel button for danger dialogs, confirm button otherwise
  useEffect(() => {
    if (!isOpen) return;
    const target = confirmVariant === 'danger' ? cancelButtonRef.current : confirmButtonRef.current;
    if (target) target.focus();
  }, [isOpen, confirmVariant]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onCancel?.();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  // Trap focus within dialog
  useEffect(() => {
    if (!isOpen) return;

    const handleTab = (e) => {
      if (e.key !== 'Tab') return;

      const focusableElements = [cancelButtonRef.current, confirmButtonRef.current].filter(Boolean);
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleTab);
    return () => document.removeEventListener('keydown', handleTab);
  }, [isOpen]);

  if (!isOpen) return null;

  const confirmButtonClass = confirmVariant === 'danger'
    ? 'btn bg-red-600 hover:bg-red-700 text-white'
    : 'btn bg-green-600 hover:bg-green-700 text-white';

  return createPortal(
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-description"
      onClick={(e) => {
        // Close on backdrop click
        if (e.target === e.currentTarget) {
          onCancel?.();
        }
      }}
    >
      <div className="modal-content max-w-sm">
        <div className="p-6">
          <h3
            id="confirm-dialog-title"
            className="text-lg font-bold text-[var(--color-text-primary)] mb-2"
          >
            {title}
          </h3>
          <p
            id="confirm-dialog-description"
            className="text-[var(--color-text-secondary)] mb-6"
          >
            {message}
          </p>
          <div className="flex gap-3 justify-end">
            <button
              ref={cancelButtonRef}
              onClick={onCancel}
              disabled={loading}
              className="btn btn-secondary min-h-[44px] px-4"
            >
              {cancelText}
            </button>
            <button
              ref={confirmButtonRef}
              onClick={onConfirm}
              disabled={loading}
              className={`${confirmButtonClass} min-h-[44px] px-4`}
            >
              {loading ? 'Loading...' : confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default ConfirmDialog;
