// SW Version 10 — resilient global probe suppression + immediate update
var SW_VERSION = "v10";
var LOVA_FIX_KEY = "__LOVA_FIX_TRIGGER__";
var __LOVA_FIX_TRIGGER__ = false;
try { self[LOVA_FIX_KEY] = false; } catch (e) {}
try { globalThis[LOVA_FIX_KEY] = false; } catch (e) {}
try { Object.defineProperty(self, LOVA_FIX_KEY, { value: false, writable: true, configurable: true }); } catch (e) {}
try { Object.defineProperty(globalThis, LOVA_FIX_KEY, { value: false, writable: true, configurable: true }); } catch (e) {}

function isLovaProbeMessage(message) {
  return typeof message === "string" && message.indexOf("__LOVA_FIX_TRIGGER__") !== -1;
}

self.addEventListener(
  "error",
  function (event) {
    if (isLovaProbeMessage((event && event.message) || "")) {
      event.preventDefault();
    }
  },
  true,
);

self.addEventListener(
  "unhandledrejection",
  function (event) {
    var message = "";
    try {
      message = event && event.reason && event.reason.message
        ? event.reason.message
        : String((event && event.reason) || "");
    } catch (e) {
      message = "";
    }
    if (isLovaProbeMessage(message)) {
      event.preventDefault();
    }
  },
  true,
);

// Activate immediately, replacing old service worker
self.addEventListener("install", function () {
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
    }),
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
          if (
            client.url.indexOf(self.location.origin) !== -1 &&
            "focus" in client
          ) {
            client.navigate(url);
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
