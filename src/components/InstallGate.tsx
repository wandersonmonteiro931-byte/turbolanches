import { useState, useEffect, useCallback } from "react";
import { Download, X, Share } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const INTERVAL_MS = 5 * 60_000; // 5 minutes

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as any).standalone === true;

const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

const InstallGate = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [iosMode, setIosMode] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;

    // Capture the beforeinstallprompt (Chrome/Edge/Android)
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // Show modal after 5s initially, then every 5 minutes
    const show = () => {
      if (isStandalone()) return;
      // Don't show on admin/kitchen routes
      const path = window.location.pathname;
      if (path.startsWith("/admin") || path.startsWith("/cozinha")) return;
      setIosMode(isIOS());
      setVisible(true);
    };

    const initialTimer = setTimeout(show, 5000);
    const interval = setInterval(show, INTERVAL_MS);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  // Hide when app gets installed
  useEffect(() => {
    const handler = () => {
      setVisible(false);
      setDeferredPrompt(null);
    };
    window.addEventListener("appinstalled", handler);
    return () => window.removeEventListener("appinstalled", handler);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setVisible(false);
      }
    } catch {
      // ignore
    } finally {
      setInstalling(false);
      setDeferredPrompt(null);
    }
  }, [deferredPrompt]);

  const dismiss = () => setVisible(false);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[9998] flex items-end justify-center bg-black/60 p-4 sm:items-center"
        >
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-2xl"
          >
            <div className="flex justify-end">
              <button onClick={dismiss} className="text-muted-foreground" aria-label="Fechar">
                <X size={20} />
              </button>
            </div>
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                {iosMode ? (
                  <Share size={32} className="text-primary" />
                ) : (
                  <Download size={32} className="text-primary" />
                )}
              </div>
              <h2 className="text-xl font-bold text-foreground">
                Instale o Turbo Lanches! 🍔
              </h2>

              {iosMode ? (
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>Para instalar no seu iPhone/iPad:</p>
                  <p>
                    1. Toque no botão <strong>Compartilhar</strong>{" "}
                    <Share size={14} className="inline text-primary" /> na barra do Safari
                  </p>
                  <p>
                    2. Selecione <strong>"Adicionar à Tela de Início"</strong>
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Adicione à sua tela inicial para pedir com mais rapidez, receber notificações e ter uma experiência completa!
                </p>
              )}

              {!iosMode && deferredPrompt && (
                <button
                  onClick={handleInstall}
                  disabled={installing}
                  className="w-full rounded-xl bg-primary py-3 font-bold text-primary-foreground transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {installing ? "Instalando..." : "Instalar App"}
                </button>
              )}
              <button
                onClick={dismiss}
                className="text-sm text-muted-foreground underline"
              >
                Agora não
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default InstallGate;
