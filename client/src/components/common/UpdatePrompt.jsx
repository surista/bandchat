import { useState, useEffect } from 'react';

export default function UpdatePrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [newVersion, setNewVersion] = useState(null);

  useEffect(() => {
    // Listen for service worker update messages
    const handleMessage = (event) => {
      if (event.data?.type === 'SW_UPDATED') {
        console.log('[UpdatePrompt] New version available:', event.data.version);
        setNewVersion(event.data.version);
        setShowPrompt(true);
      }
    };

    navigator.serviceWorker?.addEventListener('message', handleMessage);

    // Also check for waiting service worker on load
    const checkWaiting = async () => {
      const registration = await navigator.serviceWorker?.getRegistration();
      if (registration?.waiting) {
        console.log('[UpdatePrompt] Waiting service worker found');
        setShowPrompt(true);
      }
    };
    checkWaiting();

    // Check for updates periodically (every 5 minutes)
    const interval = setInterval(() => {
      navigator.serviceWorker?.getRegistration().then(reg => {
        reg?.update();
      });
    }, 5 * 60 * 1000);

    return () => {
      navigator.serviceWorker?.removeEventListener('message', handleMessage);
      clearInterval(interval);
    };
  }, []);

  const handleUpdate = () => {
    // Tell waiting service worker to take over
    navigator.serviceWorker?.getRegistration().then(reg => {
      if (reg?.waiting) {
        reg.waiting.postMessage('SKIP_WAITING');
      }
    });
    // Reload the page
    window.location.reload();
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-blue-600 text-white rounded-lg shadow-lg p-4 z-50 animate-slide-up">
      <div className="flex items-start gap-3">
        <span className="text-2xl">🚀</span>
        <div className="flex-1">
          <p className="font-semibold">Update Available!</p>
          <p className="text-sm text-blue-100">
            {newVersion ? `Version ${newVersion} is ready.` : 'A new version is ready.'}
          </p>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={handleUpdate}
          className="flex-1 bg-white text-blue-600 font-semibold py-2 px-4 rounded hover:bg-blue-50"
        >
          Update Now
        </button>
        <button
          onClick={() => setShowPrompt(false)}
          className="px-4 py-2 text-blue-100 hover:text-white"
        >
          Later
        </button>
      </div>
    </div>
  );
}
