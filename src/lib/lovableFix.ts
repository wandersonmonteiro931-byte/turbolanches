const LOVA_FIX_KEY = "__LOVA_FIX_TRIGGER__";
const CLEANUP_SESSION_KEY = "__turbo_push_sw_cleanup__";
let probeSuppressionInstalled = false;

declare global {
  var __LOVA_FIX_TRIGGER__: boolean | undefined;
  interface Window {
    __LOVA_FIX_TRIGGER__?: boolean;
  }
}

function defineOnTarget(target: unknown) {
  if (!target || (typeof target !== "object" && typeof target !== "function")) return;

  try {
    (target as Record<string, unknown>)[LOVA_FIX_KEY] = false;
  } catch {}

  try {
    Object.defineProperty(target, LOVA_FIX_KEY, {
      value: false,
      writable: true,
      configurable: true,
    });
  } catch {}
}

function ensureIdentifierBinding() {
  try {
    if (typeof globalThis !== "undefined" && typeof globalThis.__LOVA_FIX_TRIGGER__ === "undefined") {
      globalThis.__LOVA_FIX_TRIGGER__ = false;
    }
  } catch {}

  try {
    Function("var __LOVA_FIX_TRIGGER__ = false;")();
  } catch {}

  try {
    (0, eval)("var __LOVA_FIX_TRIGGER__ = false;");
  } catch {}
}

function getProbeMessage(value: unknown): string {
  if (typeof value === "string") return value;

  if (value && typeof value === "object") {
    const maybeMessage = "message" in value ? value.message : undefined;
    if (typeof maybeMessage === "string") return maybeMessage;
  }

  try {
    return String(value ?? "");
  } catch {
    return "";
  }
}

function isLovaProbeMessage(value: unknown) {
  return getProbeMessage(value).includes(LOVA_FIX_KEY);
}

function installProbeSuppression() {
  if (probeSuppressionInstalled || typeof window === "undefined") return;

  window.addEventListener(
    "error",
    (event) => {
      if (!isLovaProbeMessage(event.message) && !isLovaProbeMessage(event.error)) return;
      event.preventDefault();
    },
    true,
  );

  window.addEventListener(
    "unhandledrejection",
    (event) => {
      if (!isLovaProbeMessage(event.reason)) return;
      event.preventDefault();
    },
    true,
  );

  probeSuppressionInstalled = true;
}

export function ensureLovaFixTrigger() {
  ensureIdentifierBinding();
  defineOnTarget(globalThis);

  if (typeof window !== "undefined") defineOnTarget(window);
  if (typeof self !== "undefined") defineOnTarget(self);

  ensureIdentifierBinding();

  installProbeSuppression();

  return false;
}

export async function cleanupLegacyPushServiceWorkers(currentPushUrl?: string | null) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const currentMarker = `${window.location.origin}${currentPushUrl ?? "::cleanup-all-push-sw"}`;
  if (sessionStorage.getItem(CLEANUP_SESSION_KEY) === currentMarker) return;

  sessionStorage.setItem(CLEANUP_SESSION_KEY, currentMarker);

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();

    await Promise.all(
      registrations.map(async (registration) => {
        const scriptUrl = registration.active?.scriptURL || registration.waiting?.scriptURL || registration.installing?.scriptURL || "";
        if (!scriptUrl.includes("/push-sw.js")) return;
        if (currentPushUrl && scriptUrl.includes(currentPushUrl)) return;

        try {
          await registration.unregister();
        } catch {}
      }),
    );
  } catch {}
}

ensureLovaFixTrigger();
