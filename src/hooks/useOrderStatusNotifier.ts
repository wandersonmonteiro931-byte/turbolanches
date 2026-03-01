import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface PushTemplate {
  trigger_status: string;
  title: string;
  body: string;
  active: boolean;
}

/**
 * Listens to order status changes via Supabase Realtime and sends
 * push notifications using configurable templates from push_templates table.
 * Variables: {nome} = customer name, {pedido} = order number formatted.
 */
export function useOrderStatusNotifier() {
  const lastStatusRef = useRef<Record<string, string>>({});
  const templatesRef = useRef<PushTemplate[]>([]);

  // Load templates once
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("push_templates")
        .select("trigger_status, title, body, active");
      if (data) templatesRef.current = data as PushTemplate[];
    };
    load();
  }, []);

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

          // Find matching template
          const template = templatesRef.current.find(
            (t) => t.trigger_status === newStatus && t.active
          );
          if (!template) return;

          // Avoid duplicate sends
          const key = `${order.id}_${newStatus}`;
          if (lastStatusRef.current[key]) return;
          lastStatusRef.current[key] = newStatus;

          // Get customer name
          let customerName = "Cliente";
          try {
            const { data: profile } = await supabase
              .from("profiles")
              .select("full_name")
              .eq("user_id", order.user_id)
              .single();
            if (profile?.full_name) {
              customerName = profile.full_name.split(" ")[0]; // First name
            }
          } catch {}

          const orderNumber = String(order.order_number).padStart(5, "0");

          // Replace variables
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
                sent_by: order.user_id,
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
