// Bump VERSION on every deploy so the activate handler purges stale caches.
const VERSION = 'ams-2026.07.16.01-accounts-head';
const SHELL = ['./manifest.webmanifest', './favicon.ico', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './badge-96.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// Network-first for HTML (so deploys take effect immediately). Cache-first for static assets.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Treat the app's own scope root as HTML (works whether served from '/' or '/app/').
  const scopePath = new URL(self.registration.scope).pathname;
  const isHtml = req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === scopePath;
  if (isHtml) {
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req).then((c) => c || caches.match('./index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => cached))
  );
});

// Web Push: server-sent notifications delivered while the AMS app/tab is closed.
// Payload shape (sent by the send-push Edge Function):
//   { title, body, tag, type, url, linkType, linkId }
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (_) {
    try { data = { title: 'AMS', body: e.data && e.data.text() }; } catch (__) {}
  }
  const title = data.title || 'AMS';
  const opts = {
    body: data.body || '',
    icon: 'icon-192.png',
    // badge must be white-on-transparent: Android keeps only the alpha channel
    // for the status-bar glyph — a full-color icon renders as a blank square.
    badge: 'badge-96.png',
    tag: data.tag || 'ams-push',
    data: {
      url: data.url || './',
      type: data.type || 'info',
      linkType: data.linkType || null,
      linkId: data.linkId || null,
    },
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

// Focus or open the app when the user taps a notification (PWA on Android/iOS).
// If we have a deep-link, postMessage it to a focused window so the SPA can route
// without a full reload. If no window is open, open one with the link encoded in
// the URL query string for boot-time pickup.
// ── Push self-healing ──
// Browsers rotate/expire push subscriptions on their own schedule (FCM does this
// routinely). Without this handler the old endpoint starts returning 410, the
// send-push function prunes its row, and the device silently stops receiving
// pushes until the app is next opened — the classic "notifications just stopped"
// failure. Re-subscribe here and persist the new endpoint. The page saves
// {user_name, role, token} to IndexedDB at subscribe time (a SW cannot read
// localStorage); the token sets the org GUC that the FORCE-RLS insert on
// push_subscriptions requires.
const SB_URL = 'https://pnxaijtqrgannkkcghja.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBueGFpanRxcmdhbm5ra2NnaGphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMDAwNTQsImV4cCI6MjA5Mzg3NjA1NH0.mp_8NA_eqNS-CgrqBg-80heuhLBoa-3i7RLxnrgXKGI';
const VAPID_PUBLIC_KEY = 'BIY-zM9gN9IPHTsZ9wMVkf0hkZfZYGA6AIz6fQh0xCOutNJle0o4aVtVEzFwf7nR7NAi80bmjVFPLejTVcK6T08';

function b64ToU8(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  const s = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(s); const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
function pushCtxLoad() {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open('ams-push', 1);
      open.onupgradeneeded = () => { try { open.result.createObjectStore('ctx'); } catch (_) {} };
      open.onerror = () => resolve(null);
      open.onsuccess = () => {
        try {
          const idb = open.result; const tx = idb.transaction('ctx', 'readonly');
          const get = tx.objectStore('ctx').get('me');
          get.onsuccess = () => { idb.close(); resolve(get.result || null); };
          get.onerror = () => { idb.close(); resolve(null); };
        } catch (_) { resolve(null); }
      };
    } catch (_) { resolve(null); }
  });
}
self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil((async () => {
    try {
      const key = (e.oldSubscription && e.oldSubscription.options && e.oldSubscription.options.applicationServerKey) || b64ToU8(VAPID_PUBLIC_KEY);
      const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const ctx = await pushCtxLoad();
      if (!ctx || !ctx.user_name) return;
      const j = sub.toJSON();
      const headers = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' };
      if (ctx.token) headers['x-ams-session'] = ctx.token;
      await fetch(SB_URL + '/rest/v1/push_subscriptions?on_conflict=endpoint', {
        method: 'POST',
        headers,
        body: JSON.stringify([{
          endpoint: j.endpoint,
          p256dh: j.keys && j.keys.p256dh,
          auth: j.keys && j.keys.auth,
          user_name: ctx.user_name,
          role: ctx.role || null,
          user_agent: 'sw:pushsubscriptionchange',
          last_used_at: new Date().toISOString(),
          failed_count: 0,
        }]),
      });
    } catch (_) { /* expired session etc. — the next app open re-subscribes via usePushSubscription */ }
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const d = (e.notification && e.notification.data) || {};
  const linkType = d.linkType || null;
  const linkId = d.linkId || null;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) {
        try {
          await c.focus();
          if (linkType) {
            try { c.postMessage({ type: 'ams:notif-click', linkType, linkId }); } catch (_) {}
          }
          return;
        } catch (_) {}
      }
    }
    if (self.clients.openWindow) {
      let url = d.url || './';
      if (linkType && !/[?&]lt=/.test(url)) {
        const qp = 'lt=' + encodeURIComponent(linkType) + (linkId ? '&li=' + encodeURIComponent(linkId) : '');
        url += (url.indexOf('?') === -1 ? '?' : '&') + qp;
      }
      return self.clients.openWindow(url);
    }
  })());
});
