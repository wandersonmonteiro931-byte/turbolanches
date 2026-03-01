import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Register service worker early for PWA installability
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/push-sw.js", { scope: "/" }).catch(() => {});
}

createRoot(document.getElementById("root")!).render(<App />);
