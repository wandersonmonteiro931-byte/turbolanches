import "./index.css";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";

// Register service worker for push notifications
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("/push-sw.js?v11", {
      scope: "/",
      updateViaCache: "none",
    })
    .catch(() => {});
}

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
