import "./index.css";
import { createRoot } from "react-dom/client";
import { cleanupLegacyPushServiceWorkers, PUSH_SW_URL, shouldEnableServiceWorker } from "@/lib/pwa";
import App from "./App.tsx";

declare global {
  interface Window {
    __LOVA_FIX_TRIGGER__?: boolean;
  }
}

type FixTriggerTarget = typeof globalThis & {
  __LOVA_FIX_TRIGGER__?: boolean;
};

const bootstrapFixTrigger = () => {
  const targets = [
    typeof globalThis !== "undefined" ? (globalThis as FixTriggerTarget) : null,
    typeof window !== "undefined" ? (window as FixTriggerTarget) : null,
    typeof self !== "undefined" ? (self as FixTriggerTarget) : null,
  ].filter(Boolean) as FixTriggerTarget[];

  for (const target of targets) {
    if (typeof target.__LOVA_FIX_TRIGGER__ === "undefined") {
      target.__LOVA_FIX_TRIGGER__ = false;
    }
  }

  const rootTarget = typeof globalThis !== "undefined" ? (globalThis as FixTriggerTarget) : null;
  if (!rootTarget) return;

  try {
    Object.defineProperty(rootTarget, "__LOVA_FIX_TRIGGER__", {
      configurable: true,
      writable: true,
      value: rootTarget.__LOVA_FIX_TRIGGER__ ?? false,
    });
  } catch {}
};

bootstrapFixTrigger();

const enableServiceWorker = shouldEnableServiceWorker();

void cleanupLegacyPushServiceWorkers(enableServiceWorker ? PUSH_SW_URL : null);

if (enableServiceWorker && "serviceWorker" in navigator) {
  navigator.serviceWorker
    .register(PUSH_SW_URL, {
      scope: "/",
      updateViaCache: "none",
    })
    .catch(() => {});
}

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
