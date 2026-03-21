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
  let currentValue = false;

  const targets = [
    typeof globalThis !== "undefined" ? (globalThis as FixTriggerTarget) : null,
    typeof window !== "undefined" ? (window as FixTriggerTarget) : null,
    typeof self !== "undefined" ? (self as FixTriggerTarget) : null,
  ].filter(Boolean) as FixTriggerTarget[];

  currentValue = targets.find((target) => typeof target.__LOVA_FIX_TRIGGER__ === "boolean")?.__LOVA_FIX_TRIGGER__ ?? false;

  for (const target of targets) {
    try {
      Object.defineProperty(target, "__LOVA_FIX_TRIGGER__", {
        configurable: true,
        get: () => currentValue,
        set: (nextValue) => {
          currentValue = Boolean(nextValue);
        },
      });
      target.__LOVA_FIX_TRIGGER__ = currentValue;
    } catch {
      target.__LOVA_FIX_TRIGGER__ = typeof target.__LOVA_FIX_TRIGGER__ === "boolean" ? target.__LOVA_FIX_TRIGGER__ : currentValue;
      currentValue = target.__LOVA_FIX_TRIGGER__ ?? currentValue;
    }
  }
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
