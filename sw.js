const CACHE = 'customer-flow-note-v3';
const ASSETS = ['./', './records.html', './record.html', './styles.css', './app.js', './records.js', './record.js', './records-backend.js', './firebase-config.js', './manifest.webmanifest', './icon.svg', './data/events.json', './data/calendar-context.json'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).pathname.includes('/api/')) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
