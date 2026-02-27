import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * check-pix-payment — DB-first + Proxy fallback
 * 
 * 1. Check DB status first (fast, no external call)
 * 2. If still awaiting_payment AND has txid, try proxy to check EFI
 * 3. If proxy confirms payment, atomic update
 */

function getRequiredSecret(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

async function checkViaProxy(proxyUrl: string, proxySecret: string, txid: string): Promise<boolean | null> {
  try {
    const res = await fetch(`${proxyUrl}/check/${txid}`, {
      method: "GET",
      headers: {
        "x-proxy-secret": proxySecret,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Proxy check failed:", res.status, errText);
      return null;
    }

    const data = await res.json();
    console.log(`Proxy check result for ${txid}:`, data.status, "paid:", data.paid);
    return data.paid === true;
  } catch (err) {
    console.error("Proxy check error:", err instanceof Error ? err.message : err);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { order_id } = await req.json();
    if (!order_id) {
      return new Response(JSON.stringify({ error: "order_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = getRequiredSecret("SUPABASE_URL");
    const supabaseAnonKey = getRequiredSecret("SUPABASE_ANON_KEY");

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Step 1: Check DB first (fast path)
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, status, payment_method, payment_confirmed, pix_txid")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      return new Response(JSON.stringify({ error: "Order not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Already confirmed (by webhook or admin)
    if (order.status !== "awaiting_payment") {
      return new Response(
        JSON.stringify({ status: order.status, payment_confirmed: order.payment_confirmed, confirmed: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (order.payment_method !== "pix" || !order.pix_txid) {
      return new Response(
        JSON.stringify({ status: "awaiting_payment", payment_confirmed: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 2: Try proxy to check EFI status
    const proxyUrl = Deno.env.get("EFI_PROXY_URL");
    const proxySecret = Deno.env.get("EFI_PROXY_SECRET") || "";

    if (!proxyUrl) {
      return new Response(
        JSON.stringify({ status: "awaiting_payment", payment_confirmed: false, efi_status: "no_proxy" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const paid = await checkViaProxy(proxyUrl, proxySecret, order.pix_txid);

    if (paid === null) {
      return new Response(
        JSON.stringify({ status: "awaiting_payment", payment_confirmed: false, efi_status: "unreachable" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!paid) {
      return new Response(
        JSON.stringify({ status: "awaiting_payment", payment_confirmed: false, efi_status: "not_paid" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 3: PIX confirmed! Atomic update
    const supabaseService = createClient(supabaseUrl, getRequiredSecret("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: updated, error: updateError } = await supabaseService
      .from("orders")
      .update({ status: "pending", payment_confirmed: true })
      .eq("id", order.id)
      .eq("status", "awaiting_payment")
      .select("status, payment_confirmed")
      .maybeSingle();

    if (updateError) {
      console.error("Error updating order after PIX confirmation:", updateError);
    }

    return new Response(
      JSON.stringify({
        status: updated?.status ?? "pending",
        payment_confirmed: updated?.payment_confirmed ?? true,
        confirmed: true,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("Error checking PIX payment:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
