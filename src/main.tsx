import { createRoot } from "react-dom/client";
import "./index.css";

// Defensive fallback for transient runtime probes
try {
  Object.defineProperty(globalThis, "__LOVA_FIX_TRIGGER__", {
    value: false,
    writable: true,
    configurable: true,
  });
} catch {
  (globalThis as any).__LOVA_FIX_TRIGGER__ = false;
}

const suppressLova = (msg: string) => msg.includes("__LOVA_FIX_TRIGGER__");

window.addEventListener("unhandledrejection", (e) => {
  const m = e.reason instanceof Error ? e.reason.message : String(e.reason ?? "");
  if (suppressLova(m)) e.preventDefault();
});

window.addEventListener("error", (e) => {
  if (suppressLova(e.message || "")) e.preventDefault();
});

// Register service worker early for PWA installability
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/push-sw.js", { scope: "/" }).catch(() => {});
}

const root = createRoot(document.getElementById("root")!);
void import("./App.tsx").then(({ default: App }) => {
  root.render(<App />);
});
