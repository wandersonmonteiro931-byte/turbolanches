import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { order_id } = await req.json();
    if (!order_id) {
      return new Response(JSON.stringify({ error: "order_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, total, pix_txid, payment_method, payment_confirmed, status")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      return new Response(JSON.stringify({ error: "Order not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (order.payment_method !== "pix" || !order.payment_confirmed) {
      return new Response(JSON.stringify({ error: "Order was not paid via PIX" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Since we use static PIX (BRCode), we cannot do automatic refund via API.
    // We log the refund request and mark the order for manual refund by admin.
    // In a production EFI integration with mTLS, you would call PUT /v2/pix/:e2eid/devolucao/:id
    
    console.log(`REFUND REQUESTED for order ${order.id}, amount: R$ ${Number(order.total).toFixed(2)}, txid: ${order.pix_txid}`);

    // Update order to cancelled and mark refund pending
    await supabase
      .from("orders")
      .update({
        status: "cancelled",
        observations: `${order.status === "cancelled" ? "" : "[REEMBOLSO PIX PENDENTE] "}R$ ${Number(order.total).toFixed(2)} - ` + (order.pix_txid || "sem txid"),
      })
      .eq("id", order_id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Refund request logged. Manual refund required for static PIX.",
        amount: Number(order.total).toFixed(2),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("Refund error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
