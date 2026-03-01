// SW Version 2 — forces update on existing installs
var SW_VERSION = "v2";

// Activate immediately, replacing old service worker
self.addEventListener("install", function (event) {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

// ---- Fetch handler (required for PWA installability) ----
self.addEventListener("fetch", function (event) {
  // Network-first strategy: try network, fallback to cache
  event.respondWith(
    fetch(event.request).catch(function () {
      return caches.match(event.request);
    })
  );
});

// ---- Push notifications ----
self.addEventListener("push", function (event) {
  event.waitUntil(
    (function () {
      var title = "Turbo Lanches";
      var body = "Nova notificação";
      var icon = "/favicon.ico";
      var badge = "/favicon.ico";
      var url = "/";
      if (event.data) {
        try {
          var rawText = event.data.text();
          if (rawText) {
            try {
              var data = JSON.parse(rawText);
              title = data.title || title;
              body = data.body || data.message || body;
              icon = data.icon || icon;
              badge = data.badge || badge;
              if (data.data && data.data.url) url = data.data.url;
            } catch (e) {
              body = rawText;
            }
          }
        } catch (e) {}
      }
      return self.registration.showNotification(title, {
        body: body,
        icon: icon,
        badge: badge,
        vibrate: [200, 100, 200],
        tag: "turbo-" + Date.now(),
        renotify: true,
        requireInteraction: false,
        data: { url: url },
      });
    })()
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (windowClients) {
        for (var i = 0; i < windowClients.length; i++) {
          var client = windowClients[i];
          if (
            client.url.indexOf(self.location.origin) !== -1 &&
            "focus" in client
          ) {
            client.navigate(url);
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      })
  );
});
