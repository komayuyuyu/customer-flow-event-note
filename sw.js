const CACHE = 'customer-flow-note-v52';
const VERSION = '20260716-01';
const ASSETS = ['./', './records.html', './record.html', `./styles.css?v=${VERSION}`, `./app.js?v=${VERSION}`, `./records.js?v=${VERSION}`, `./record.js?v=${VERSION}`, `./records-backend.js?v=${VERSION}`, `./ui-utils.js?v=${VERSION}`, `./app-data.js?v=${VERSION}`, `./menu.js?v=${VERSION}`, `./firebase-config.js?v=${VERSION}`, './manifest.webmanifest', './icon.svg', './data/events.json', './data/store-events.json', './data/calendar-context.json'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).pathname.includes('/api/')) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
