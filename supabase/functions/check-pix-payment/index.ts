import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * check-pix-payment — DB-first strategy
 * 
 * 1. Check DB status first (fast, no external call)
 * 2. If still awaiting_payment AND has txid, try EFI API as fallback
 * 3. If EFI fails (mTLS issue), return DB status gracefully
 * 4. If EFI confirms payment, atomic update (WHERE status = 'awaiting_payment')
 */

function getRequiredSecret(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function normalizePem(value: string): string {
  return value.replace(/\\n/g, "\n").trim();
}

function getEfiCertChain(): string {
  const pem = Deno.env.get("EFI_CERT_PEM");
  if (pem?.trim()) return normalizePem(pem);
  const base64 = Deno.env.get("EFI_CERTIFICATE_BASE64");
  if (!base64) throw new Error("EFI certificate is not configured");
  return normalizePem(atob(base64));
}

const EFI_TIMEOUT_MS = 10000;

async function tryEfiCheck(txid: string): Promise<boolean | null> {
  try {
    const certChain = getEfiCertChain();
    const privateKey = normalizePem(getRequiredSecret("EFI_KEY_PEM"));
    const httpClient = Deno.createHttpClient({ certChain, privateKey });

    const clientId = getRequiredSecret("EFI_CLIENT_ID");
    const clientSecret = getRequiredSecret("EFI_CLIENT_SECRET");
    const credentials = btoa(`${clientId}:${clientSecret}`);

    const tokenRes = await fetch("https://pix.api.efipay.com.br/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ grant_type: "client_credentials" }),
      client: httpClient,
      signal: AbortSignal.timeout(EFI_TIMEOUT_MS),
    } as any);

    if (!tokenRes.ok) return null;
    const tokenData = await tokenRes.json();
    if (!tokenData?.access_token) return null;

    // Check COB status directly
    const cobRes = await fetch(`https://pix.api.efipay.com.br/v2/cob/${txid}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "Content-Type": "application/json",
      },
      client: httpClient,
      signal: AbortSignal.timeout(EFI_TIMEOUT_MS),
    } as any);

    if (!cobRes.ok) return null;
    const cobData = await cobRes.json();
    
    // EFI status "CONCLUIDA" means paid
    return cobData?.status === "CONCLUIDA";
  } catch (error) {
    console.error("EFI check failed (expected in this environment):", error instanceof Error ? error.message : error);
    return null; // null = couldn't determine, not false
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

    // MECHANISM 3: Check DB first (fast path)
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

    // If already confirmed (by webhook or admin), return immediately
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

    // MECHANISM 1: Try EFI API as fallback (may fail due to mTLS)
    const efiResult = await tryEfiCheck(order.pix_txid);

    if (efiResult === null) {
      // EFI unreachable — return DB status, webhook/admin will handle confirmation
      return new Response(
        JSON.stringify({ status: "awaiting_payment", payment_confirmed: false, efi_status: "unreachable" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!efiResult) {
      return new Response(
        JSON.stringify({ status: "awaiting_payment", payment_confirmed: false, efi_status: "not_paid" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // PIX confirmed by EFI! Atomic update (prevent duplicates)
    const supabaseService = createClient(supabaseUrl, getRequiredSecret("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: updated, error: updateError } = await supabaseService
      .from("orders")
      .update({ status: "pending", payment_confirmed: true })
      .eq("id", order.id)
      .eq("status", "awaiting_payment") // Atomic lock
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
