import { useState, useEffect } from 'react';

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
              <a
                href="mailto:surista@gmail.com?subject=BandChat Feedback"
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
          <div className="modal-content max-w-2xl max-h-[90vh] overflow-y-auto">
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
                  src="/logo.jpg"
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
          <div className="modal-content max-w-2xl max-h-[90vh] overflow-y-auto">
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
                  <span className="text-sm text-gray-500">v1.01.22</span>
                </div>
                <h4 className="font-medium text-white mb-1">Bulk Song Import with Metadata</h4>
                <p className="text-sm text-gray-400">
                  Import multiple songs at once! Paste a list of songs and we'll automatically fetch BPM, key, and duration.
                </p>
              </div>
              <div className="border-b border-[var(--color-modal-border)] pb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-gray-500">v1.01.20</span>
                </div>
                <h4 className="font-medium text-white mb-1">MC Sections in Setlists</h4>
                <p className="text-sm text-gray-400">
                  Add talking/banter breaks between songs in your setlists with customizable durations.
                </p>
              </div>
              <div className="border-b border-[var(--color-modal-border)] pb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-gray-500">v1.01.18</span>
                </div>
                <h4 className="font-medium text-white mb-1">12 New Themes</h4>
                <p className="text-sm text-gray-400">
                  Customize your sidebar with 12 beautiful color themes including Aubergine, Ocean, Forest, and more.
                </p>
              </div>
              <div className="pb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-gray-500">v1.01.15</span>
                </div>
                <h4 className="font-medium text-white mb-1">Band Features</h4>
                <p className="text-sm text-gray-400">
                  Songs, Setlists, Calendar, and Stats - everything you need to organize your band.
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
