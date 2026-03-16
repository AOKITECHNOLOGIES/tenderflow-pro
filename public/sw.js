// ============================================================================
// TenderFlow Pro — Service Worker
// Handles: App Shell caching, offline draft saving, install prompt
// ============================================================================

const CACHE_NAME = 'tenderflow-v4';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/js/supabase-client.js',
  '/js/auth.js',
  '/js/router.js',
  '/js/app-shell.js',
  '/js/compiler.js',
  '/js/wiring.js',
  '/js/notifications.js',
  '/js/company-settings.js',
  '/js/reports.js',
  '/js/user-import.js',
  '/js/batch2-wiring.js',
];

// ── INSTALL: Cache app shell ────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching app shell');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// ── ACTIVATE: Clean old caches ──────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── FETCH: Network-first for API, cache-first for static ───────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and Supabase API calls
  if (request.method !== 'GET') return;
  if (url.hostname.includes('supabase.co')) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((response) => {
          // Cache successful responses for static assets
          if (response.ok && url.origin === self.location.origin) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached); // Fallback to cache if offline

      return cached || fetchPromise;
    })
  );
});

// ── MESSAGE: Handle draft sync from main thread ─────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SYNC_DRAFTS') {
    console.log('[SW] Draft sync requested');
    self.clients.matchAll().then((clients) => {
      clients.forEach((client) => {
        client.postMessage({ type: 'TRIGGER_DRAFT_SYNC' });
      });
    });
  }
});271114
