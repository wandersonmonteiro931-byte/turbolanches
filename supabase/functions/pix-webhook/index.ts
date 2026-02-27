import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * pix-webhook — Receives PIX payment notifications
 * 
 * Can be called by:
 * - EFI directly (webhook registration)
 * - External proxy that handles mTLS and forwards here
 * 
 * Uses ATOMIC LOCK: UPDATE ... WHERE status = 'awaiting_payment'
 * to prevent duplicate processing.
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // EFI sends GET to validate webhook URL
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

      // ATOMIC LOCK: Only update if still awaiting_payment
      // If another process already confirmed, this returns 0 rows (no-op)
      const { data: updated, error: updateError } = await supabase
        .from("orders")
        .update({
          status: "pending",
          payment_confirmed: true,
        })
        .eq("pix_txid", txid)
        .eq("status", "awaiting_payment") // Atomic lock - prevents duplicates
        .select("id, status")
        .maybeSingle();

      if (updateError) {
        console.error(`Error updating order for txid ${txid}:`, updateError);
        continue;
      }

      if (updated) {
        console.log(`✅ Order ${updated.id} confirmed via PIX webhook (txid: ${txid})`);
      } else {
        console.log(`Order for txid ${txid} already processed or not found`);
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
