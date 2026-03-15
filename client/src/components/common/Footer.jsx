import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

function Footer({ theme = 'dark' }) {
  const [showAbout, setShowAbout] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);

  // ESC key to close modals
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        if (showAbout) setShowAbout(false);
        if (showWhatsNew) setShowWhatsNew(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [showAbout, showWhatsNew]);

  const textColor = theme === 'dark' ? 'text-gray-400' : 'text-gray-500';
  const hoverColor = theme === 'dark' ? 'hover:text-gray-200' : 'hover:text-gray-700';

  return (
    <>
      <footer className={`py-4 px-6 ${textColor}`}>
        <div className="max-w-4xl mx-auto flex flex-col items-center gap-2 text-sm">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 w-full">
            <div className="flex items-center gap-1">
              <span>BandChat v{__APP_VERSION__}</span>
              <span className="hidden sm:inline">·</span>
              <span className="hidden sm:inline">© {new Date().getFullYear()}</span>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowAbout(true)}
                className={`${hoverColor} transition-colors`}
              >
                About
              </button>
              <button
                onClick={() => setShowWhatsNew(true)}
                className={`${hoverColor} transition-colors`}
              >
                What's New
              </button>
              <Link
                to="/privacy"
                className={`${hoverColor} transition-colors`}
              >
                Privacy
              </Link>
              <Link
                to="/terms"
                className={`${hoverColor} transition-colors`}
              >
                Terms
              </Link>
              <Link
                to="/support"
                className={`${hoverColor} transition-colors`}
              >
                Support
              </Link>
              <a
                href="mailto:admin@bandchat.app?subject=BandChat Feedback"
                className={`${hoverColor} transition-colors`}
              >
                Feedback
              </a>
            </div>
          </div>
          <div className="text-xs opacity-75">
            Song metadata powered by{' '}
            <a
              href="https://getsongbpm.com"
              target="_blank"
              rel="noopener"
              className={`${hoverColor} underline`}
            >
              GetSongBPM.com
            </a>
          </div>
        </div>
      </footer>

      {/* About Modal */}
      {showAbout && (
        <div className="modal-backdrop">
          <div className="modal-content max-w-2xl max-h-modal overflow-y-auto">
            <div className="modal-header">
              <h3>About BandChat</h3>
              <button
                onClick={() => setShowAbout(false)}
                className="text-gray-400 hover:text-white text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            <div className="modal-body space-y-6">
              <div className="text-center py-4">
                <img
                  src="/bc_icon_06.png"
                  alt="BandChat"
                  className="w-20 h-20 mx-auto mb-3 rounded-xl shadow-lg"
                />
                <h3 className="text-xl font-bold text-white">BandChat</h3>
                <p className="text-gray-400">v{__APP_VERSION__}</p>
              </div>

              <div className="bg-[var(--color-modal-card)] rounded-lg p-4">
                <p className="text-gray-300 text-sm leading-relaxed">
                  BandChat is a communication and organization app built specifically for bands.
                  Chat with your bandmates, manage your song library, create setlists, and track your gigs - all in one place.
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium text-white">Features</h4>
                <ul className="text-sm text-gray-300 space-y-2">
                  <li className="flex items-center gap-2">
                    <span className="text-[var(--color-primary)]">✓</span>
                    Real-time messaging with threads and reactions
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-[var(--color-primary)]">✓</span>
                    Song database with BPM, key, and duration
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-[var(--color-primary)]">✓</span>
                    Drag-and-drop setlist builder
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-[var(--color-primary)]">✓</span>
                    Gig calendar and statistics
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-[var(--color-primary)]">✓</span>
                    File sharing and image uploads
                  </li>
                </ul>
              </div>

              <div className="border-t border-[var(--color-modal-border)] pt-4">
                <h4 className="font-medium text-white mb-2">Credits</h4>
                <p className="text-sm text-gray-400">
                  Song metadata (BPM, key) provided by{' '}
                  <a
                    href="https://getsongbpm.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--color-primary)] hover:underline"
                  >
                    GetSongBPM.com
                  </a>
                </p>
              </div>

              <div className="text-center text-xs text-gray-500 pt-4">
                Made with ♥ for musicians everywhere
              </div>
            </div>
          </div>
        </div>
      )}

      {/* What's New Modal */}
      {showWhatsNew && (
        <div className="modal-backdrop">
          <div className="modal-content max-w-2xl max-h-modal overflow-y-auto">
            <div className="modal-header">
              <h3>What's New</h3>
              <button
                onClick={() => setShowWhatsNew(false)}
                className="text-gray-400 hover:text-white text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            <div className="modal-body space-y-4">
              <div className="border-b border-[var(--color-modal-border)] pb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs bg-green-600/20 text-green-400 px-2 py-0.5 rounded">NEW</span>
                  <span className="text-sm text-gray-500">v1.05.05</span>
                </div>
                <h4 className="font-medium text-white mb-1">All Messages, Pin Setlists & Stage Plot Upgrades</h4>
                <p className="text-sm text-gray-400">
                  All Messages feed — see messages across all channels in one unified view. Pin setlists to channels for quick reference. Calendar now splits into Upcoming (soonest first) and Past sections. Stage plot icons now use real instrument images with resize, flip, and rotate controls. Gig notes shown on hover in Quick Links. New blue flame app icon everywhere.
                </p>
              </div>
              <div className="border-b border-[var(--color-modal-border)] pb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-gray-500">v1.05.01</span>
                </div>
                <h4 className="font-medium text-white mb-1">Code Review & Security Fixes</h4>
                <p className="text-sm text-gray-400">
                  Comprehensive code review with 40+ fixes: HTML injection prevention in emails, push notification toggle fix, graceful shutdown improvements, creator-or-admin authorization checks, input validation on songs/gigs/medleys, fetch timeouts on external APIs, and dark theme UI for auth pages and landing page.
                </p>
              </div>
              <div className="border-b border-[var(--color-modal-border)] pb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-gray-500">v1.05.00</span>
                </div>
                <h4 className="font-medium text-white mb-1">App Links, Play Store & New Icon</h4>
                <p className="text-sm text-gray-400">
                  Android App Links and iOS Universal Links for direct app opening. New blue flame app icon. Google Play Store setup with RevenueCat subscriptions. Invite link fixes and deep link improvements.
                </p>
              </div>
              <div className="border-b border-[var(--color-modal-border)] pb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-gray-500">v1.04.95</span>
                </div>
                <h4 className="font-medium text-white mb-1">Stage Plots, Link Preview Dismiss & iPad</h4>
                <p className="text-sm text-gray-400">
                  SVG stage plot editor with 20+ equipment icons and PDF export. Dismiss link previews from your messages. Swipe to react on mobile. Workspace backup/restore. iPad optimization across all 41 screens. Code review with security hardening.
                </p>
              </div>
              <div className="border-b border-[var(--color-modal-border)] pb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-gray-500">v1.04.40</span>
                </div>
                <h4 className="font-medium text-white mb-1">Security Hardening</h4>
                <p className="text-sm text-gray-400">
                  Comprehensive security audit with 43 fixes: authorization checks on all delete/update operations, URL injection prevention, Socket.IO hardening, password complexity requirements, refresh token rotation, input length limits, and sanitized error messages.
                </p>
              </div>
              <div className="border-b border-[var(--color-modal-border)] pb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-gray-500">v1.04.39</span>
                </div>
                <h4 className="font-medium text-white mb-1">Performance & Bookmarks</h4>
                <p className="text-sm text-gray-400">
                  Message bookmarks — save messages privately and find them in "Saved Messages". Image thumbnails for faster loading. API response caching, lazy-loaded routes, and message virtualization for smoother performance. Mobile: swipe right to reply, left to quick-react, plus app icon quick actions.
                </p>
              </div>
              <div className="border-b border-[var(--color-modal-border)] pb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-gray-500">v1.04.39</span>
                </div>
                <h4 className="font-medium text-white mb-1">Upcoming Event Banner & Calendar Shortcut</h4>
                <p className="text-sm text-gray-400">
                  Your next gig or rehearsal is now always visible at the top of the sidebar. Color-coded banner with quick access to the Calendar on both web and mobile.
                </p>
              </div>
              <div className="border-b border-[var(--color-modal-border)] pb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-gray-500">v1.04.37</span>
                </div>
                <h4 className="font-medium text-white mb-1">Calendar Improvements</h4>
                <p className="text-sm text-gray-400">
                  Sort calendar events newest-first by default with a toggle to switch order. Tap band members to view profiles, badges, and stats on mobile.
                </p>
              </div>
              <div className="border-b border-[var(--color-modal-border)] pb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-gray-500">v1.04.33</span>
                </div>
                <h4 className="font-medium text-white mb-1">Security & Admin Fixes</h4>
                <p className="text-sm text-gray-400">
                  CSP hardening, input validation, currency precision with Decimal types, admin auto-elevation, and mobile admin feature parity (gig locking, channel sections, workspace defaults).
                </p>
              </div>
              <div className="border-b border-[var(--color-modal-border)] pb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-gray-500">v1.04.27</span>
                </div>
                <h4 className="font-medium text-white mb-1">Quality & Polish</h4>
                <p className="text-sm text-gray-400">
                  Per-workspace currency support, typing indicator timeouts, admin role guards, message density settings, and dozens of bug fixes across web and mobile.
                </p>
              </div>
              <div className="border-b border-[var(--color-modal-border)] pb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-gray-500">v1.04.11</span>
                </div>
                <h4 className="font-medium text-white mb-1">App Store Launch</h4>
                <p className="text-sm text-gray-400">
                  BandChat is now on iOS! Content moderation, account deletion, terms agreement, and App Store compliance.
                </p>
              </div>
              <div className="border-b border-[var(--color-modal-border)] pb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-gray-500">v1.04.05</span>
                </div>
                <h4 className="font-medium text-white mb-1">Backups & Admin Tools</h4>
                <p className="text-sm text-gray-400">
                  Automated R2 backups with alerting, admin database restore, workspace import, and band kitty enhancements.
                </p>
              </div>
              <div className="border-b border-[var(--color-modal-border)] pb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-gray-500">v1.04.00</span>
                </div>
                <h4 className="font-medium text-white mb-1">Session & Stability</h4>
                <p className="text-sm text-gray-400">
                  Fixed session expiry with secure cookie auth, resilient token refresh, gig archive linking, and empty state improvements.
                </p>
              </div>
              <div className="border-b border-[var(--color-modal-border)] pb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-gray-500">v1.03.81</span>
                </div>
                <h4 className="font-medium text-white mb-1">Practice Dashboard</h4>
                <p className="text-sm text-gray-400">
                  Track your practice streaks and history on the web, push notification deep-linking, and improved empty states across all list views.
                </p>
              </div>
              <div className="border-b border-[var(--color-modal-border)] pb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-gray-500">v1.03.52</span>
                </div>
                <h4 className="font-medium text-white mb-1">Mobile App & Security</h4>
                <p className="text-sm text-gray-400">
                  Content reporting and user blocking on mobile, new app icon, and security hardening with rate-limited verification endpoints.
                </p>
              </div>
              <div className="border-b border-[var(--color-modal-border)] pb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-gray-500">v1.03.48</span>
                </div>
                <h4 className="font-medium text-white mb-1">Onboarding & Slack Import</h4>
                <p className="text-sm text-gray-400">
                  5-step workspace setup wizard with channel suggestions and email invites. Import your entire Slack workspace — channels, messages, and history.
                </p>
              </div>
              <div className="border-b border-[var(--color-modal-border)] pb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-gray-500">v1.03.40</span>
                </div>
                <h4 className="font-medium text-white mb-1">Account Management</h4>
                <p className="text-sm text-gray-400">
                  Delete your account, export your personal data, and export full workspace data as JSON.
                </p>
              </div>
              <div className="border-b border-[var(--color-modal-border)] pb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-gray-500">v1.02</span>
                </div>
                <h4 className="font-medium text-white mb-1">Band Kitty</h4>
                <p className="text-sm text-gray-400">
                  Track shared band finances with expenses, contributions, and balance tracking for each member.
                </p>
              </div>
              <div className="pb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-gray-500">v1.01</span>
                </div>
                <h4 className="font-medium text-white mb-1">Bulk Song Import & Band Features</h4>
                <p className="text-sm text-gray-400">
                  Import multiple songs with automatic metadata, 20+ themes, MC sections in setlists, and full band management tools.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Footer;
