import "./index.css";
import "@/lib/bootstrap";

// Suppress harmless preview-environment artifact
if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (e) => {
    if (e.reason && String(e.reason).includes("__LOVA_FIX_TRIGGER__")) {
      e.preventDefault();
    }
  });
}
import { createRoot } from "react-dom/client";
import { cleanupLegacyPushServiceWorkers, PUSH_SW_URL, shouldEnableServiceWorker } from "@/lib/pwa";
import App from "./App.tsx";

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
