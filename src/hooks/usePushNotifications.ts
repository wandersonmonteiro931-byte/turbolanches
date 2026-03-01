/// <reference lib="webworker" />
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export function usePushNotifications(userId: string | undefined) {
  const subscribedRef = useRef(false);

  useEffect(() => {
    if (!userId || subscribedRef.current) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    const setup = async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const pushManager = (registration as any).pushManager;
        if (!pushManager) return;
        const { data: vapidData } = await supabase.functions.invoke("push-notification", {
          body: { action: "get_vapid_public_key" },
        });
        if (!vapidData?.public_key) return;

        const serverVapidKey = vapidData.public_key;
        const applicationServerKey = urlBase64ToUint8Array(serverVapidKey);

        let subscription = await pushManager.getSubscription();
        const storedVapid = localStorage.getItem("push_vapid_key");
        if (subscription && storedVapid !== serverVapidKey) {
          try { await subscription.unsubscribe(); } catch {}
          subscription = null;
        }

        if (!subscription) {
          subscription = await pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey,
          });
        }

        localStorage.setItem("push_vapid_key", serverVapidKey);
        const subJson = subscription.toJSON();
        await supabase.functions.invoke("push-notification", {
          body: {
            action: "subscribe",
            endpoint: subJson.endpoint,
            p256dh: subJson.keys?.p256dh,
            auth: subJson.keys?.auth,
          },
        });
        subscribedRef.current = true;
      } catch (err) {
        console.error("[Push] Setup error:", err);
      }
    };

    setTimeout(setup, 2000);
  }, [userId]);
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData, (c) => c.charCodeAt(0));
}
