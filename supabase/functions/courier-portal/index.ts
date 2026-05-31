// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const { action, code, courier_id, order_id } = body || {};
    if (!action) return json({ error: "action obrigatório" }, 400);

    // LOGIN does not require courier_id (lookup by code)
    if (action === "login") {
      if (!code) return json({ error: "Código obrigatório" }, 400);
      const normalized = String(code).trim().toUpperCase();
      const { data } = await admin
        .from("couriers")
        .select("id, name, fixed_fee, code, store_id, active")
        .eq("code", normalized)
        .eq("active", true)
        .maybeSingle();
      if (!data) return json({ error: "Código inválido ou inativo" }, 401);
      return json({
        courier: {
          id: data.id,
          name: data.name,
          fixed_fee: Number(data.fixed_fee),
          code: data.code,
          store_id: data.store_id,
        },
      });
    }

    // All other actions require (courier_id, code) and validate they match
    if (!courier_id || !code) return json({ error: "Credenciais inválidas" }, 400);
    const { data: courier } = await admin
      .from("couriers")
      .select("id, name, fixed_fee, code, store_id, active")
      .eq("id", courier_id)
      .maybeSingle();
    if (
      !courier ||
      !courier.active ||
      String(courier.code).toUpperCase() !== String(code).trim().toUpperCase()
    ) {
      return json({ error: "Não autorizado" }, 401);
    }

    if (action === "restore") {
      return json({
        courier: {
          id: courier.id,
          name: courier.name,
          fixed_fee: Number(courier.fixed_fee),
          code: courier.code,
          store_id: courier.store_id,
        },
      });
    }

    if (action === "daily_fees") {
      const { data } = await admin
        .from("courier_daily_fees")
        .select("day_of_week, fixed_fee")
        .eq("courier_id", courier.id);
      return json({
        fees: (data ?? []).map((d: any) => ({
          day_of_week: d.day_of_week,
          fixed_fee: Number(d.fixed_fee),
        })),
      });
    }

    if (action === "orders") {
      const { scope, start, end } = body;
      const cols =
        "id, order_number, address_street, address_number, address_neighborhood, address_complement, delivery_fee, status, delivering_at, delivered_at, created_at";
      if (scope === "pending") {
        const { data } = await admin
          .from("orders")
          .select(cols)
          .eq("courier_id", courier.id)
          .eq("status", "delivering")
          .order("delivering_at", { ascending: true });
        return json({ orders: data ?? [] });
      }
      if (scope === "today") {
        const { data: activeData } = await admin
          .from("orders")
          .select(cols)
          .eq("courier_id", courier.id)
          .eq("status", "delivering");
        let q = admin
          .from("orders")
          .select(cols)
          .eq("courier_id", courier.id)
          .eq("status", "delivered")
          .not("delivered_at", "is", null);
        if (start) q = q.gte("delivered_at", start);
        if (end) q = q.lte("delivered_at", end);
        const { data: doneData } = await q.order("delivered_at", { ascending: false });
        const combined = [...(activeData ?? []), ...(doneData ?? [])];
        const seen = new Set<string>();
        const unique = combined.filter((o: any) => {
          if (seen.has(o.id)) return false;
          seen.add(o.id);
          return true;
        });
        return json({ orders: unique });
      }
      if (scope === "history") {
        const since = new Date();
        since.setDate(since.getDate() - 30);
        const { data } = await admin
          .from("orders")
          .select(cols)
          .eq("courier_id", courier.id)
          .eq("status", "delivered")
          .gte("created_at", since.toISOString())
          .order("created_at", { ascending: false })
          .limit(200);
        return json({ orders: data ?? [] });
      }
      return json({ error: "scope inválido" }, 400);
    }

    if (action === "not_delivered") {
      if (!order_id) return json({ error: "order_id obrigatório" }, 400);
      // Verify order belongs to this courier and is delivering
      const { data: order } = await admin
        .from("orders")
        .select("id, courier_id, status")
        .eq("id", order_id)
        .maybeSingle();
      if (!order || order.courier_id !== courier.id || order.status !== "delivering") {
        return json({ error: "Pedido inválido" }, 400);
      }
      const { error } = await admin
        .from("orders")
        .update({ status: "ready", delivering_at: null, courier_id: null })
        .eq("id", order_id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    return json({ error: "Ação inválida" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
