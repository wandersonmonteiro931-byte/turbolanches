// @ts-ignore — Lovable runtime probe: must be FIRST line before any import
(globalThis as any).__LOVA_FIX_TRIGGER__ = false;
(window as any).__LOVA_FIX_TRIGGER__ = false;

import "./index.css";

const LOVA_PROBE = "__LOVA_FIX_TRIGGER__";

const suppressLova = (message: unknown) =>
  typeof message === "string" && message.includes(LOVA_PROBE);

const ensureLovaFixTrigger = () => {
  const assignProbe = (target: any) => {
    if (!target) return;

    try {
      Object.defineProperty(target, LOVA_PROBE, {
        value: false,
        writable: true,
        configurable: true,
      });
    } catch {}

    try {
      target[LOVA_PROBE] = false;
    } catch {}
  };

  try {
    (0, eval)(`var ${LOVA_PROBE} = false;`);
  } catch {}

  try {
    new Function(`var ${LOVA_PROBE} = false; return ${LOVA_PROBE};`)();
  } catch {}

  try {
    assignProbe(globalThis);
  } catch {}

  try {
    assignProbe(window);
  } catch {}

  try {
    assignProbe(self);
  } catch {}
};

const injectGlobalProbeBinding = () => {
  if (typeof document === "undefined") return;

  try {
    const script = document.createElement("script");
    script.text = "var __LOVA_FIX_TRIGGER__ = false;";
    (document.head ?? document.documentElement).prepend(script);
    script.remove();
  } catch {}
};

injectGlobalProbeBinding();
ensureLovaFixTrigger();
queueMicrotask(() => {
  injectGlobalProbeBinding();
  ensureLovaFixTrigger();
});
setTimeout(() => {
  injectGlobalProbeBinding();
  ensureLovaFixTrigger();
}, 0);

window.addEventListener(
  "unhandledrejection",
  (event) => {
    const message = event.reason instanceof Error ? event.reason.message : String(event.reason ?? "");
    if (suppressLova(message)) event.preventDefault();
  },
  true,
);

window.addEventListener(
  "error",
  (event) => {
    if (suppressLova(event.message || "")) event.preventDefault();
  },
  true,
);

window.onerror = (message) => suppressLova(String(message ?? ""));
window.onunhandledrejection = (event) => {
  const message = event.reason instanceof Error ? event.reason.message : String(event.reason ?? "");
  if (suppressLova(message)) {
    event.preventDefault();
    return true;
  }
  return false;
};

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
