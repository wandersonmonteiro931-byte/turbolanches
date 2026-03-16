import "./index.css";

// environment compat
var __LOVA_FIX_TRIGGER__ = false;
(globalThis as any).__LOVA_FIX_TRIGGER__ = false;
if (typeof window !== "undefined") {
  (window as any).__LOVA_FIX_TRIGGER__ = false;
}

if ("serviceWorker" in navigator) {
  const serviceWorkerUrl = "/push-sw.js?v=5";

  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister().catch(() => false))))
    .finally(() => {
      navigator.serviceWorker.register(serviceWorkerUrl, {
        scope: "/",
        updateViaCache: "none",
      }).catch(() => {});
    });
}

async function bootstrap() {
  const rootEl = document.getElementById("root");
  if (!rootEl) return;

  const [{ createRoot }, { default: App }] = await Promise.all([
    import("react-dom/client"),
    import("./App.tsx"),
  ]);

  createRoot(rootEl).render(<App />);
}

void bootstrap();
