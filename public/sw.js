/**
 * Service Worker for CR Chauffeur PWA
 * Minimal offline caching worker for Next.js static assets.
 * Does NOT use workbox/next-pwa (incompatible with Turbopack).
 *
 * Strategy:
 *   - Cache-first for static assets (/_next/static/**)
 *   - Network-first for API routes and pages (fallback to cache if offline)
 */

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `cr-chauffeur-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `cr-chauffeur-runtime-${CACHE_VERSION}`;

const PRECACHE_URLS = [
    '/',
    '/manifest.json',
    '/crf-logo.svg',
];

// --- Install: pre-cache critical shell assets ---
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
    );
    self.skipWaiting();
});

// --- Activate: clean up old caches ---
self.addEventListener('activate', (event) => {
    const keepCaches = [STATIC_CACHE, RUNTIME_CACHE];
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter((key) => !keepCaches.includes(key)).map((key) => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

// --- Fetch: routing strategy ---
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET and cross-origin requests (e.g. OneSignal SDK, Google APIs)
    if (request.method !== 'GET' || url.origin !== self.location.origin) return;

    // API routes: network-first, don't cache
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(request).catch(() => new Response('{"error":"Offline"}', {
                status: 503,
                headers: { 'Content-Type': 'application/json' }
            }))
        );
        return;
    }

    // Next.js static assets: cache-first
    if (url.pathname.startsWith('/_next/static/')) {
        event.respondWith(
            caches.match(request).then((cached) => {
                if (cached) return cached;
                return fetch(request).then((response) => {
                    const clone = response.clone();
                    caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
                    return response;
                });
            })
        );
        return;
    }

    // Pages: network-first, fall back to cache
    event.respondWith(
        fetch(request)
            .then((response) => {
                const clone = response.clone();
                caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
                return response;
            })
            .catch(() => caches.match(request).then((cached) => cached || fetch(request)))
    );
});
