import "./index.css";
import { createRoot } from "react-dom/client";
import { cleanupLegacyPushServiceWorkers, ensureLovaFixTrigger } from "@/lib/lovableFix";
import { PUSH_SW_URL } from "@/lib/pwa";
import App from "./App.tsx";

ensureLovaFixTrigger();
void cleanupLegacyPushServiceWorkers(PUSH_SW_URL);

if ("serviceWorker" in navigator) {
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
