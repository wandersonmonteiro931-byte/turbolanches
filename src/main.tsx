import { createRoot } from "react-dom/client";
import "./index.css";

// Defensive fallback for transient runtime probes
if (typeof (globalThis as any).__LOVA_FIX_TRIGGER__ === "undefined") {
  Object.defineProperty(globalThis, "__LOVA_FIX_TRIGGER__", {
    value: false,
    writable: true,
    configurable: true,
  });
}

window.addEventListener("unhandledrejection", (event) => {
  const message = event.reason instanceof Error ? event.reason.message : String(event.reason ?? "");
  if (message.includes("__LOVA_FIX_TRIGGER__ is not defined")) {
    event.preventDefault();
  }
});

// Register service worker early for PWA installability
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/push-sw.js", { scope: "/" }).catch(() => {});
}

const root = createRoot(document.getElementById("root")!);
void import("./App.tsx").then(({ default: App }) => {
  root.render(<App />);
});
