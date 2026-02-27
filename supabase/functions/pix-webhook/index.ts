import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Handle webhook configuration check (EFI sends GET to validate)
  if (req.method === "GET") {
    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    console.log("PIX Webhook received:", JSON.stringify(body));

    // EFI sends { pix: [...] } array with payment data
    const pixArray = body.pix;
    if (!pixArray || !Array.isArray(pixArray) || pixArray.length === 0) {
      console.log("No pix data in webhook");
      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    for (const pix of pixArray) {
      const txid = pix.txid;
      if (!txid) continue;

      console.log(`Processing PIX payment for txid: ${txid}`);

      // Find the order by txid
      const { data: order, error } = await supabase
        .from("orders")
        .select("id, status")
        .eq("pix_txid", txid)
        .single();

      if (error || !order) {
        console.log(`Order not found for txid: ${txid}`);
        continue;
      }

      // Only update if still awaiting payment
      if (order.status === "awaiting_payment") {
        const { error: updateError } = await supabase
          .from("orders")
          .update({
            status: "pending",
            payment_confirmed: true,
          })
          .eq("id", order.id);

        if (updateError) {
          console.error(`Error updating order ${order.id}:`, updateError);
        } else {
          console.log(`Order ${order.id} confirmed via PIX payment`);
        }
      }
    }

    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Webhook error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
