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

const syncFixTriggerGlobalBinding = (value: boolean) => {
  const serializedValue = value ? "true" : "false";

  try {
    (0, eval)(`var __LOVA_FIX_TRIGGER__ = ${serializedValue};`);
  } catch {}

  try {
    Function(
      "value",
      `
        var nextValue = Boolean(value);
        try { globalThis.__LOVA_FIX_TRIGGER__ = nextValue; } catch (error) {}
        try { window.__LOVA_FIX_TRIGGER__ = nextValue; } catch (error) {}
        try { self.__LOVA_FIX_TRIGGER__ = nextValue; } catch (error) {}
        try { (0, eval)('var __LOVA_FIX_TRIGGER__ = ' + (nextValue ? 'true' : 'false')); } catch (error) {}
        return nextValue;
      `,
    )(value);
  } catch {}
};

const bootstrapFixTrigger = () => {
  let currentValue = false;

  const targets = [
    typeof globalThis !== "undefined" ? (globalThis as FixTriggerTarget) : null,
    typeof window !== "undefined" ? (window as FixTriggerTarget) : null,
    typeof self !== "undefined" ? (self as FixTriggerTarget) : null,
  ].filter(Boolean) as FixTriggerTarget[];

  currentValue = targets.find((target) => typeof target.__LOVA_FIX_TRIGGER__ === "boolean")?.__LOVA_FIX_TRIGGER__ ?? false;
  syncFixTriggerGlobalBinding(currentValue);

  for (const target of targets) {
    try {
      Object.defineProperty(target, "__LOVA_FIX_TRIGGER__", {
        configurable: true,
        get: () => currentValue,
        set: (nextValue) => {
          currentValue = Boolean(nextValue);
          syncFixTriggerGlobalBinding(currentValue);
        },
      });
      target.__LOVA_FIX_TRIGGER__ = currentValue;
    } catch {
      target.__LOVA_FIX_TRIGGER__ = typeof target.__LOVA_FIX_TRIGGER__ === "boolean" ? target.__LOVA_FIX_TRIGGER__ : currentValue;
      currentValue = target.__LOVA_FIX_TRIGGER__ ?? currentValue;
      syncFixTriggerGlobalBinding(currentValue);
    }
  }

  syncFixTriggerGlobalBinding(currentValue);
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
