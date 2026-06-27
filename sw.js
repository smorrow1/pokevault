/* PokéVault service worker — offline app-shell + asset caching.
   Strategy is deliberately update-safe (the app deploys often):
   - HTML/navigation: NETWORK-FIRST → online always gets the latest app, so it can
     never get "stuck" on a stale version; offline falls back to the cached shell.
   - TCGdex card images + the Tabler icon font: stale-while-revalidate.
   - API calls (api.tcgdex.net, api.anthropic.com) are never cached.
   Rollback: delete sw.js + its registration; with network-first the app keeps working. */
const CACHE = 'pokevault-shell-v1';
const SHELL = ['./', './index.html'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // App shell / navigation → network-first, cache fallback (offline)
  if (req.mode === 'navigate' || req.destination === 'document') {
    e.respondWith((async () => {
      try {
        const net = await fetch(req);
        const c = await caches.open(CACHE);
        c.put('./index.html', net.clone());
        return net;
      } catch (_) {
        return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Card images + icon font → stale-while-revalidate (immutable per URL).
  // Explicitly NOT the API hosts.
  const cacheable = url.hostname === 'assets.tcgdex.net' || url.hostname.endsWith('jsdelivr.net');
  if (cacheable) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const cached = await c.match(req);
      const net = fetch(req).then((r) => {
        if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone());
        return r;
      }).catch(() => cached);
      return cached || net;
    })());
  }
});
