import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const STATUS_MESSAGES: Record<string, string> = {
  accepted: "✅ Seu pedido foi aceito!",
  preparing: "👨‍🍳 Seu pedido está sendo preparado!",
  ready: "🎉 Seu pedido está pronto!",
  delivering: "🛵 Seu pedido saiu para entrega!",
  delivered: "📦 Pedido entregue! Bom apetite!",
  cancelled: "❌ Seu pedido foi cancelado.",
};

/**
 * Listens to order status changes via Supabase Realtime and sends
 * push notifications to affected users automatically.
 * Should be used in admin context (Dashboard/Layout).
 */
export function useOrderStatusNotifier() {
  const lastStatusRef = useRef<Record<string, string>>({});

  useEffect(() => {
    const channel = supabase
      .channel("order-status-push")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        async (payload) => {
          const order = payload.new as any;
          const oldStatus = (payload.old as any)?.status;
          const newStatus = order.status;

          if (!newStatus || newStatus === oldStatus) return;

          const message = STATUS_MESSAGES[newStatus];
          if (!message) return;

          // Avoid duplicate sends for same order+status
          const key = `${order.id}_${newStatus}`;
          if (lastStatusRef.current[key]) return;
          lastStatusRef.current[key] = newStatus;

          try {
            await supabase.functions.invoke("push-notification", {
              body: {
                action: "send",
                title: `Pedido #${String(order.order_number).padStart(5, "0")}`,
                body: message,
                icon: "/favicon.ico",
                target_type: "selected",
                target_ids: [order.user_id],
                sent_by: order.user_id, // system-triggered
              },
            });
          } catch (err) {
            console.error("[Push] Status notify error:", err);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}
