import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getSecret(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`${name} is not configured`);
  return v;
}

// Normaliza PEM: converte \\n literal em quebra de linha real
function normalizePem(pem: string): string {
  return pem.replace(/\\n/g, "\n").trim();
}

function getPemPair(): { cert: string; key: string } {
  return {
    cert: normalizePem(getSecret("EFI_CERT_PEM")),
    key: normalizePem(getSecret("EFI_KEY_PEM")),
  };
}

function tlv(id: string, value: string): string {
  const len = value.length.toString().padStart(2, "0");
  return `${id}${len}${value}`;
}

function crc16ccitt(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function generatePixPayload(pixKey: string, amount: string, txid: string, description: string): string {
  let payload = tlv("00", "01");
  let mai = tlv("00", "br.gov.bcb.pix");
  mai += tlv("01", pixKey);
  mai += tlv("02", description.substring(0, 72));
  payload += tlv("26", mai);
  payload += tlv("52", "0000");
  payload += tlv("53", "986");
  payload += tlv("54", amount);
  payload += tlv("58", "BR");
  payload += tlv("59", "TURBO LANCHES");
  payload += tlv("60", "ANAPOLIS");
  payload += tlv("62", tlv("05", txid.substring(0, 25)));
  payload += "6304";
  payload += crc16ccitt(payload);
  return payload;
}

async function generateQrCodeDataUrl(data: string): Promise<string | null> {
  try {
    const response = await fetch(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(data)}`);
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    return `data:image/png;base64,${base64}`;
  } catch {
    return null;
  }
}

// ── OAuth2 com mTLS na Efí ──
async function getEfiToken(): Promise<string> {
  const clientId = getSecret("EFI_CLIENT_ID");
  const clientSecret = getSecret("EFI_CLIENT_SECRET");
  const { cert, key } = getPemPair();

  console.log(`mTLS cert starts: ${cert.substring(0, 40)}...`);
  console.log(`mTLS key starts: ${key.substring(0, 40)}...`);

  const client = (Deno as any).createHttpClient({ certChain: cert, privateKey: key });
  const auth = btoa(`${clientId}:${clientSecret}`);
  const auth = btoa(`${clientId}:${clientSecret}`);

  const res = await fetch("https://pix.api.efipay.com.br/oauth/token", {
    method: "POST",
    client,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ grant_type: "client_credentials" }),
  } as any);

  const data = await res.json();
  client.close();

  if (!data.access_token) {
    console.error("EFI OAuth error:", JSON.stringify(data));
    throw new Error("Failed to get EFI access token");
  }

  return data.access_token;
}

// ── Chamada genérica à API Efí com mTLS ──
async function efiRequest(method: string, path: string, token: string, body?: any) {
  const { cert, key } = getPemPair();
  const client = (Deno as any).createHttpClient({ certChain: cert, privateKey: key });

  const res = await fetch(`https://pix.api.efipay.com.br${path}`, {
    method,
    client,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  } as any);

  const data = await res.json();
  client.close();
  return data;
}

