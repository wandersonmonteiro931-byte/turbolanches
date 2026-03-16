import "./index.css";

declare global {
  var __LOVA_FIX_TRIGGER__: boolean | undefined;
}

try {
  globalThis.__LOVA_FIX_TRIGGER__ = false;
} catch {
  // noop
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/push-sw.js", { scope: "/" }).catch(() => {});
}

async function bootstrap() {
  const rootEl = document.getElementById("root");
  if (!rootEl) return;

  const [{ createRoot }, { default: App }] = await Promise.all([
    import("react-dom/client"),
    import("./App.tsx"),
  ]);

  createRoot(rootEl).render(<App />);
}

void bootstrap();
