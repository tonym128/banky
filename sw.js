const CACHE_NAME = 'kids-bank-cache-v1';
const urlsToCache = [
  '/banky/',
  '/banky/index.html',
  '/banky/styles.css',
  '/banky/app.js',
  '/banky/android-chrome-192x192.png',
  '/banky/android-chrome-512x512.png'
  '/banky/favicon.ico'
  '/banky/favicon-16x16.png'
  '/banky/favicon-32x32.png'
  '/banky/android-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});
