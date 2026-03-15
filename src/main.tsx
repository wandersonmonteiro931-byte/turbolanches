import "./index.css";

const PROBE_KEY = "__LOVA_FIX_TRIGGER__";

const defineProbeTarget = (target: unknown) => {
  if (!target || (typeof target !== "object" && typeof target !== "function")) return;

  try {
    Object.defineProperty(target, PROBE_KEY, {
      configurable: true,
      get: () => false,
      set: () => {},
    });
    return;
  } catch {}

  try {
    (target as Record<string, unknown>)[PROBE_KEY] = false;
  } catch {}
};

const ensureGlobalProbe = () => {
  try {
    (0, eval)(`var ${PROBE_KEY} = false;`);
  } catch {}

  try {
    Function(`var ${PROBE_KEY} = false; return ${PROBE_KEY};`)();
  } catch {}

  defineProbeTarget(globalThis);
  if (typeof window !== "undefined") defineProbeTarget(window);
  if (typeof self !== "undefined") defineProbeTarget(self);

  try {
    const script = document.createElement("script");
    script.text = `var ${PROBE_KEY} = false;`;
    (document.head ?? document.documentElement).prepend(script);
    script.remove();
  } catch {}
};

ensureGlobalProbe();
queueMicrotask(ensureGlobalProbe);
setTimeout(ensureGlobalProbe, 0);

const isLovaFixError = (value: unknown) => {
  if (typeof value === "string") return value.includes(PROBE_KEY);
  if (value && typeof value === "object" && "message" in value) {
    return String((value as { message?: unknown }).message ?? "").includes(PROBE_KEY);
  }
  return false;
};

window.addEventListener(
  "unhandledrejection",
  (e) => {
    ensureGlobalProbe();
    if (isLovaFixError(e.reason)) e.preventDefault();
  },
  { capture: true },
);

window.addEventListener(
  "error",
  (e) => {
    ensureGlobalProbe();
    if (isLovaFixError((e as ErrorEvent).message) || isLovaFixError((e as ErrorEvent).error)) {
      e.preventDefault();
    }
  },
  { capture: true },
);

window.onunhandledrejection = (e) => {
  ensureGlobalProbe();
  if (isLovaFixError(e.reason)) {
    e.preventDefault();
    return true;
  }
  return false;
};

window.onerror = (message, _source, _lineno, _colno, error) => {
  ensureGlobalProbe();
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