// ── Gerar txid alfanumérico (35 chars) ──
function generateTxid(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: 35 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = getSecret("SUPABASE_URL");
    const serviceKey = getSecret("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, serviceKey);

    const { action, ...params } = await req.json();

    // ========== CRIAR COBRANÇA ==========
    if (action === "create-charge") {
      const { order_id } = params;
      if (!order_id) {
        return new Response(JSON.stringify({ error: "order_id is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Buscar pedido
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

      // Se PIX já foi gerado, retornar existente
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

      const txid = generateTxid();
      const amount = Number(order.total).toFixed(2);
      const description = `Pedido ${order_id.substring(0, 6)}`;

      let qrCode = "";
      let qrCodeImage: string | null = null;
      let locId: number | null = null;

      try {
        const token = await getEfiToken();
        const pixKey = getSecret("EFI_PIX_KEY");

        // 1. Criar cobrança na Efí
        console.log(`Creating COB for order ${order_id}, txid: ${txid}, amount: ${amount}`);
        const cob = await efiRequest("PUT", `/v2/cob/${txid}`, token, {
          calendario: { expiracao: 3600 },
          valor: { original: amount },
          chave: pixKey,
          solicitacaoPagador: description,
        });

        if (!cob.loc?.id) throw new Error(`Failed to create PIX charge: ${JSON.stringify(cob)}`);

        // 2. Buscar QR Code
        locId = cob.loc.id;
        const qr = await efiRequest("GET", `/v2/loc/${locId}/qrcode`, token);
        qrCode = qr.qrcode;
        qrCodeImage = qr.imagemQrcode ? `data:image/png;base64,${qr.imagemQrcode}` : null;
      } catch (efiErr) {
        // Fallback: gera BRCode estático para não quebrar o fluxo com 500
        console.error("mTLS failed in create-charge, using static BRCode fallback:", efiErr);
        const pixKey = getSecret("EFI_PIX_KEY");
        qrCode = generatePixPayload(pixKey, amount, txid, description);
        qrCodeImage = await generateQrCodeDataUrl(qrCode);
      }

      // 3. Salvar no banco
      const expirationDate = new Date();
      expirationDate.setSeconds(expirationDate.getSeconds() + 3600);

      await supabase.from("orders").update({
        pix_txid: txid,
        pix_copia_cola: qrCode,
        pix_qrcode_image: qrCodeImage,
        pix_expiration: expirationDate.toISOString(),
        pix_loc_id: locId,
      }).eq("id", order_id);

      console.log(`✅ PIX charge created: txid=${txid}`);

      return new Response(JSON.stringify({
        success: true,
        txid,
        qrcode: qrCode,
        qrcode_image: qrCodeImage,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ========== VERIFICAR STATUS (POLLING) ==========
    if (action === "check-status") {
      const { order_id } = params;
      if (!order_id) {
        return new Response(JSON.stringify({ error: "order_id is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 1. Verificar no banco primeiro (fast path)
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

      // Já confirmado
      if (order.status !== "awaiting_payment") {
        return new Response(
          JSON.stringify({ status: order.status, confirmed: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (order.payment_method !== "pix" || !order.pix_txid) {
        return new Response(
          JSON.stringify({ status: "awaiting_payment", confirmed: false }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // 2. Consultar API Efí (mTLS). Se falhar, não quebrar polling com 500.
      let cob: any;
      try {
        const token = await getEfiToken();
        cob = await efiRequest("GET", `/v2/cob/${order.pix_txid}`, token);
        console.log(`EFI cob status for ${order.pix_txid}: ${cob.status}`);
      } catch (efiErr) {
        console.error("mTLS failed in check-status:", efiErr);
        return new Response(
          JSON.stringify({ status: "awaiting_payment", confirmed: false, efi_status: "mtls_unavailable" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (cob.status === "CONCLUIDA") {
        // 3. TRAVA ATÔMICA — só confirma se ainda está awaiting_payment
        const { data: updated, error: updateError } = await supabase
          .from("orders")
          .update({
            status: "pending",
            payment_confirmed: true,
          })
          .eq("id", order.id)
          .eq("status", "awaiting_payment") // ← TRAVA! Impede duplicidade
          .select("status, payment_confirmed")
          .maybeSingle();

        if (updateError) {
          console.error("Error updating order after PIX confirmation:", updateError);
        }

        if (updated) {
          console.log(`✅ Order ${order.id} confirmed via PIX polling`);
        } else {
          console.log(`Order ${order.id} already confirmed by another process`);
        }

        return new Response(
          JSON.stringify({ status: "pending", confirmed: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ status: "awaiting_payment", confirmed: false, efi_status: cob.status }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ error: "Ação inválida. Use: create-charge, check-status" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    console.error("pix-efi error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
