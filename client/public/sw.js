// Service Worker for BandChat PWA
// Version is injected at build time, fallback for dev
const APP_VERSION = '__APP_VERSION__';
const CACHE_NAME = `bandchat-${APP_VERSION}`;
const API_CACHE_NAME = 'bandchat-api-cache';

// API endpoints to cache for offline support (stale-while-revalidate)
// NOTE: messages are NOT cached here — they must always be fresh
const CACHEABLE_API_PATTERNS = [
  /\/api\/songs\/workspace\/[^/]+$/,
  /\/api\/channels\/workspace\/[^/]+$/,
];

// Assets to precache (minimal - we use network-first for most things)
const PRECACHE_ASSETS = [
  '/favicon.svg',
  '/index.html'
];

// Install event - precache minimal assets
self.addEventListener('install', (event) => {
  console.log(`[SW] Installing version ${APP_VERSION}`);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log(`[SW] Activating version ${APP_VERSION}`);
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name.startsWith('bandchat-') && name !== CACHE_NAME && name !== API_CACHE_NAME)
            .map(name => {
              console.log(`[SW] Deleting old cache: ${name}`);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        // Take control of all clients immediately
        return clients.claim();
      })
      .then(() => {
        // Notify all clients about the update
        return clients.matchAll({ type: 'window' }).then(clients => {
          clients.forEach(client => {
            client.postMessage({ type: 'SW_UPDATED', version: APP_VERSION });
          });
        });
      })
  );
});

// Fetch event - network-first for HTML/JS/CSS, cache-first for images
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Handle cacheable API requests (stale-while-revalidate)
  if (url.pathname.startsWith('/api') && CACHEABLE_API_PATTERNS.some(p => p.test(url.pathname))) {
    event.respondWith(
      caches.open(API_CACHE_NAME).then(cache =>
        cache.match(event.request).then(cached => {
          const fetchPromise = fetch(event.request)
            .then(async response => {
              if (response.ok) {
                await cache.put(event.request, response.clone());
                // Evict oldest entries if cache exceeds limit
                const entries = await cache.keys();
                if (entries.length > 50) {
                  const entriesToRemove = entries.slice(0, entries.length - 50);
                  await Promise.all(entriesToRemove.map(entry => cache.delete(entry)));
                }
              }
              return response;
            })
            .catch(() => {
              // Offline: return cached response
              if (cached) return cached;
              return new Response(JSON.stringify({ error: 'Offline' }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' }
              });
            });

          // Return cached immediately if available, but revalidate in background
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // Skip other API requests and external URLs
  if (url.pathname.startsWith('/api') || url.origin !== self.location.origin) return;

  // For navigation requests (HTML pages) - always network first
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // For JS/CSS - network first with cache fallback
  if (url.pathname.match(/\.(js|css)$/)) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache the new version
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // For images/fonts - cache first with network fallback
  if (url.pathname.match(/\.(png|jpg|jpeg|gif|svg|woff|woff2|ttf)$/)) {
    event.respondWith(
      caches.match(event.request)
        .then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
            return response;
          });
        })
    );
    return;
  }
});

// Message handler for manual update checks
self.addEventListener('message', (event) => {
  if (event.data === 'CHECK_UPDATE') {
    event.source.postMessage({ type: 'SW_VERSION', version: APP_VERSION });
  }
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'SET_BADGE') {
    if ('setAppBadge' in self.navigator) {
      const count = event.data.count || 0;
      if (count > 0) {
        self.navigator.setAppBadge(count).catch(() => {});
      } else {
        self.navigator.clearAppBadge().catch(() => {});
      }
    }
  }
  if (event.data && event.data.type === 'LOGOUT') {
    caches.delete(API_CACHE_NAME).then(() => {
      console.log('API cache cleared on logout');
    });
  }
});

// Push notification event
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();

  const options = {
    body: data.body,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/',
      channelId: data.channelId,
      workspaceId: data.workspaceId
    },
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'close', title: 'Dismiss' }
    ],
    tag: data.tag || 'bandchat-notification',
    renotify: true
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'BandChat', options)
      .then(() => {
        // Update app badge on push so home screen icon reflects unread state
        if ('setAppBadge' in self.navigator) {
          const badgeCount = data.badgeCount || 1;
          return self.navigator.setAppBadge(badgeCount).catch(() => {});
        }
      })
  );
});

// Message from client — dismiss notifications for a specific channel
self.addEventListener('message', (event) => {
  if (event.data?.type === 'DISMISS_CHANNEL_NOTIFICATIONS' && event.data.channelId) {
    self.registration.getNotifications().then((notifications) => {
      notifications.forEach((notification) => {
        if (notification.data?.channelId === event.data.channelId) {
          notification.close();
        }
      });
    });
  }
  if (event.data?.type === 'CLEAR_BADGE' && 'clearAppBadge' in self.navigator) {
    self.navigator.clearAppBadge().catch(() => {});
  }
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') return;

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // If app is already open, focus it
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        // Otherwise open new window
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});
