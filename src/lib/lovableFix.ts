const LOVA_FIX_KEY = "__LOVA_FIX_TRIGGER__";
const CLEANUP_SESSION_KEY = "__turbo_push_sw_cleanup__";

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

export function ensureLovaFixTrigger() {
  defineOnTarget(globalThis);

  if (typeof window !== "undefined") defineOnTarget(window);
  if (typeof self !== "undefined") defineOnTarget(self);

  try {
    (0, eval)(`var ${LOVA_FIX_KEY} = false;`);
  } catch {}

  return false;
}

export async function cleanupLegacyPushServiceWorkers(currentPushUrl: string) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const currentMarker = `${window.location.origin}${currentPushUrl}`;
  if (sessionStorage.getItem(CLEANUP_SESSION_KEY) === currentMarker) return;

  sessionStorage.setItem(CLEANUP_SESSION_KEY, currentMarker);

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();

    await Promise.all(
      registrations.map(async (registration) => {
        const scriptUrl = registration.active?.scriptURL || registration.waiting?.scriptURL || registration.installing?.scriptURL || "";
        if (!scriptUrl.includes("/push-sw.js")) return;
        if (scriptUrl.includes(currentPushUrl)) return;

        try {
          await registration.unregister();
        } catch {}
      }),
    );
  } catch {}
}

ensureLovaFixTrigger();
