import { useEffect, useRef } from 'react';
import Modal from './Modal';

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
  // (overrides Modal's default first-focusable behavior)
  useEffect(() => {
    if (!isOpen) return;
    // Small delay to run after Modal's own focus effect
    const timer = setTimeout(() => {
      const target = confirmVariant === 'danger' ? cancelButtonRef.current : confirmButtonRef.current;
      if (target) target.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen, confirmVariant]);

  const confirmButtonClass = confirmVariant === 'danger'
    ? 'btn bg-red-600 hover:bg-red-700 text-white'
    : 'btn bg-green-600 hover:bg-green-700 text-white';

  return (
    <Modal isOpen={isOpen} onClose={onCancel} maxWidth="max-w-sm" ariaLabelledBy="confirm-dialog-title">
      <div className="p-6">
        <h3
          id="confirm-dialog-title"
          className="text-lg font-bold text-[var(--color-text-primary)] mb-2"
        >
          {title}
        </h3>
        <p
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
    </Modal>
  );
}

export default ConfirmDialog;
