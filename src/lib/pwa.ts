export const SW_VERSION = "v18";
export const PUSH_SW_URL = `/push-sw.js?${SW_VERSION}`;

export const shouldEnableServiceWorker = () => {
  if (typeof window === "undefined") return false;

  const { hostname } = window.location;
  const isLovablePreview = hostname.endsWith(".lovable.app") && hostname.includes("--");

  return !isLovablePreview;
};
