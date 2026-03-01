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
 * Variables: {nome} = customer name, {pedido} = order number formatted.
 * v2 - robust dedup with processingRef mutex
 */
export function useOrderStatusNotifier() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);
  const sentKeysRef = useRef<Set<string>>(new Set());
  const orderStatusCache = useRef<Map<string, string>>(new Map());
  const processingRef = useRef<Set<string>>(new Set());

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
        async (payload) => {
          const order = payload.new as any;
          const newStatus = order.status;
          if (!newStatus) return;

          // Use local cache to detect REAL status changes
          const cachedStatus = orderStatusCache.current.get(order.id);
          orderStatusCache.current.set(order.id, newStatus);

          // Skip if status hasn't actually changed
          if (cachedStatus === newStatus) return;

          // Skip "pending" — not a meaningful customer notification
          if (newStatus === "pending") return;

          // For "ready" status, use delivery-type-specific template
          const deliveryType = order.delivery_type;
          const isPickup = deliveryType === "pickup" || deliveryType === "retirada";
          let triggerKey = newStatus;
          if (newStatus === "ready") {
            triggerKey = isPickup ? "ready_pickup" : "ready_delivery";
          }

          // Dedup: mutex + sent check (prevents race between duplicate realtime events)
          const dedupKey = `${order.id}_${triggerKey}`;
          if (sentKeysRef.current.has(dedupKey) || processingRef.current.has(dedupKey)) return;
          processingRef.current.add(dedupKey);

          try {
            // Fetch templates fresh each time to reflect admin edits
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
                sent_by: user.id,
              },
            });

            // Mark as sent AFTER successful send
            sentKeysRef.current.add(dedupKey);
          } catch (err) {
            console.error("[Push] Status notify error:", err);
          } finally {
            processingRef.current.delete(dedupKey);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin, adminChecked, user]);
}
