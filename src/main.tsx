import "./index.css";

const LOVA_FIX_KEY = "__LOVA_FIX_TRIGGER__";
const SERVICE_WORKER_VERSION = "v11";

type GlobalScopeWithFix = typeof globalThis & {
  [LOVA_FIX_KEY]?: boolean;
};

const lovaScopes = () => {
  const scopes: Array<Record<string, unknown>> = [];

  if (typeof globalThis !== "undefined") scopes.push(globalThis as Record<string, unknown>);
  if (typeof window !== "undefined") scopes.push(window as unknown as Record<string, unknown>);
  if (typeof self !== "undefined") scopes.push(self as unknown as Record<string, unknown>);

  return Array.from(new Set(scopes));
};

const suppressLovaFixErrors = () => {
  if (typeof window === "undefined") return;

  const isLovaFixError = (value: unknown) => String(value ?? "").includes(LOVA_FIX_KEY);

  window.addEventListener(
    "error",
    (event) => {
      if (isLovaFixError(event.message) || isLovaFixError(event.error?.message)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );

  window.addEventListener(
    "unhandledrejection",
    (event) => {
      if (isLovaFixError((event.reason as Error | undefined)?.message) || isLovaFixError(event.reason)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
};

const ensureLovaFixTrigger = () => {
  suppressLovaFixErrors();

  for (const scope of lovaScopes()) {
    try {
      scope[LOVA_FIX_KEY] = false;
    } catch {}

    try {
      Object.defineProperty(scope, LOVA_FIX_KEY, {
        value: false,
        writable: true,
        configurable: true,
      });
    } catch {}
  }

  try {
    (0, eval)(`var ${LOVA_FIX_KEY} = false;`);
  } catch {}

  try {
    const globalScope = globalThis as GlobalScopeWithFix;
    if (typeof globalScope[LOVA_FIX_KEY] === "undefined") {
      globalScope[LOVA_FIX_KEY] = false;
    }
  } catch {}
};

ensureLovaFixTrigger();

if ("serviceWorker" in navigator) {
  const serviceWorkerUrl = `/push-sw.js?${SERVICE_WORKER_VERSION}`;

  navigator.serviceWorker
    .register(serviceWorkerUrl, {
      scope: "/",
      updateViaCache: "none",
    })
    .catch(() => {});
}

async function bootstrap() {
  ensureLovaFixTrigger();

  const rootEl = document.getElementById("root");
  if (!rootEl) return;

  const [{ createRoot }, { default: App }] = await Promise.all([
    import("react-dom/client"),
    import("./App.tsx"),
  ]);

  ensureLovaFixTrigger();
  createRoot(rootEl).render(<App />);
}

void bootstrap();
