export const SW_VERSION = "v43";
export const PUSH_SW_URL = `/push-sw.js?${SW_VERSION}`;

export const shouldEnableServiceWorker = () => {
  if (typeof window === "undefined") return false;

  const { hostname } = window.location;
  const isLovablePreview = hostname.endsWith(".lovable.app") && hostname.includes("--");
  const isLovableProjectPreview = hostname.endsWith(".lovableproject.com");

  return !(isLovablePreview || isLovableProjectPreview);
};

export async function cleanupLegacyPushServiceWorkers(currentPushUrl?: string | null) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

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
