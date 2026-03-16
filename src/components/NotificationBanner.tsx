import { useState, useEffect, useCallback } from "react";
import { Bell, X, Download } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";

const PUSH_SW_URL = "/push-sw.js?v11";
const INTERVAL_MS = 60_000;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData, (c) => c.charCodeAt(0));
}

const isIOSDevice = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as any).standalone === true;

const NotificationBanner = () => {
  const [visible, setVisible] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [iosNeedsPWA, setIosNeedsPWA] = useState(false);

  const shouldShow = useCallback(() => {
    // iOS outside PWA — no Notification API, but we still want to show a message
    if (isIOSDevice() && !isStandalone()) return true;

    if (!("Notification" in window) || !("serviceWorker" in navigator)) return false;
    return Notification.permission === "default";
  }, []);

  useEffect(() => {
    if (!shouldShow()) return;

    const show = () => {
      if (!shouldShow()) return;
      // On admin/kitchen routes, skip
      const path = window.location.pathname;
      if (path.startsWith("/admin") || path.startsWith("/cozinha")) return;

      if (isIOSDevice() && !isStandalone()) {
        setIosNeedsPWA(true);
      } else {
        setIosNeedsPWA(false);
      }
      setVisible(true);
    };

    const initialTimer = setTimeout(show, 5000);
    const interval = setInterval(show, INTERVAL_MS);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [shouldShow]);

  const requestPermission = async () => {
    setRegistering(true);
    try {
      if ("serviceWorker" in navigator) {
        await navigator.serviceWorker.register(PUSH_SW_URL, {
          scope: "/",
          updateViaCache: "none",
        });
      }

      const result = await Notification.requestPermission();

      if (result === "granted") {
        await subscribeToPush();
      }

      setVisible(false);
    } catch (err) {
      console.error("[Push] Permission error:", err);
    } finally {
      setRegistering(false);
    }
  };

  const subscribeToPush = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const pushManager = (registration as any).pushManager;
      if (!pushManager) return;

      const { data: vapidData } = await supabase.functions.invoke("push-notification", {
        body: { action: "get_vapid_public_key" },
      });
      if (!vapidData?.public_key) return;

      const applicationServerKey = urlBase64ToUint8Array(vapidData.public_key);

      let subscription = await pushManager.getSubscription();
      const storedVapid = localStorage.getItem("push_vapid_key");
      if (subscription && storedVapid !== vapidData.public_key) {
        try { await subscription.unsubscribe(); } catch {}
        subscription = null;
      }

      if (!subscription) {
        subscription = await pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      }

      localStorage.setItem("push_vapid_key", vapidData.public_key);

      const subJson = subscription.toJSON();
      await supabase.functions.invoke("push-notification", {
        body: {
          action: "subscribe",
          endpoint: subJson.endpoint,
          p256dh: subJson.keys?.p256dh,
          auth: subJson.keys?.auth,
        },
      });

      console.log("[Push] Subscription registered successfully");
    } catch (err) {
      console.error("[Push] Subscription error:", err);
    }
  };

  const dismiss = () => setVisible(false);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-6"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
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
                {iosNeedsPWA ? (
                  <Download size={32} className="text-primary" />
                ) : (
                  <Bell size={32} className="text-primary" />
                )}
              </div>

              {iosNeedsPWA ? (
                <>
                  <h2 className="text-xl font-bold text-foreground">
                    Instale para receber notificações! 🔔
                  </h2>
                  <div className="text-sm text-muted-foreground space-y-2">
                    <p>No iPhone, as notificações só funcionam com o app instalado na tela inicial.</p>
                    <p>1. Toque no botão <strong>Compartilhar</strong> (ícone ↑) na barra do Safari</p>
                    <p>2. Selecione <strong>"Adicionar à Tela de Início"</strong></p>
                    <p>3. Abra o app e ative as notificações!</p>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-bold text-foreground">Ative as Notificações! 🔔</h2>
                  <p className="text-sm text-muted-foreground">
                    Receba atualizações em tempo real sobre seus pedidos, promoções e avisos! Saiba quando seu pedido estiver sendo preparado, pronto e saindo para entrega.
                  </p>
                  <button
                    onClick={requestPermission}
                    disabled={registering}
                    className="w-full rounded-xl bg-primary py-3 font-bold text-primary-foreground transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    {registering ? "Ativando..." : "Permitir Notificações"}
                  </button>
                </>
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

export default NotificationBanner;
