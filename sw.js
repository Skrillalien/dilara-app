// Bildirime tıklayınca uygulamayı aç (varsa ilgili sayfayı).
// Firebase'den ÖNCE kaydedilmeli ki önce bu çalışsın.
self.addEventListener("notificationclick", event => {

  // Firebase'in kendi tıklama işleyicisi (aşağıda importScripts ile gelir)
  // sayfa bilgisini kullanmıyor; ona gitmesin, biz açalım
  event.stopImmediatePropagation();

  event.notification.close();

  // Firebase bildirimlerinde sayfa bilgisi FCM_MSG.data.page içinde
  const data = event.notification.data || {};
  const page = data.FCM_MSG?.data?.page || data.page || null;

  const scope = self.registration.scope;
  const target = page ? `${scope}?open=${encodeURIComponent(page)}` : scope;

  event.waitUntil(

    clients.matchAll({
      type: "window",
      includeUncontrolled: true
    }).then(windowClients => {

      for (const client of windowClients) {

        if ("focus" in client) {

          if (page) client.postMessage({ type: "open-page", page });

          return client.focus();

        }

      }

      if (clients.openWindow)
        return clients.openWindow(target);

    })

  );

});

// ── Web bildirimleri (Firebase Cloud Messaging) ─────────────
// Uygulama kapalıyken gelen bildirimleri Firebase gösterir.
// iPhone'da sadece ana ekrana eklenmiş uygulamada çalışır (iOS 16.4+).
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDWzpBdbdb_db25-tSD27A0IEGW1MeUlJM",
  authDomain: "dilara-app-6c7ab.firebaseapp.com",
  projectId: "dilara-app-6c7ab",
  storageBucket: "dilara-app-6c7ab.firebasestorage.app",
  messagingSenderId: "1047372766813",
  appId: "1:1047372766813:web:0e6cb16013ea74927937b4"
});

firebase.messaging();

const CACHE_NAME = "kalpkalbe-v0.8.1";

const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

// Kurulum
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE))
  );

  self.skipWaiting();
});

// Eski cache'leri sil
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

// Fetch
self.addEventListener("fetch", event => {

  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Sadece uygulamanın kendi dosyaları ve Storage'daki fotoğraflar önbelleğe alınır.
  // Firestore / Firebase istekleri (canlı bağlantılar) olduğu gibi geçsin.
  const isOwn = url.origin === self.location.origin;
  const isPhoto = url.hostname === "firebasestorage.googleapis.com";

  if (!isOwn && !isPhoto) return;

  // HTML
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

// JS ve CSS: network-first, cache fallback
  if (
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css")
  ) {

    event.respondWith(

      fetch(event.request)
        .then(response => {

          const copy = response.clone();

          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, copy);
          });

          return response;

        })
        .catch(() => caches.match(event.request))

    );

    return;
  }

  // Resimler ve diğer dosyalar cache-first
  event.respondWith(

    caches.match(event.request).then(cached => {

      if (cached) return cached;

      return fetch(event.request).then(response => {

        if (response.status === 200) {

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
