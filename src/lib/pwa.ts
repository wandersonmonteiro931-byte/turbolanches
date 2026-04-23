export const SW_VERSION = "v65";
export const APP_VERSION = "2026-04-23-kiosk-refresh";
export const PUSH_SW_URL = `/push-sw.js?${SW_VERSION}`;

const isInIframe = (() => {
  if (typeof window === "undefined") return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

export const shouldEnableServiceWorker = () => {
  if (typeof window === "undefined") return false;
  if (isInIframe) return false;

  const { hostname } = window.location;
  const isLovablePreview = hostname.endsWith(".lovable.app") && hostname.includes("--");
  const isLovableProjectPreview = hostname.endsWith(".lovableproject.com");

  return !(isLovablePreview || isLovableProjectPreview);
};

/**
 * In preview/iframe contexts: aggressively unregister ALL service workers
 * to prevent stale-cache reload loops. In production: only clean up legacy push SWs.
 */
export async function cleanupLegacyPushServiceWorkers(currentPushUrl?: string | null) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  // Preview / iframe: nuke everything, no exceptions.
  if (!shouldEnableServiceWorker()) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister().catch(() => undefined)));
    } catch {}
    return;
  }

  const currentMarker = `${window.location.origin}${currentPushUrl ?? "::cleanup-all-push-sw"}`;
  if (sessionStorage.getItem("__turbo_push_sw_cleanup__") === currentMarker) return;

  sessionStorage.setItem("__turbo_push_sw_cleanup__", currentMarker);

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

export async function enforceLatestAppVersion() {
  if (typeof window === "undefined") return;
  try {
    const previousVersion = localStorage.getItem("__turbo_app_version__");
    if (previousVersion && previousVersion !== APP_VERSION && "caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key).catch(() => false)));
    }
    localStorage.setItem("__turbo_app_version__", APP_VERSION);
  } catch {}
}
