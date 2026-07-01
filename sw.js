const CACHE_NAME = "berk-dilara-v1.1.8";

const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./couple.jpg"
];

// Kurulum
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(FILES_TO_CACHE);
    })
  );

  self.skipWaiting();
});

// Aktifleştirme
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );

  self.clients.claim();
});

// Dosya yükleme
self.addEventListener("fetch", event => {

  // HTML dosyaları her zaman internetten gelsin
  if (event.request.mode === "navigate") {

    event.respondWith(
      fetch(event.request)
        .then(response => {

          const copy = response.clone();

          caches.open(CACHE_NAME).then(cache => {
            cache.put("./index.html", copy);
          });

          return response;

        })
        .catch(() => caches.match("./index.html"))
    );

    return;
  }

  // Diğer dosyalar önce cache
  event.respondWith(
    caches.match(event.request).then(cached => {

      if (cached) {
        return cached;
      }

      return fetch(event.request).then(response => {

        if (
          event.request.method === "GET" &&
          response.status === 200
        ) {

          const copy = response.clone();

          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, copy);
          });

        }

        return response;

      });

    })
  );

});

// Bildirime tıklayınca uygulamayı aç
self.addEventListener("notificationclick", event => {

  event.notification.close();

  event.waitUntil(

    clients.matchAll({
      type: "window",
      includeUncontrolled: true
    }).then(windowClients => {

      for (const client of windowClients) {

        if ("focus" in client)
          return client.focus();

      }

      if (clients.openWindow)
        return clients.openWindow("./");

    })

  );

});
