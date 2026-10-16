// Service worker: оболочка приложения офлайн. API не кешируется — данные живут в localStorage.
const CACHE = 'planner-v1';
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icon.svg'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  if (e.request.mode === 'navigate') {
    // сеть первой, офлайн — из кеша
    e.respondWith(fetch(e.request).then((r) => {
      const copy = r.clone();
      caches.open(CACHE).then((c) => c.put('/', copy));
      return r;
    }).catch(() => caches.match('/')));
    return;
  }
  // ассеты с хешем — кеш первым
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => {
    if (r.ok && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icon'))) {
      const copy = r.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
    }
    return r;
  })));
});
