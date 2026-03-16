import "./index.css";

const LOVA_FIX_KEY = "__LOVA_FIX_TRIGGER__";

const ensureLovaFixTrigger = () => {
  const globalScript = `
    var __LOVA_FIX_TRIGGER__ = false;
    try { window.__LOVA_FIX_TRIGGER__ = false; } catch (e) {}
    try { globalThis.__LOVA_FIX_TRIGGER__ = false; } catch (e) {}
    try { self.__LOVA_FIX_TRIGGER__ = false; } catch (e) {}
  `;

  if (typeof document !== "undefined" && !document.querySelector('script[data-lova-fix-trigger="true"]')) {
    const script = document.createElement("script");
    script.setAttribute("data-lova-fix-trigger", "true");
    script.text = globalScript;
    document.head.prepend(script);
  }

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

  if (typeof self !== "undefined") {
    try {
      (self as unknown as Record<string, unknown>)[LOVA_FIX_KEY] = false;
    } catch {}
  }

  try {
    (0, eval)(`var ${LOVA_FIX_KEY} = false;`);
  } catch {}
};

ensureLovaFixTrigger();

if ("serviceWorker" in navigator) {
  const serviceWorkerUrl = "/push-sw.js?v=8";

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
