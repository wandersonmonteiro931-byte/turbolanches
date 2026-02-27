import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

async function getEfiAccessToken(httpClient: Deno.HttpClient): Promise<string> {
  const clientId = getRequiredSecret("EFI_CLIENT_ID");
  const clientSecret = getRequiredSecret("EFI_CLIENT_SECRET");
  const credentials = btoa(`${clientId}:${clientSecret}`);

  const response = await fetch("https://pix.api.efipay.com.br/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ grant_type: "client_credentials" }),
    client: httpClient,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`EFI token error (${response.status}): ${text}`);
  }

  const data = await response.json();
  if (!data?.access_token) throw new Error("EFI access token missing");
  return data.access_token as string;
}

async function isPixPaid(txid: string, accessToken: string, httpClient: Deno.HttpClient): Promise<boolean> {
  const now = new Date();
  const inicio = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const fim = new Date(now.getTime() + 5 * 60 * 1000).toISOString();

  const query = new URLSearchParams({ inicio, fim, txid }).toString();
  const response = await fetch(`https://pix.api.efipay.com.br/v2/pix?${query}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    client: httpClient,
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`EFI pix query error (${response.status}):`, text);
    return false;
  }

  const data = await response.json();
  return Array.isArray(data?.pix) && data.pix.some((item: { txid?: string }) => item?.txid === txid);
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
    const supabaseServiceKey = getRequiredSecret("SUPABASE_SERVICE_ROLE_KEY");

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    if (order.payment_method !== "pix") {
      return new Response(JSON.stringify({ status: order.status, payment_confirmed: order.payment_confirmed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (order.status !== "awaiting_payment") {
      return new Response(JSON.stringify({ status: order.status, payment_confirmed: order.payment_confirmed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!order.pix_txid) {
      return new Response(JSON.stringify({ status: "awaiting_payment", payment_confirmed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const certChain = getEfiCertChain();
    const privateKey = normalizePem(getRequiredSecret("EFI_KEY_PEM"));
    const httpClient = Deno.createHttpClient({ certChain, privateKey });

    let paid = false;
    try {
      const accessToken = await getEfiAccessToken(httpClient);
      paid = await isPixPaid(order.pix_txid, accessToken, httpClient);
    } catch {
      return new Response(JSON.stringify({ status: "awaiting_payment", payment_confirmed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!paid) {
      return new Response(JSON.stringify({ status: "awaiting_payment", payment_confirmed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);
    const { data: updatedOrder, error: updateError } = await supabaseService
      .from("orders")
      .update({ status: "pending", payment_confirmed: true })
      .eq("id", order.id)
      .eq("status", "awaiting_payment")
      .select("status, payment_confirmed")
      .single();

    if (updateError) {
      console.error("Error updating order after PIX confirmation:", updateError);
      return new Response(JSON.stringify({ error: "Failed to update order" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        status: updatedOrder?.status ?? "pending",
        payment_confirmed: updatedOrder?.payment_confirmed ?? true,
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
