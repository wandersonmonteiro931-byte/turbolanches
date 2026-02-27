import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import forge from "npm:node-forge@1.3.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EFI_API_URL = "https://pix.api.efipay.com.br";

function getRequiredSecret(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function decodeBase64ToBinary(base64: string): string {
  return atob(base64.replace(/\s/g, ""));
}

function createMtlsClientFromP12() {
  const p12Base64 = getRequiredSecret("EFI_CERTIFICATE_BASE64");
  const p12Password = Deno.env.get("EFI_CERTIFICATE_PASSWORD") ?? "";

  let certPem = "";
  let keyPem = "";

  try {
    const p12Binary = decodeBase64ToBinary(p12Base64);
    const p12Asn1 = forge.asn1.fromDer(p12Binary);
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, p12Password);

    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[
      forge.pki.oids.certBag
    ];
    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
      forge.pki.oids.pkcs8ShroudedKeyBag
    ];

    if (!certBags?.length || !keyBags?.length) {
      throw new Error("Could not extract certificate/private key from P12");
    }

    certPem = forge.pki.certificateToPem(certBags[0].cert);
    keyPem = forge.pki.privateKeyToPem(keyBags[0].key);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    throw new Error(
      `Failed to parse EFI_CERTIFICATE_BASE64. If your P12 has password, set EFI_CERTIFICATE_PASSWORD. Details: ${msg}`
    );
  }

  return Deno.createHttpClient({
    certChain: certPem,
    privateKey: keyPem,
  });
}

async function efiFetch(
  path: string,
  init: RequestInit,
  client: Deno.HttpClient,
): Promise<Response> {
  return fetch(`${EFI_API_URL}${path}`, {
    ...init,
    client,
  });
}

async function getEfiAccessToken(client: Deno.HttpClient): Promise<string> {
  const clientId = getRequiredSecret("EFI_CLIENT_ID");
  const clientSecret = getRequiredSecret("EFI_CLIENT_SECRET");
  const credentials = btoa(`${clientId}:${clientSecret}`);

  const response = await efiFetch(
    "/oauth/token",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ grant_type: "client_credentials" }),
    },
    client,
  );

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

  let mtlsClient: Deno.HttpClient | null = null;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = getRequiredSecret("SUPABASE_URL");
    const supabaseAnonKey = getRequiredSecret("SUPABASE_ANON_KEY");

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

    if (order.pix_txid && order.pix_copia_cola) {
      return new Response(
        JSON.stringify({
          txid: order.pix_txid,
          qrcode: order.pix_copia_cola,
          qrcode_image: order.pix_qrcode_image,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    mtlsClient = createMtlsClientFromP12();
    const accessToken = await getEfiAccessToken(mtlsClient);
    const pixKey = getRequiredSecret("EFI_PIX_KEY");

    const txid = `turbo${order_id.replace(/-/g, "").substring(0, 30)}`;

    const chargeResponse = await efiFetch(
      `/v2/cob/${txid}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          calendario: { expiracao: 3600 },
          devedor: {},
          valor: { original: Number(order.total).toFixed(2) },
          chave: pixKey,
          solicitacaoPagador: "Pedido Turbo Lanches",
          infoAdicionais: [{ nome: "Pedido", valor: order_id.substring(0, 6) }],
        }),
      },
      mtlsClient,
    );

    if (!chargeResponse.ok) {
      const errText = await chargeResponse.text();
      throw new Error(`EFI charge creation failed [${chargeResponse.status}]: ${errText}`);
    }

    const chargeData = await chargeResponse.json();
    const locId = chargeData.loc?.id;
    let qrCodeData = { qrcode: "", imagemQrcode: "" };

    if (locId) {
      const qrResponse = await efiFetch(
        `/v2/loc/${locId}/qrcode`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
        mtlsClient,
      );

      if (qrResponse.ok) {
        qrCodeData = await qrResponse.json();
      }
    }

    const supabaseService = createClient(
      supabaseUrl,
      getRequiredSecret("SUPABASE_SERVICE_ROLE_KEY"),
    );

    const expirationDate = new Date();
    expirationDate.setSeconds(expirationDate.getSeconds() + 3600);

    await supabaseService
      .from("orders")
      .update({
        pix_txid: txid,
        pix_copia_cola: qrCodeData.qrcode || chargeData.pixCopiaECola,
        pix_qrcode_image: qrCodeData.imagemQrcode || null,
        pix_loc_id: locId || null,
        pix_expiration: expirationDate.toISOString(),
      })
      .eq("id", order_id);

    return new Response(
      JSON.stringify({
        txid,
        qrcode: qrCodeData.qrcode || chargeData.pixCopiaECola,
        qrcode_image: qrCodeData.imagemQrcode || null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("Error creating PIX charge:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
    if (mtlsClient) {
      mtlsClient.close();
    }
  }
});
