const CACHE = 'mbi-inventra-shell-v2';
const ASSETS = ['/', '/styles.css', '/app.js', '/manifest.webmanifest', '/assets/brand/MBI-LOGO.png', '/assets/brand/logo-192.png', '/assets/brand/logo-512.png', '/manus-routes.json'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => { if (event.request.method !== 'GET') return; event.respondWith(fetch(event.request).catch(() => caches.match(event.request))); });
