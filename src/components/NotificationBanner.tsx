import { useState, useEffect, useCallback } from "react";
import { Bell, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";

const INTERVAL_MS = 60_000;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData, (c) => c.charCodeAt(0));
}

const NotificationBanner = () => {
  const [visible, setVisible] = useState(false);
  const [registering, setRegistering] = useState(false);

  const shouldShow = useCallback(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return false;
    return Notification.permission === "default";
  }, []);

  useEffect(() => {
    if (!shouldShow()) return;

    const initialTimer = setTimeout(() => {
      if (shouldShow()) setVisible(true);
    }, 5000);

    const interval = setInterval(() => {
      if (shouldShow()) setVisible(true);
    }, INTERVAL_MS);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [shouldShow]);

  const requestPermission = async () => {
    setRegistering(true);
    try {
      // Register service worker first
      if ("serviceWorker" in navigator) {
        await navigator.serviceWorker.register("/push-sw.js", { scope: "/" });
      }

      const result = await Notification.requestPermission();

      if (result === "granted") {
        // Actually subscribe to push after permission is granted
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

      // Get VAPID key from server
      const { data: vapidData } = await supabase.functions.invoke("push-notification", {
        body: { action: "get_vapid_public_key" },
      });
      if (!vapidData?.public_key) return;

      const applicationServerKey = urlBase64ToUint8Array(vapidData.public_key);

      // Unsubscribe old if vapid changed
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
                <Bell size={32} className="text-primary" />
              </div>
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
