/* global __APP_VERSION__ */

import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { storage } from '../../services/storage';
import { RELEASE_NOTES, getUnseenNotes } from '../../data/releaseNotes';
import Modal from './Modal';

/**
 * Two modes:
 *
 * `mode='auto'` (default) — opens itself on mount if the bundled version is
 * newer than the last version this device has seen. Stamps the new version
 * to storage on dismiss so it doesn't re-open until the next update. Brand
 * new installs (no stored version yet) are silently stamped and *not*
 * shown a dialog — onboarding takes priority.
 *
 * `mode='manual'` — controlled by `isOpen` + `onClose`. Shows ALL notes
 * regardless of last-seen, for the Settings → About BandChat entry.
 */

const STORAGE_KEY = 'bandchat-last-seen-version';

const KIND_LABEL = {
  added: 'New',
  fixed: 'Fixed',
  changed: 'Changed',
  security: 'Security',
};

// Class strings rather than a function because Tailwind's JIT can't see
// computed class names — it has to see every literal class string at build.
const KIND_CLASS = {
  added: 'bg-green-500/15 text-green-300 border-green-500/30',
  fixed: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  changed: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  security: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
};

export default function WhatsNewModal({ mode = 'auto', isOpen: openProp, onClose: onCloseProp }) {
  const { isAuthenticated, loading } = useAuth();
  const [autoOpen, setAutoOpen] = useState(false);
  const [autoNotes, setAutoNotes] = useState([]);

  useEffect(() => {
    if (mode !== 'auto') return;
    if (loading || !isAuthenticated) return;
    const lastSeen = storage.getString(STORAGE_KEY);
    let effectiveLastSeen = lastSeen;
    if (!lastSeen) {
      // No stamp on this device. Two distinct cases hide behind that:
      //   (a) brand-new install — onboarding is enough, no dialog
      //   (b) existing user upgrading to the version that introduced this
      //       feature — should see release notes
      // Heuristic: any prior session writes `bandchat-theme` via ThemeContext
      // (web ThemeContext has done this since before this feature shipped),
      // so its presence is a reliable "existing user" signal. There's a tiny
      // race for fresh installs where ThemeContext's effect fires first and
      // sets the key — worst case is one harmless dialog on first launch.
      const isExistingUser = !!storage.getString('bandchat-theme');
      storage.setString(STORAGE_KEY, __APP_VERSION__);
      if (!isExistingUser) return;
      // Show everything we know about by pretending lastSeen is before 1.0.
      effectiveLastSeen = '0.00.00';
    }
    const unseen = getUnseenNotes(effectiveLastSeen, __APP_VERSION__);
    if (unseen.length > 0) {
      setAutoNotes(unseen);
      setAutoOpen(true);
    }
  }, [mode, isAuthenticated, loading]);

  const isOpen = mode === 'auto' ? autoOpen : !!openProp;
  const notes = mode === 'auto' ? autoNotes : RELEASE_NOTES;

  const handleClose = () => {
    if (mode === 'auto') {
      storage.setString(STORAGE_KEY, __APP_VERSION__);
      setAutoOpen(false);
    } else {
      onCloseProp?.();
    }
  };

  if (!isOpen) return null;

  const title = mode === 'auto' ? `What's new in v${__APP_VERSION__}` : 'About BandChat';

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title} maxWidth="max-w-lg">
      <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-1">
        {mode === 'manual' && (
          <p className="text-sm text-[var(--color-text-muted)]">
            You&apos;re running BandChat{' '}
            <span className="font-medium text-[var(--color-text-primary)]">v{__APP_VERSION__}</span>.
            Recent updates:
          </p>
        )}

        {notes.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">No release notes available yet.</p>
        ) : (
          notes.map((release) => (
            <section key={release.version}>
              <header className="flex items-baseline gap-2 mb-2">
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  v{release.version}
                </h3>
                <span className="text-xs text-[var(--color-text-muted)]">{release.date}</span>
              </header>
              <ul className="space-y-2">
                {release.items.map((item, i) => (
                  <li key={i} className="flex gap-2 items-start">
                    <span
                      className={`shrink-0 mt-0.5 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${KIND_CLASS[item.kind] || KIND_CLASS.changed}`}
                    >
                      {KIND_LABEL[item.kind] || item.kind}
                    </span>
                    <span className="text-sm text-[var(--color-text-primary)] leading-snug">
                      {item.text}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={handleClose}
          className="px-4 py-2 rounded bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90"
        >
          Got it
        </button>
      </div>
    </Modal>
  );
}
