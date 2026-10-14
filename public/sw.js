// Service Worker para Radio Manantial 105.3 FM
const CACHE_NAME = 'radio-manantial-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/main.js',
  '/assets/logo.png',
  '/assets/logo-brand.png',
  '/assets/bg.jpg',
  '/favicon.ico',
  '/manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // El streaming de audio y la API de metadatos nunca se deben almacenar en caché estático
  if (e.request.url.includes('radioca.st') || e.request.url.includes('apple.com')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});
