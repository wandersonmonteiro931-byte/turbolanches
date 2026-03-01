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
 */
export function useOrderStatusNotifier() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);
  const sentKeysRef = useRef<Set<string>>(new Set());
  const orderStatusCache = useRef<Map<string, string>>(new Map());

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

  // Track last known status per order to detect real changes

  useEffect(() => {
    if (!adminChecked || !isAdmin || !user) return;

    const channel = supabase
      .channel("order-status-push")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        async (payload) => {
          const order = payload.new as any;
          const newStatus = order.status;
          if (!newStatus) return;

          // Use local cache to detect REAL status changes
          // (payload.old.status is unreliable without REPLICA IDENTITY FULL)
          const cachedStatus = orderStatusCache.current.get(order.id);
          orderStatusCache.current.set(order.id, newStatus);

          // Skip if status hasn't actually changed
          if (cachedStatus === newStatus) return;

          // Skip "pending" — not a meaningful customer notification
          // (PIX orders start as "pending" and get updated with pix fields while still "pending")
          if (newStatus === "pending") return;

          // For "ready" status, use delivery-type-specific template
          const deliveryType = order.delivery_type;
          const isPickup = deliveryType === "pickup" || deliveryType === "retirada";
          let triggerKey = newStatus;
          if (newStatus === "ready") {
            triggerKey = isPickup ? "ready_pickup" : "ready_delivery";
          }

          // Dedup key per order+status in this session
          const dedupKey = `${order.id}_${triggerKey}`;
          if (sentKeysRef.current.has(dedupKey)) return;
          sentKeysRef.current.add(dedupKey);

          // Fetch templates fresh each time to reflect admin edits
          const { data: templates } = await supabase
            .from("push_templates")
            .select("trigger_status, title, body, active");

          const template = (templates as PushTemplate[] | null)?.find(
            (t) => t.trigger_status === triggerKey && t.active
          );
          if (!template) return;

          // Server-side dedup: check if already sent for this order+status
          const orderNumber = String(order.order_number).padStart(5, "0");
          const { data: existing } = await supabase
            .from("push_notifications")
            .select("id")
            .contains("target_ids", [order.user_id])
            .ilike("title", `%${orderNumber}%`)
            .limit(1);

          if (existing && existing.length > 0) {
            console.log("[Push] Already sent for order", orderNumber, "— skipping");
            return;
          }

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

          const title = template.title
            .replace(/\{nome\}/g, customerName)
            .replace(/\{pedido\}/g, orderNumber);
          const body = template.body
            .replace(/\{nome\}/g, customerName)
            .replace(/\{pedido\}/g, orderNumber);

          try {
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
          } catch (err) {
            console.error("[Push] Status notify error:", err);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin, adminChecked, user]);
}