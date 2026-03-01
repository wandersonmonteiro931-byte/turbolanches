import { useState, useEffect, useCallback } from "react";
import { Bell, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const INTERVAL_MS = 60_000;

const NotificationBanner = () => {
  const [visible, setVisible] = useState(false);
  const [registering, setRegistering] = useState(false);

  const shouldShow = useCallback(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return false;
    return Notification.permission === "default";
  }, []);

  useEffect(() => {
    if (!shouldShow()) return;

    // Show after 5s on first load
    const initialTimer = setTimeout(() => {
      if (shouldShow()) setVisible(true);
    }, 5000);

    // Then every 60s
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
      if ("serviceWorker" in navigator) {
        await navigator.serviceWorker.register("/push-sw.js", { scope: "/" });
      }
      const result = await Notification.requestPermission();
      if (result === "granted" || result === "denied") {
        setVisible(false);
      }
    } catch (err) {
      console.error("[Push] Permission error:", err);
    } finally {
      setRegistering(false);
    }
  };

  const dismiss = () => setVisible(false);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed bottom-20 left-3 right-3 z-[9999] rounded-2xl border border-border bg-card p-4 shadow-2xl"
        >
          <button
            onClick={dismiss}
            className="absolute right-3 top-3 text-muted-foreground"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>

          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Bell size={20} className="text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-foreground">
                Ative as notificações! 🔔
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Receba atualizações do seu pedido, promoções e avisos em tempo real.
              </p>
              <button
                onClick={requestPermission}
                disabled={registering}
                className="mt-2.5 w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {registering ? "Ativando..." : "Permitir Notificações"}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default NotificationBanner;
