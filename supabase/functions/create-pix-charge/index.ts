import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

/**
 * Parse a PEM-encoded P12/PFX certificate (base64) into cert + key PEM strings.
 * EFI provides certificates as .p12 files which contain both the cert and private key.
 * 
 * The secret EFI_CERTIFICATE_BASE64 should contain the base64 of the .p12 file.
 * We also need EFI_CERT_PEM and EFI_KEY_PEM as separate PEM strings.
 */

async function getEfiAccessToken(): Promise<string> {
  const clientId = getRequiredSecret("EFI_CLIENT_ID");
  const clientSecret = getRequiredSecret("EFI_CLIENT_SECRET");
  const credentials = btoa(`${clientId}:${clientSecret}`);

  // Check if we have separate PEM cert and key (preferred approach)
  const certPem = Deno.env.get("EFI_CERT_PEM");
  const keyPem = Deno.env.get("EFI_KEY_PEM");

  let fetchOptions: RequestInit & { client?: unknown } = {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ grant_type: "client_credentials" }),
  };

  // Try to create mTLS client if we have cert and key PEM
  if (certPem && keyPem) {
    console.log("Using PEM cert and key for mTLS");
    try {
      const httpClient = Deno.createHttpClient({
        certChain: certPem,
        privateKey: keyPem,
      });
      fetchOptions.client = httpClient;
      console.log("mTLS HttpClient created successfully");
    } catch (e) {
      console.error("Failed to create mTLS client:", e);
    }
  } else {
    // Try to parse P12 from base64
    const p12Base64 = Deno.env.get("EFI_CERTIFICATE_BASE64");
    if (p12Base64) {
      console.log("Attempting P12 certificate parsing...");
      console.log("P12 base64 length:", p12Base64.length);
      
      try {
        // Dynamic import of node-forge
        const forge = (await import("npm:node-forge@1.3.1")).default;
        const p12Binary = atob(p12Base64.replace(/\s/g, ""));
        const p12Asn1 = forge.asn1.fromDer(p12Binary);
        
        const password = Deno.env.get("EFI_CERTIFICATE_PASSWORD") ?? "";
        const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

        const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[
          forge.pki.oids.certBag
        ];
        const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
          forge.pki.oids.pkcs8ShroudedKeyBag
        ];

        if (certBags?.length && keyBags?.length) {
          const extractedCert = forge.pki.certificateToPem(certBags[0].cert);
          const extractedKey = forge.pki.privateKeyToPem(keyBags[0].key);
          console.log("P12 parsed successfully, cert length:", extractedCert.length, "key length:", extractedKey.length);

          try {
            const httpClient = Deno.createHttpClient({
              certChain: extractedCert,
              privateKey: extractedKey,
            });
            fetchOptions.client = httpClient;
            console.log("mTLS HttpClient created from P12 successfully");
          } catch (clientErr) {
            console.error("Failed to create HttpClient from P12:", clientErr);
          }
        } else {
          console.error("Could not extract cert/key bags from P12. CertBags:", certBags?.length, "KeyBags:", keyBags?.length);
        }
      } catch (parseErr) {
        console.error("Failed to parse P12 certificate:", parseErr);
      }
    } else {
      console.warn("No certificate configured (neither EFI_CERT_PEM/EFI_KEY_PEM nor EFI_CERTIFICATE_BASE64)");
    }
  }

  console.log("Calling EFI oauth/token...");
  console.log("Has mTLS client:", !!fetchOptions.client);

  const response = await fetch(`${EFI_API_URL}/oauth/token`, fetchOptions);

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`EFI auth error [${response.status}]: ${errText}`);
  }

  const data = await response.json();
  console.log("EFI auth successful, token type:", data.token_type);
  return data.access_token;
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

    const accessToken = await getEfiAccessToken();
    const pixKey = getRequiredSecret("EFI_PIX_KEY");

    const txid = `turbo${order_id.replace(/-/g, "").substring(0, 30)}`;

    // For subsequent requests, also need mTLS - reuse the same approach
    const chargeResponse = await fetch(`${EFI_API_URL}/v2/cob/${txid}`, {
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
    });

    if (!chargeResponse.ok) {
      const errText = await chargeResponse.text();
      throw new Error(`EFI charge creation failed [${chargeResponse.status}]: ${errText}`);
    }

    const chargeData = await chargeResponse.json();
    const locId = chargeData.loc?.id;
    let qrCodeData = { qrcode: "", imagemQrcode: "" };

    if (locId) {
      const qrResponse = await fetch(`${EFI_API_URL}/v2/loc/${locId}/qrcode`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
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
  }
});
