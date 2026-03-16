import { useState, useEffect } from "react";
import { Bell, X } from "lucide-react";

interface NotificationGateProps {
  children: React.ReactNode;
}

const isIOS = () =>
  (/iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

const getInitialPermission = (): NotificationPermission | "unsupported" => {
  if (isIOS()) return "unsupported";
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported";
  return Notification.permission;
};

const PUSH_SW_URL = "/push-sw.js?v=8";

const NotificationGate = ({ children }: NotificationGateProps) => {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(getInitialPermission);
  const [dismissed, setDismissed] = useState(false);
  const [registering, setRegistering] = useState(false);

  const requestPermission = async () => {
    setRegistering(true);
    try {
      // Register service worker first
      if ("serviceWorker" in navigator) {
        await navigator.serviceWorker.register("/push-sw.js", { scope: "/" });
      }
      const result = await Notification.requestPermission();
      setPermission(result);
    } catch (err) {
      console.error("[Push] Permission error:", err);
    } finally {
      setRegistering(false);
    }
  };

  // Show gate only if not granted and not dismissed
  if (
    permission === "default" &&
    !dismissed &&
    "Notification" in window
  ) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4">
        <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-2xl">
          <div className="flex justify-end">
            <button onClick={() => setDismissed(true)} className="text-muted-foreground">
              <X size={20} />
            </button>
          </div>
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Bell size={32} className="text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Ativar Notificações</h2>
            <p className="text-sm text-muted-foreground">
              Receba atualizações em tempo real sobre seus pedidos! Saiba quando seu pedido estiver sendo preparado, pronto e saindo para entrega.
            </p>
            <button
              onClick={requestPermission}
              disabled={registering}
              className="w-full rounded-xl bg-primary py-3 font-bold text-primary-foreground transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {registering ? "Ativando..." : "Permitir Notificações"}
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="text-sm text-muted-foreground underline"
            >
              Agora não
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default NotificationGate;
