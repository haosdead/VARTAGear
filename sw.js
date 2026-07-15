const CACHE_NAME = 'vartagear-pwa-v1';

// Основні файли, які потрібно завантажити в пам'ять телефону одразу
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/favicon.png',
  '/manifest.json'
];

// 1. ВСТАНОВЛЕННЯ: Кешуємо основні файли
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Кеш відкрито, завантажуємо ядро додатка');
        return cache.addAll(urlsToCache);
      })
  );
  // Змушуємо Service Worker активуватися негайно
  self.skipWaiting();
});

// 2. АКТИВАЦІЯ: Очищення старих кешів (якщо ти оновиш версію)
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
  self.clients.claim();
});

// 3. ПЕРЕХОПЛЕННЯ ЗАПИТІВ: Робота в офлайні
self.addEventListener('fetch', event => {
  // Кешуємо тільки GET-запити до власних файлів
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
      return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Якщо файл є в кеші (наприклад, style.css) — віддаємо миттєво
        if (response) {
          return response;
        }
        // Якщо немає — завантажуємо з інтернету
        return fetch(event.request).then(
          function(networkResponse) {
            // Перевіряємо, чи відповідь нормальна
            if(!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }

            // Зберігаємо нові файли в кеш для наступного разу
            var responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then(function(cache) {
                cache.put(event.request, responseToCache);
              });

            return networkResponse;
          }
        ).catch(() => {
            // Якщо немає інтернету і файла немає в кеші - можна показати офлайн-сторінку
            // console.log('Немає підключення до мережі');
        });
      })
  );
});
