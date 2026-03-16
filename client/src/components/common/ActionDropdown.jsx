import { useState } from 'react';

/**
 * Reusable mobile action dropdown (three-dot menu).
 * Shows on small screens only (sm:hidden).
 *
 * @param {Array<{label: string, icon?: string, onClick: Function, danger?: boolean}>} actions
 */
function ActionDropdown({ actions }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative sm:hidden ml-2">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] text-lg"
        aria-label="More actions"
      >
        ...
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <div className="absolute right-0 top-full mt-1 bg-[var(--color-bg-secondary)] rounded-lg shadow-xl border border-[var(--color-border)] py-1 z-50 min-w-[140px]">
            {actions.map((action, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); setOpen(false); action.onClick(); }}
                className={`w-full px-4 py-2 text-left text-sm hover:bg-[var(--color-bg-tertiary)] ${
                  action.danger
                    ? 'text-red-400 hover:text-red-300'
                    : action.className || 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {action.icon && <>{action.icon} </>}{action.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default ActionDropdown;
