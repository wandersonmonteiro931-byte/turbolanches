import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/useAdmin";

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
  const { isAdmin, loading: adminLoading } = useAdmin();
  const sentKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (adminLoading || !isAdmin || !user) return;

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

          // Dedup key per order+status in this session
          const dedupKey = `${order.id}_${newStatus}`;
          if (sentKeysRef.current.has(dedupKey)) return;
          sentKeysRef.current.add(dedupKey);

          // Fetch templates fresh each time to reflect admin edits
          const { data: templates } = await supabase
            .from("push_templates")
            .select("trigger_status, title, body, active");

          const template = (templates as PushTemplate[] | null)?.find(
            (t) => t.trigger_status === newStatus && t.active
          );
          if (!template) return;

          // Check if notification already sent for this order+status (server-side dedup)
          const { data: existing } = await supabase
            .from("push_notifications")
            .select("id")
            .contains("target_ids", [order.user_id])
            .ilike("title", `%${String(order.order_number).padStart(5, "0")}%`)
            .limit(1);

          // Get customer name
          let customerName = "Cliente";
          try {
            const { data: profile } = await supabase
              .from("profiles")
              .select("full_name")
              .eq("user_id", order.user_id)
              .single();
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
  }, [isAdmin, adminLoading, user]);
}