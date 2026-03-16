import { useState, useEffect, useCallback } from "react";
import { Download, X, Share, ShieldCheck, MoreVertical } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const PUSH_SW_URL = "/push-sw.js?v=8";
const ANDROID_INTERVAL_MS = 5 * 60_000;
const IOS_INTERVAL_MS = 3 * 60_000;

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as any).standalone === true;

const isIOS = () =>
  (/iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

// Store globally so it survives React re-renders and HMR
let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  globalDeferredPrompt = e as BeforeInstallPromptEvent;
});

const InstallGate = () => {
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [iosMode, setIosMode] = useState(false);
  const [hasPrompt, setHasPrompt] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    // Don't show install prompt on iOS at all
    if (isIOS()) return;

    const handler = (e: Event) => {
      e.preventDefault();
      globalDeferredPrompt = e as BeforeInstallPromptEvent;
      setHasPrompt(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // Check if already captured
    if (globalDeferredPrompt) setHasPrompt(true);

    const intervalMs = ANDROID_INTERVAL_MS;

    const show = () => {
      if (isStandalone()) return;
      const path = window.location.pathname;
      if (path.startsWith("/admin") || path.startsWith("/cozinha")) return;
      setIosMode(isIOS());
      if (globalDeferredPrompt) setHasPrompt(true);
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

  useEffect(() => {
    const handler = () => {
      setVisible(false);
      globalDeferredPrompt = null;
      setHasPrompt(false);
    };
    window.addEventListener("appinstalled", handler);
    return () => window.removeEventListener("appinstalled", handler);
  }, []);

  const handleInstall = useCallback(async () => {
    if (globalDeferredPrompt) {
      setInstalling(true);
      try {
        await globalDeferredPrompt.prompt();
        const { outcome } = await globalDeferredPrompt.userChoice;
        if (outcome === "accepted") {
          setVisible(false);
        }
      } catch {
        // ignore
      } finally {
        setInstalling(false);
        globalDeferredPrompt = null;
        setHasPrompt(false);
      }
      return;
    }

    // No prompt available — force SW re-register to trigger Chrome re-evaluation
    setInstalling(true);
    try {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.unregister();
        }
        await navigator.serviceWorker.register(PUSH_SW_URL, {
          scope: "/",
          updateViaCache: "none",
        });
      }

      // Wait for Chrome to re-evaluate and fire beforeinstallprompt
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 3000);
        const onPrompt = (e: Event) => {
          e.preventDefault();
          globalDeferredPrompt = e as BeforeInstallPromptEvent;
          setHasPrompt(true);
          clearTimeout(timeout);
          window.removeEventListener("beforeinstallprompt", onPrompt);
          resolve(undefined);
        };
        window.addEventListener("beforeinstallprompt", onPrompt);
      });

      // If we got the prompt, trigger it immediately
      if (globalDeferredPrompt) {
        await globalDeferredPrompt.prompt();
        const { outcome } = await globalDeferredPrompt.userChoice;
        if (outcome === "accepted") {
          setVisible(false);
        }
        globalDeferredPrompt = null;
        setHasPrompt(false);
      }
    } catch {
      // ignore
    } finally {
      setInstalling(false);
    }
  }, []);

  const dismiss = () => setVisible(false);

  const showAndroidInstructions = !iosMode && !hasPrompt;

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

              {showAndroidInstructions && (
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>Para instalar:</p>
                  <p>
                    1. Toque no menu{" "}
                    <MoreVertical size={14} className="inline text-primary" />{" "}
                    (três pontinhos) do Chrome
                  </p>
                  <p>
                    2. Selecione <strong>"Instalar aplicativo"</strong> ou{" "}
                    <strong>"Adicionar à tela inicial"</strong>
                  </p>
                  <p>
                    3. Toque em <strong>"Instalar"</strong>
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
