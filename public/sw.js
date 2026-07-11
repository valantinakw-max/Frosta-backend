// Service Worker لفروزينا — يفعّل تثبيت التطبيق والعمل دون اتصال
const CACHE = 'frozina-v1';
const CORE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/frozina-logo.png',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return; // تجاهل الطلبات غير GET (مثل الدفع)
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // اترك الموارد الخارجية (خطوط/صور/API) تمر عادي

  // شبكة أولاً، ومع فقدان الاتصال نرجع للنسخة المخزّنة
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('/index.html')))
  );
});
