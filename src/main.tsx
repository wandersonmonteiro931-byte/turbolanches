import "./index.css";
import { createRoot } from "react-dom/client";
import { cleanupLegacyPushServiceWorkers, PUSH_SW_URL, shouldEnableServiceWorker } from "@/lib/pwa";
import App from "./App.tsx";

declare global {
  var __LOVA_FIX_TRIGGER__: boolean | undefined;

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
    try {
      Object.defineProperty(target, "__LOVA_FIX_TRIGGER__", {
        configurable: true,
        writable: true,
        value: target.__LOVA_FIX_TRIGGER__ ?? false,
      });
    } catch {
      target.__LOVA_FIX_TRIGGER__ = target.__LOVA_FIX_TRIGGER__ ?? false;
    }
  }

  if (typeof globalThis === "undefined") return;

  globalThis.__LOVA_FIX_TRIGGER__ = globalThis.__LOVA_FIX_TRIGGER__ ?? false;

  try {
    (0, eval)("var __LOVA_FIX_TRIGGER__ = globalThis.__LOVA_FIX_TRIGGER__ ?? false;");
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
