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

// ── BRCode / EMV PIX QR Code generation (fallback when proxy not available) ──
function tlv(id: string, value: string): string {
  const len = value.length.toString().padStart(2, "0");
  return `${id}${len}${value}`;
}

function crc16ccitt(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function generatePixPayload(
  pixKey: string,
  merchantName: string,
  merchantCity: string,
  amount: string,
  txid: string,
  description?: string,
): string {
  let payload = tlv("00", "01");
  let mai = tlv("00", "br.gov.bcb.pix");
  mai += tlv("01", pixKey);
  if (description) mai += tlv("02", description.substring(0, 72));
  payload += tlv("26", mai);
  payload += tlv("52", "0000");
  payload += tlv("53", "986");
  if (amount && parseFloat(amount) > 0) payload += tlv("54", amount);
  payload += tlv("58", "BR");
  payload += tlv("59", merchantName.substring(0, 25));
  payload += tlv("60", merchantCity.substring(0, 15));
  const additionalData = tlv("05", txid.substring(0, 25));
  payload += tlv("62", additionalData);
  payload += "6304";
  const crc = crc16ccitt(payload);
  payload += crc;
  return payload;
}

async function generateQrCodeDataUrl(data: string): Promise<string> {
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(data)}`;
  try {
    const response = await fetch(qrApiUrl);
    if (response.ok) {
      const buffer = await response.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      return `data:image/png;base64,${base64}`;
    }
  } catch (e) {
    console.error("QR code generation failed:", e);
  }
  return "";
}

// ── Create COB via proxy (real EFI integration) ──
async function createCobViaProxy(
  proxyUrl: string,
  proxySecret: string,
  txid: string,
  amount: string,
  description: string,
): Promise<{ txid: string; qrcode: string; qrcode_image: string | null } | null> {
  try {
    const res = await fetch(`${proxyUrl}/create-cob`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-proxy-secret": proxySecret,
      },
      body: JSON.stringify({ txid, amount, description }),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Proxy create-cob failed:", res.status, errText);
      return null;
    }

    const data = await res.json();
    console.log("✅ COB created via proxy:", data.txid);
    return {
      txid: data.txid,
      qrcode: data.qrcode,
      qrcode_image: data.qrcode_image,
    };
  } catch (err) {
    console.error("Proxy create-cob error:", err instanceof Error ? err.message : err);
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

    const supabaseUrl = getRequiredSecret("SUPABASE_URL");
    const supabaseAnonKey = getRequiredSecret("SUPABASE_ANON_KEY");

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims(token);
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

    // If PIX already created, return existing data
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

    const txid = `TB${order_id.replace(/-/g, "").substring(0, 23)}`;
    const amount = Number(order.total).toFixed(2);
    const description = `Pedido ${order_id.substring(0, 6)}`;

    // Try proxy first (real EFI COB with webhook support)
    const proxyUrl = Deno.env.get("EFI_PROXY_URL");
    const proxySecret = Deno.env.get("EFI_PROXY_SECRET") || "";

    let pixResult: { txid: string; qrcode: string; qrcode_image: string | null } | null = null;

    if (proxyUrl) {
      console.log("Attempting COB creation via proxy...");
      pixResult = await createCobViaProxy(proxyUrl, proxySecret, txid, amount, description);
    }

    // Fallback: generate static BRCode locally (no webhook, only polling works)
    if (!pixResult) {
      console.log("Using static BRCode fallback (no proxy)");
      const pixKey = getRequiredSecret("EFI_PIX_KEY");
      const pixPayload = generatePixPayload(pixKey, "TURBO LANCHES", "ANAPOLIS", amount, txid, description);
      const qrCodeImage = await generateQrCodeDataUrl(pixPayload);
      pixResult = { txid, qrcode: pixPayload, qrcode_image: qrCodeImage || null };
    }

    // Update order with PIX data
    const supabaseService = createClient(supabaseUrl, getRequiredSecret("SUPABASE_SERVICE_ROLE_KEY"));
    const expirationDate = new Date();
    expirationDate.setSeconds(expirationDate.getSeconds() + 3600);

    await supabaseService.from("orders").update({
      pix_txid: pixResult.txid,
      pix_copia_cola: pixResult.qrcode,
      pix_qrcode_image: pixResult.qrcode_image,
      pix_expiration: expirationDate.toISOString(),
    }).eq("id", order_id);

    return new Response(
      JSON.stringify({
        txid: pixResult.txid,
        qrcode: pixResult.qrcode,
        qrcode_image: pixResult.qrcode_image,
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
