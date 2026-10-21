/* SOGDIA service worker
 *  - App shell & static assets: stale-while-revalidate
 *  - API GET requests:          network-first (always fresh online); per-user cached copy only as an offline fallback
 *  - Navigations:               network-first → cached page → /offline.html
 *  - Volatile / privileged endpoints (prices, positions, admin, auth) are never cached.
 */
const VERSION = 'v2'; // bump = old caches are purged on activate
const STATIC_CACHE = `sg-static-${VERSION}`;
const API_CACHE = `sg-api-${VERSION}`;
const PAGE_CACHE = `sg-pages-${VERSION}`;
const OFFLINE_URL = '/offline.html';
const SNAPSHOT_KEY = '/__offline/accounts';

const PRECACHE = [OFFLINE_URL, '/manifest.json', '/icons/icon.svg', '/icons/icon-192.png'];

// Never cache these API paths
const API_DENY = [
  /^\/api\/auth\//,
  /^\/api\/trade\/positions/,
  /^\/api\/market\/prices/,
  /^\/api\/health/,
  /^\/api\/notifications/,
  /^\/api\/admin\//,
  /^\/api\/xdepartment\//,
  /^\/api\/cron\//,
  /^\/api\/webhook\//,
  /^\/api\/og\//,
  /^\/api\/promos\/validate/,
  /^\/api\/payouts\/eligibility/,
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC_CACHE, API_CACHE, PAGE_CACHE]);
      for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k);
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => {});
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_API_CACHE') {
    event.waitUntil(caches.delete(API_CACHE));
  }
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/** JWT `sub` (user id) so cached API data is never shared between accounts on one device. */
function userKey(request) {
  const h = request.headers.get('Authorization') || '';
  const token = h.replace(/^Bearer\s+/i, '');
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.sub || 'anon';
  } catch (_) {
    return token ? 'tok' : 'anon';
  }
}

async function notifyClients(url) {
  const all = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  for (const c of all) c.postMessage({ type: 'API_REVALIDATED', url });
}

async function staleWhileRevalidate(event, cacheName, cacheKey, { api = false } = {}) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(cacheKey);

  const network = fetch(event.request)
    .then(async (res) => {
      if (res && res.ok) {
        const copy = res.clone();
        if (api) {
          // detect change vs. what we served so open tabs can refresh
          if (cached) {
            try {
              const [a, b] = await Promise.all([cached.clone().text(), res.clone().text()]);
              if (a !== b) notifyClients(event.request.url);
            } catch (_) {}
          }
          const url = new URL(event.request.url);
          if (url.pathname === '/api/accounts') {
            // Keep the latest account list for /offline.html
            cache.put(SNAPSHOT_KEY, res.clone()).catch(() => {});
          }
        }
        await cache.put(cacheKey, copy);
      }
      return res;
    })
    .catch(() => null);

  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  const res = await network;
  if (res) return res;
  return new Response(JSON.stringify({ ok: false, error: { code: 'NETWORK_ERROR', message: 'You are offline and this data has not been cached yet.', details: null } }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** API GETs: always ask the network first so balances / roles / account lists are never stale; fall back to cache offline. */
async function networkFirstApi(event, cacheKey) {
  const cache = await caches.open(API_CACHE);
  try {
    const res = await fetch(event.request);
    if (res && res.ok) {
      const url = new URL(event.request.url);
      const copy = res.clone();
      event.waitUntil((async () => {
        await cache.put(cacheKey, copy);
        if (url.pathname === '/api/accounts') await cache.put(SNAPSHOT_KEY, res.clone()).catch(() => {});
      })().catch(() => {}));
    }
    return res;
  } catch (_) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    return new Response(JSON.stringify({ ok: false, error: { code: 'NETWORK_ERROR', message: 'You are offline and this data has not been cached yet.', details: null } }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // ── API ──
  if (url.pathname.startsWith('/api/')) {
    if (API_DENY.some((re) => re.test(url.pathname))) return;
    const key = new Request(`${url.origin}${url.pathname}${url.search}#u=${userKey(req)}`);
    event.respondWith(networkFirstApi(event, key));
    return;
  }

  // Only same-origin beyond this point
  if (url.origin !== self.location.origin) return;

  // ── Navigations ──
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const preload = await event.preloadResponse;
          const res = preload || (await fetch(req));
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(PAGE_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        } catch (_) {
          const cached = await caches.match(req, { cacheName: PAGE_CACHE });
          return cached || (await caches.match(OFFLINE_URL)) || Response.error();
        }
      })(),
    );
    return;
  }

  // ── Static assets ──
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || /\.(?:png|jpg|jpeg|svg|webp|avif|woff2?|css|js)$/.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event, STATIC_CACHE, req));
  }
});
