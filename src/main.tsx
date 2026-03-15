import "./index.css";

const LOVA_PROBE = "__LOVA_FIX_TRIGGER__";

const isProbeError = (value: unknown) =>
  typeof value === "string" && value.includes(LOVA_PROBE);

const ensureProbe = () => {
  try {
    Object.defineProperty(globalThis, LOVA_PROBE, {
      value: false,
      writable: true,
      configurable: true,
    });
  } catch {}

  try {
    (globalThis as Record<string, unknown>)[LOVA_PROBE] = false;
  } catch {}

  try {
    // Indirect eval runs in global scope and creates a real global `var` binding.
    (0, eval)(`var ${LOVA_PROBE} = false;`);
  } catch {}

  try {
    const script = document.createElement("script");
    script.text = "var __LOVA_FIX_TRIGGER__ = false;";
    (document.head ?? document.documentElement).prepend(script);
    script.remove();
  } catch {}
};

ensureProbe();

window.onunhandledrejection = (event) => {
  const message = event.reason instanceof Error ? event.reason.message : String(event.reason ?? "");
  if (isProbeError(message)) {
    event.preventDefault();
    ensureProbe();
    return true;
  }
  return false;
};

window.onerror = (message) => {
  if (isProbeError(String(message ?? ""))) {
    ensureProbe();
    return true;
  }
  return false;
};

window.addEventListener(
  "unhandledrejection",
  (event) => {
    const message = event.reason instanceof Error ? event.reason.message : String(event.reason ?? "");
    if (isProbeError(message)) {
      event.preventDefault();
      ensureProbe();
    }
  },
  true,
);

window.addEventListener(
  "error",
  (event) => {
    if (isProbeError(event.message ?? "")) {
      event.preventDefault();
      ensureProbe();
    }
  },
  true,
);

// Service worker registration
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/push-sw.js", { scope: "/" }).catch(() => {});
}

async function bootstrap() {
  const rootEl = document.getElementById("root");
  if (!rootEl) return;

  try {
    const [{ createRoot }, { default: App }] = await Promise.all([
      import("react-dom/client"),
      import("./App.tsx"),
    ]);

    createRoot(rootEl).render(<App />);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    if (isProbeError(message)) {
      ensureProbe();
      const [{ createRoot }, { default: App }] = await Promise.all([
        import("react-dom/client"),
        import("./App.tsx"),
      ]);
      createRoot(rootEl).render(<App />);
      return;
    }

    throw error;
  }
}

void bootstrap();
