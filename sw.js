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

// 3. ПЕРЕХОПЛЕННЯ ЗАПИТІВ: Робота в офлайні та кешування картинок
self.addEventListener('fetch', event => {
  // Тільки GET-запити
  if (event.request.method !== 'GET') return;

  // ЛОГІКА 1: Кешування фотографій товарів з CDN
  if (event.request.url.includes('cdn.buymeua.shop')) {
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        // Якщо фото вже є в кеші телефону — віддаємо миттєво
        if (cachedResponse) {
          return cachedResponse;
        }
        // Якщо немає — завантажуємо з інтернету
        return fetch(event.request).then(networkResponse => {
          // Перевіряємо, чи успішна відповідь
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse;
          }
          // Зберігаємо нове фото в окремий кеш 'vartagear-images-v1'
          const responseToCache = networkResponse.clone();
          caches.open('vartagear-images-v1').then(cache => {
            cache.put(event.request, responseToCache);
          });
          return networkResponse;
        }).catch(() => {
          // Ігноруємо помилки завантаження картинок в офлайні
        });
      })
    );
    return; // Зупиняємо подальшу обробку, щоб не спрацювала логіка нижче
  }

  // ЛОГІКА 2: Кешування локальних файлів сайту (оригінальна логіка)
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request).then(networkResponse => {
          if(!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }
          var responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME)
            .then(function(cache) {
              cache.put(event.request, responseToCache);
            });
          return networkResponse;
        }).catch(() => {
            // Офлайн-режим
        });
      })
  );
});
