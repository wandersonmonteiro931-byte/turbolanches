// force HMR refresh - v3
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface PushTemplate {
  trigger_status: string;
  title: string;
  body: string;
  active: boolean;
}

/**
 * Listens to order status changes via Supabase Realtime and sends
 * push notifications using configurable templates from push_templates table.
 * Only runs for admin users to prevent duplicate sends from multiple clients.
 * v3 - debounce per order to coalesce rapid-fire realtime events
 */
export function useOrderStatusNotifier() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);
  const sentKeysRef = useRef<Set<string>>(new Set());
  const pendingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      setAdminChecked(true);
      return;
    }
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .then(({ data }) => {
        setIsAdmin((data?.length ?? 0) > 0);
        setAdminChecked(true);
      });
  }, [user]);

  useEffect(() => {
    if (!adminChecked || !isAdmin || !user) return;

    const channelName = `order-status-push-${user.id}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload) => {
          const order = payload.new as any;
          const newStatus = order.status;
          if (!newStatus || newStatus === "pending") return;

          // Debounce: coalesce multiple rapid events for the same order
          // into a single notification send (waits 500ms for events to settle)
          const orderId = order.id;
          const existingTimer = pendingTimers.current.get(orderId);
          if (existingTimer) clearTimeout(existingTimer);

          pendingTimers.current.set(
            orderId,
            setTimeout(() => {
              pendingTimers.current.delete(orderId);
              processOrderNotification(order, newStatus, user.id);
            }, 500)
          );
        }
      )
      .subscribe();

    const processOrderNotification = async (
      order: any,
      newStatus: string,
      adminUserId: string
    ) => {
      // For "ready" status, use delivery-type-specific template
      const deliveryType = order.delivery_type;
      const isPickup = deliveryType === "pickup" || deliveryType === "retirada";
      let triggerKey = newStatus;
      if (newStatus === "ready") {
        triggerKey = isPickup ? "ready_pickup" : "ready_delivery";
      }

      // Dedup: skip if already sent in this session
      const dedupKey = `${order.id}_${triggerKey}`;
      if (sentKeysRef.current.has(dedupKey)) return;
      sentKeysRef.current.add(dedupKey); // Mark immediately to block duplicates

      try {
        // Fetch templates
        const { data: templates } = await supabase
          .from("push_templates")
          .select("trigger_status, title, body, active");

        const template = (templates as PushTemplate[] | null)?.find(
          (t) => t.trigger_status === triggerKey && t.active
        );
        if (!template) return;

        // Get customer name
        let customerName = "Cliente";
        try {
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("user_id", order.user_id)
            .maybeSingle();
          if (profile?.full_name) {
            customerName = profile.full_name.split(" ")[0];
          }
        } catch {}

        const orderNumber = String(order.order_number).padStart(5, "0");

        const title = template.title
          .replace(/\{nome\}/g, customerName)
          .replace(/\{pedido\}/g, orderNumber);
        const body = template.body
          .replace(/\{nome\}/g, customerName)
          .replace(/\{pedido\}/g, orderNumber);

        await supabase.functions.invoke("push-notification", {
          body: {
            action: "send",
            title,
            body,
            icon: "/favicon.ico",
            target_type: "selected",
            target_ids: [order.user_id],
            sent_by: adminUserId,
          },
        });

        console.log(`[Push] Sent ${triggerKey} for order ${orderNumber}`);
      } catch (err) {
        console.error("[Push] Status notify error:", err);
        // Remove from sent so it can be retried
        sentKeysRef.current.delete(dedupKey);
      }
    };

    return () => {
      supabase.removeChannel(channel);
      // Clear pending timers
      for (const timer of pendingTimers.current.values()) {
        clearTimeout(timer);
      }
      pendingTimers.current.clear();
    };
  }, [isAdmin, adminChecked, user]);
}
