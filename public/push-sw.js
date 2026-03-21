// SW Version 32 — standard service worker + immediate update
var SW_VERSION = "v32";
var __LOVA_FIX_TRIGGER__ = typeof self !== "undefined" && typeof self.__LOVA_FIX_TRIGGER__ !== "undefined"
  ? self.__LOVA_FIX_TRIGGER__
  : false;

try {
  if (typeof self.__LOVA_FIX_TRIGGER__ === "undefined") {
    Object.defineProperty(self, "__LOVA_FIX_TRIGGER__", {
      value: __LOVA_FIX_TRIGGER__,
      configurable: true,
      writable: true,
    });
  }
} catch (e) {
  self.__LOVA_FIX_TRIGGER__ = __LOVA_FIX_TRIGGER__;
}

try {
  Function(
    "value",
    "try { __LOVA_FIX_TRIGGER__ = value; } catch (e) {} try { self.__LOVA_FIX_TRIGGER__ = value; } catch (e) {}",
  )(__LOVA_FIX_TRIGGER__);
} catch (e) {}

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", function (event) {
  event.respondWith(
    fetch(event.request).catch(function () {
      return caches.match(event.request);
    }),
  );
});

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
    })(),
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
          if (client.url.indexOf(self.location.origin) !== -1 && "focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
