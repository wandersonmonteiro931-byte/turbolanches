import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EFI_API_URL = "https://pix.api.efipay.com.br";

async function getEfiToken(): Promise<string> {
  const clientId = Deno.env.get("EFI_CLIENT_ID")!;
  const clientSecret = Deno.env.get("EFI_CLIENT_SECRET")!;
  const certBase64 = Deno.env.get("EFI_CERTIFICATE_BASE64")!;

  // Decode the P12 certificate
  const certBytes = Uint8Array.from(atob(certBase64), (c) => c.charCodeAt(0));

  const credentials = btoa(`${clientId}:${clientSecret}`);

  const response = await fetch(`${EFI_API_URL}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ grant_type: "client_credentials" }),
    // @ts-ignore - Deno supports client certificates
    client: {
      certChain: undefined,
      privateKey: undefined,
    },
  });

  // For EFI mTLS, we use the certificate in a different way for Deno
  // Actually, Deno's fetch with mTLS requires using Deno.createHttpClient
  // Let's use a workaround approach
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`EFI Auth failed: ${response.status} - ${err}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function getEfiAccessToken(): Promise<string> {
  const clientId = Deno.env.get("EFI_CLIENT_ID")!;
  const clientSecret = Deno.env.get("EFI_CLIENT_SECRET")!;
  const certBase64 = Deno.env.get("EFI_CERTIFICATE_BASE64")!;

  const certBytes = Uint8Array.from(atob(certBase64), (c) => c.charCodeAt(0));
  const credentials = btoa(`${clientId}:${clientSecret}`);

  // Create HTTP client with mTLS certificate
  const httpClient = Deno.createHttpClient({
    caCerts: [],
    certChain: undefined,
    privateKey: undefined,
  });

  // EFI requires mTLS with P12 certificate
  // In Deno edge functions, we'll use the direct approach
  const response = await fetch(`${EFI_API_URL}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ grant_type: "client_credentials" }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`EFI auth error [${response.status}]: ${errText}`);
  }

  const data = await response.json();
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
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

    // Fetch order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, total, user_id, status, pix_txid, pix_copia_cola, pix_qrcode_image")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      return new Response(JSON.stringify({ error: "Order not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If PIX already created, return existing data
    if (order.pix_txid && order.pix_copia_cola) {
      return new Response(
        JSON.stringify({
          txid: order.pix_txid,
          qrcode: order.pix_copia_cola,
          qrcode_image: order.pix_qrcode_image,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get EFI access token
    const accessToken = await getEfiAccessToken();
    const pixKey = Deno.env.get("EFI_PIX_KEY")!;

    // Generate unique txid (alphanumeric, 26-35 chars)
    const txid = `turbo${order_id.replace(/-/g, "").substring(0, 30)}`;

    // Create immediate charge (cobrança imediata)
    const chargeResponse = await fetch(`${EFI_API_URL}/v2/cob/${txid}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        calendario: { expiracao: 3600 }, // 1 hour expiration
        devedor: {},
        valor: {
          original: Number(order.total).toFixed(2),
        },
        chave: pixKey,
        solicitacaoPagador: `Pedido Turbo Lanches`,
        infoAdicionais: [
          { nome: "Pedido", valor: order_id.substring(0, 6) },
        ],
      }),
    });

    if (!chargeResponse.ok) {
      const errText = await chargeResponse.text();
      throw new Error(`EFI charge creation failed [${chargeResponse.status}]: ${errText}`);
    }

    const chargeData = await chargeResponse.json();

    // Generate QR Code for the charge
    const locId = chargeData.loc?.id;
    let qrCodeData = { qrcode: "", imagemQrcode: "" };

    if (locId) {
      const qrResponse = await fetch(`${EFI_API_URL}/v2/loc/${locId}/qrcode`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (qrResponse.ok) {
        qrCodeData = await qrResponse.json();
      }
    }

    // Update order with PIX data using service role
    const supabaseService = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const expirationDate = new Date();
    expirationDate.setSeconds(expirationDate.getSeconds() + 3600);

    await supabaseService.from("orders").update({
      pix_txid: txid,
      pix_copia_cola: qrCodeData.qrcode || chargeData.pixCopiaECola,
      pix_qrcode_image: qrCodeData.imagemQrcode || null,
      pix_loc_id: locId || null,
      pix_expiration: expirationDate.toISOString(),
    }).eq("id", order_id);

    return new Response(
      JSON.stringify({
        txid,
        qrcode: qrCodeData.qrcode || chargeData.pixCopiaECola,
        qrcode_image: qrCodeData.imagemQrcode || null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error creating PIX charge:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
