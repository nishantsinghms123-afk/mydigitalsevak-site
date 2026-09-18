// Root kill-switch service worker.
// The app moved from "/" to "/app/". Any client that previously installed the
// portal PWA at the root still has the OLD app service worker registered at
// "/sw.js". This script REPLACES it: on activation it purges all caches,
// unregisters itself, and reloads open tabs — so old installs stop serving
// stale app code and cleanly fall through to the marketing page (whose Sign in
// button points at /app/). New visitors to "/" register nothing (marketing has
// no PWA). The app's own service worker lives at /app/sw.js, scoped to /app/.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (_) {}
    try { await self.registration.unregister(); } catch (_) {}
    try {
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((c) => { try { c.navigate(c.url); } catch (_) {} });
    } catch (_) {}
  })());
});
