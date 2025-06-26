const CACHE_NAME = 'weekly-planner-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  // Assuming React app will serve its assets from root or build folder
  '/static/js/main.chunk.js',
  '/static/js/bundle.js',
  '/static/js/0.chunk.js',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  // Add other assets as needed, like fonts, other icons, etc.
  'https://cdn.tailwindcss.com', // Tailwind CDN
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap', // Inter font
  'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3I6dtIfUkd-Wg.ttf', // Example font file, adjust path
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.error('Failed to cache during install:', error);
      })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        // No cache hit - fetch from network
        return fetch(event.request)
          .then((fetchResponse) => {
            // Check if we received a valid response
            if (!fetchResponse || fetchResponse.status !== 200 || fetchResponse.type !== 'basic') {
              return fetchResponse;
            }

            // IMPORTANT: Clone the response. A response is a stream
            // and can only be consumed once. We need to clone it so
            // we can consume one in the cache and one in the browser.
            const responseToCache = fetchResponse.clone();

            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });

            return fetchResponse;
          })
          .catch((error) => {
            console.error('Fetch failed:', error);
            // You could return a custom offline page here
            return new Response('<h1>Offline</h1><p>Please check your internet connection.</p>', {
              headers: { 'Content-Type': 'text/html' },
            });
          });
      })
  );
});

self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

