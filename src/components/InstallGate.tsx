import { useState, useEffect, useCallback, useRef } from "react";
import { Download, X, Share, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const ANDROID_INTERVAL_MS = 5 * 60_000;
const IOS_INTERVAL_MS = 3 * 60_000;

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as any).standalone === true;

const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

// Store the event globally so it survives React re-renders
let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;

// Capture before React even mounts
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  globalDeferredPrompt = e as BeforeInstallPromptEvent;
  console.log("[InstallGate] beforeinstallprompt captured globally");
});

const InstallGate = () => {
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [iosMode, setIosMode] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;

    // Also listen inside the component for late-arriving events
    const handler = (e: Event) => {
      e.preventDefault();
      globalDeferredPrompt = e as BeforeInstallPromptEvent;
      console.log("[InstallGate] beforeinstallprompt captured in component");
    };
    window.addEventListener("beforeinstallprompt", handler);

    const ios = isIOS();
    const intervalMs = ios ? IOS_INTERVAL_MS : ANDROID_INTERVAL_MS;

    const show = () => {
      if (isStandalone()) return;
      const path = window.location.pathname;
      if (path.startsWith("/admin") || path.startsWith("/cozinha")) return;
      setIosMode(isIOS());
      setVisible(true);
    };

    const initialTimer = setTimeout(show, 5000);
    const interval = setInterval(show, intervalMs);

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
      globalDeferredPrompt = null;
    };
    window.addEventListener("appinstalled", handler);
    return () => window.removeEventListener("appinstalled", handler);
  }, []);

  const handleInstall = useCallback(async () => {
    console.log("[InstallGate] Baixar clicked, prompt available:", !!globalDeferredPrompt);
    
    if (!globalDeferredPrompt) {
      // Fallback: no prompt available, guide user manually
      alert(
        "Para instalar o app:\n\n" +
        "1. Toque no menu ⋮ (três pontinhos) do Chrome\n" +
        "2. Selecione \"Adicionar à tela inicial\"\n" +
        "3. Toque em \"Adicionar\""
      );
      return;
    }

    setInstalling(true);
    try {
      await globalDeferredPrompt.prompt();
      const { outcome } = await globalDeferredPrompt.userChoice;
      console.log("[InstallGate] User choice:", outcome);
      if (outcome === "accepted") {
        setVisible(false);
      }
    } catch (err) {
      console.error("[InstallGate] Install error:", err);
    } finally {
      setInstalling(false);
      globalDeferredPrompt = null;
    }
  }, []);

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
                Instale o app Turbo Lanches!
              </h2>

              <p className="text-sm text-muted-foreground">
                Instalando você garante todas as notificações e fica sabendo primeiro das promoções exclusivas!
              </p>

              {iosMode && (
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>Para instalar no seu iPhone/iPad:</p>
                  <p>
                    1. Toque no botão <strong>Compartilhar</strong>{" "}
                    <Share size={14} className="inline text-primary" /> na barra inferior do Safari
                  </p>
                  <p>
                    2. Role e toque em <strong>"Adicionar à Tela de Início"</strong>
                  </p>
                  <p>
                    3. Toque em <strong>"Adicionar"</strong> no canto superior direito
                  </p>
                </div>
              )}

              <div className="flex items-center justify-center gap-2 text-xs text-green-600">
                <ShieldCheck size={16} />
                <span>100% seguro e criptografado.</span>
              </div>

              {!iosMode && (
                <button
                  onClick={handleInstall}
                  disabled={installing}
                  className="w-full rounded-xl bg-primary py-3 font-bold text-primary-foreground transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {installing ? "Baixando..." : "Baixar"}
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
