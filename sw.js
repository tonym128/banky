const CACHE_NAME = 'kids-bank-cache-v11';
const urlsToCache = [
    '/',
    'index.html',
    'styles.css',
    'app.js',
    'ui.js',
    'ui-account.js',
    'ui-settings.js',
    'ui-components.js',
    'pubsub.js',
    'logger.js',
    'utils.js',
    'pwa.js',
    'state.js',
    'idb.js',
    's3.js',
    'encryption.js',
    'manifest.json',
    'images/banky.png',
    'images/logo.svg',
    'android-chrome-192x192.png',
    'android-chrome-512x512.png',
    'favicon.ico',
    'favicon-16x16.png',
    'favicon-32x32.png',
    'apple-touch-icon.png',
    'vendor/bootstrap.min.css',
    'vendor/bootstrap.bundle.min.js',
    'vendor/chart.js',
    'vendor/qrcode.min.js',
    'vendor/jsQR.min.js'
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

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});
