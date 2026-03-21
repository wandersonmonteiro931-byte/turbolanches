import "./index.css";
import { createRoot } from "react-dom/client";
import { cleanupLegacyPushServiceWorkers, PUSH_SW_URL, shouldEnableServiceWorker } from "@/lib/pwa";
import App from "./App.tsx";

declare global {
  interface Window {
    __LOVA_FIX_TRIGGER__?: boolean;
  }

  var __LOVA_FIX_TRIGGER__: boolean | undefined;
}

if (typeof globalThis !== "undefined" && typeof globalThis.__LOVA_FIX_TRIGGER__ === "undefined") {
  globalThis.__LOVA_FIX_TRIGGER__ = false;
}

if (typeof window !== "undefined" && typeof window.__LOVA_FIX_TRIGGER__ === "undefined") {
  window.__LOVA_FIX_TRIGGER__ = false;
}

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
