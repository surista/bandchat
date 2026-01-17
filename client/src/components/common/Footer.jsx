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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-900">About BandChat</h3>
                <button
                  onClick={() => setShowAbout(false)}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  &times;
                </button>
              </div>

              <div className="space-y-6">
                <div className="text-center py-4">
                  <div className="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-purple-600 to-purple-800 rounded-xl flex items-center justify-center">
                    <span className="text-3xl">🎸</span>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">BandChat</h3>
                  <p className="text-gray-500">v{__APP_VERSION__}</p>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-gray-700 text-sm leading-relaxed">
                    BandChat is a communication and organization app built specifically for bands.
                    Chat with your bandmates, manage your song library, create setlists, and track your gigs - all in one place.
                  </p>
                </div>

                <div className="space-y-3">
                  <h4 className="font-medium text-gray-900">Features</h4>
                  <ul className="text-sm text-gray-600 space-y-2">
                    <li className="flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      Real-time messaging with threads and reactions
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      Song database with BPM, key, and duration
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      Drag-and-drop setlist builder
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      Gig calendar and statistics
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      File sharing and image uploads
                    </li>
                  </ul>
                </div>

                <div className="border-t border-gray-200 pt-4">
                  <h4 className="font-medium text-gray-900 mb-2">Credits</h4>
                  <p className="text-sm text-gray-600">
                    Song metadata (BPM, key) provided by{' '}
                    <a
                      href="https://getsongbpm.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-600 hover:text-purple-700 underline"
                    >
                      GetSongBPM.com
                    </a>
                  </p>
                </div>

                <div className="text-center text-xs text-gray-400 pt-4">
                  Made with ♥ for musicians everywhere
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* What's New Modal */}
      {showWhatsNew && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-900">What's New</h3>
                <button
                  onClick={() => setShowWhatsNew(false)}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  &times;
                </button>
              </div>

              <div className="space-y-4">
                <div className="border-b border-gray-200 pb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">NEW</span>
                    <span className="text-sm text-gray-500">v1.01.22</span>
                  </div>
                  <h4 className="font-medium text-gray-900 mb-1">Bulk Song Import with Metadata</h4>
                  <p className="text-sm text-gray-600">
                    Import multiple songs at once! Paste a list of songs and we'll automatically fetch BPM, key, and duration.
                  </p>
                </div>
                <div className="border-b border-gray-200 pb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm text-gray-500">v1.01.20</span>
                  </div>
                  <h4 className="font-medium text-gray-900 mb-1">MC Sections in Setlists</h4>
                  <p className="text-sm text-gray-600">
                    Add talking/banter breaks between songs in your setlists with customizable durations.
                  </p>
                </div>
                <div className="border-b border-gray-200 pb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm text-gray-500">v1.01.18</span>
                  </div>
                  <h4 className="font-medium text-gray-900 mb-1">12 New Themes</h4>
                  <p className="text-sm text-gray-600">
                    Customize your sidebar with 12 beautiful color themes including Aubergine, Ocean, Forest, and more.
                  </p>
                </div>
                <div className="pb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm text-gray-500">v1.01.15</span>
                  </div>
                  <h4 className="font-medium text-gray-900 mb-1">Band Features</h4>
                  <p className="text-sm text-gray-600">
                    Songs, Setlists, Calendar, and Stats - everything you need to organize your band.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Footer;
