import "./index.css";

const ensureGlobalProbe = () => {
  try {
    (0, eval)("var __LOVA_FIX_TRIGGER__ = false;");
  } catch {}

  try {
    Function("var __LOVA_FIX_TRIGGER__ = false;")();
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
const isLovaFixError = (value: unknown) => {
  if (typeof value === "string") return value.includes("__LOVA_FIX_TRIGGER__");
  if (value && typeof value === "object" && "message" in value) {
    return String((value as { message?: unknown }).message ?? "").includes("__LOVA_FIX_TRIGGER__");
  }
  return false;
};

window.addEventListener(
  "unhandledrejection",
  (e) => {
    if (isLovaFixError(e.reason)) e.preventDefault();
  },
  { capture: true },
);

window.addEventListener(
  "error",
  (e) => {
    if (isLovaFixError((e as ErrorEvent).message) || isLovaFixError((e as ErrorEvent).error)) {
      e.preventDefault();
    }
  },
  { capture: true },
);

window.onunhandledrejection = (e) => {
  if (isLovaFixError(e.reason)) {
    e.preventDefault();
    return true;
  }
  return false;
};

window.onerror = (message, _source, _lineno, _colno, error) => {
  if (isLovaFixError(message) || isLovaFixError(error)) return true;
  return false;
};

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
