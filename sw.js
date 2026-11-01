const CACHE = 'mbi-inventra-shell-v1';
const ASSETS = ['/', '/styles.css', '/app.js', '/manifest.webmanifest', '/icon.svg', '/manus-routes.json'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => { if (event.request.method !== 'GET') return; event.respondWith(fetch(event.request).catch(() => caches.match(event.request))); });
