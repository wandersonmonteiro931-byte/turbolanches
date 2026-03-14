import "./index.css";

const ensureLovaFixTrigger = () => {
  try {
    (0, eval)("var __LOVA_FIX_TRIGGER__ = false;");
  } catch {}

  try {
    Object.defineProperty(globalThis, "__LOVA_FIX_TRIGGER__", {
      value: false,
      writable: true,
      configurable: true,
    });
  } catch {
    (globalThis as any).__LOVA_FIX_TRIGGER__ = false;
  }

  try {
    (window as any).__LOVA_FIX_TRIGGER__ = false;
  } catch {}

  try {
    (self as any).__LOVA_FIX_TRIGGER__ = false;
  } catch {}
};

const suppressLova = (msg: string) => msg.includes("__LOVA_FIX_TRIGGER__");

ensureLovaFixTrigger();

window.addEventListener("unhandledrejection", (e) => {
  const m = e.reason instanceof Error ? e.reason.message : String(e.reason ?? "");
  if (suppressLova(m)) e.preventDefault();
});

window.addEventListener("error", (e) => {
  if (suppressLova(e.message || "")) e.preventDefault();
});

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

    if (suppressLova(message)) {
      ensureLovaFixTrigger();
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
