import "./index.css";

const LOVA_FIX_KEY = "__LOVA_FIX_TRIGGER__";

const ensureLovaFixTrigger = () => {
  try {
    (globalThis as Record<string, unknown>)[LOVA_FIX_KEY] = false;
  } catch {}

  try {
    Object.defineProperty(globalThis, LOVA_FIX_KEY, {
      value: false,
      writable: true,
      configurable: true,
    });
  } catch {}

  if (typeof window !== "undefined") {
    try {
      (window as unknown as Record<string, unknown>)[LOVA_FIX_KEY] = false;
    } catch {}

    try {
      Object.defineProperty(window, LOVA_FIX_KEY, {
        value: false,
        writable: true,
        configurable: true,
      });
    } catch {}
  }

  try {
    (0, eval)(`var ${LOVA_FIX_KEY} = false;`);
  } catch {}
};

ensureLovaFixTrigger();

if ("serviceWorker" in navigator) {
  const serviceWorkerUrl = "/push-sw.js?v=6";

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
