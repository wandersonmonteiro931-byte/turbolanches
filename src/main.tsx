import "./index.css";

const ensureGlobalProbe = () => {
  try {
    (0, eval)("var __LOVA_FIX_TRIGGER__ = false;");
  } catch {}

  try {
    (0, Function)("var __LOVA_FIX_TRIGGER__ = false;")();
  } catch {}

  try {
    Object.defineProperty(globalThis, "__LOVA_FIX_TRIGGER__", {
      value: false,
      writable: true,
      configurable: true,
    });
  } catch {}

  try {
    (globalThis as Record<string, unknown>).__LOVA_FIX_TRIGGER__ = false;
    (window as unknown as Record<string, unknown>).__LOVA_FIX_TRIGGER__ = false;
    (self as unknown as Record<string, unknown>).__LOVA_FIX_TRIGGER__ = false;
  } catch {}

  try {
    const script = document.createElement("script");
    script.text = "var __LOVA_FIX_TRIGGER__ = false;";
    (document.head ?? document.documentElement).prepend(script);
    script.remove();
  } catch {}
};

ensureGlobalProbe();

// Suppress __LOVA_FIX_TRIGGER__ ReferenceError globally
window.addEventListener("unhandledrejection", (e) => {
  if (e.reason?.message?.includes?.("__LOVA_FIX_TRIGGER__")) {
    e.preventDefault();
  }
});
window.addEventListener("error", (e) => {
  if (e.message?.includes?.("__LOVA_FIX_TRIGGER__")) {
    e.preventDefault();
  }
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/push-sw.js", { scope: "/" }).catch(() => {});
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
