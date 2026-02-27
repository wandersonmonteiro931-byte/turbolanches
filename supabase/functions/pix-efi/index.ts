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

// ── OAuth2 com mTLS na Efí ──
async function getEfiToken(): Promise<string> {
  const clientId = getSecret("EFI_CLIENT_ID");
  const clientSecret = getSecret("EFI_CLIENT_SECRET");
  const cert = getSecret("EFI_CERT_PEM");
  const key = getSecret("EFI_KEY_PEM");

  const client = (Deno as any).createHttpClient({ certChain: cert, privateKey: key });
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
  const cert = getSecret("EFI_CERT_PEM");
  const key = getSecret("EFI_KEY_PEM");
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

      const token = await getEfiToken();
      const txid = generateTxid();
      const pixKey = getSecret("EFI_PIX_KEY");
      const amount = Number(order.total).toFixed(2);
      const description = `Pedido ${order_id.substring(0, 6)}`;

      // 1. Criar cobrança na Efí
      console.log(`Creating COB for order ${order_id}, txid: ${txid}, amount: ${amount}`);
      const cob = await efiRequest("PUT", `/v2/cob/${txid}`, token, {
        calendario: { expiracao: 3600 },
        valor: { original: amount },
        chave: pixKey,
        solicitacaoPagador: description,
      });

      if (!cob.loc) {
        console.error("EFI COB creation failed:", JSON.stringify(cob));
        throw new Error("Failed to create PIX charge: " + (cob.mensagem || JSON.stringify(cob)));
      }

      // 2. Buscar QR Code
      const locId = cob.loc.id;
      const qr = await efiRequest("GET", `/v2/loc/${locId}/qrcode`, token);

      // 3. Salvar no banco
      const expirationDate = new Date();
      expirationDate.setSeconds(expirationDate.getSeconds() + 3600);

      await supabase.from("orders").update({
        pix_txid: txid,
        pix_copia_cola: qr.qrcode,
        pix_qrcode_image: qr.imagemQrcode ? `data:image/png;base64,${qr.imagemQrcode}` : null,
        pix_expiration: expirationDate.toISOString(),
        pix_loc_id: locId,
      }).eq("id", order_id);

      console.log(`✅ PIX charge created: txid=${txid}, locId=${locId}`);

      return new Response(JSON.stringify({
        success: true,
        txid,
        qrcode: qr.qrcode,
        qrcode_image: qr.imagemQrcode ? `data:image/png;base64,${qr.imagemQrcode}` : null,
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

      // 2. Consultar API Efí
      const token = await getEfiToken();
      const cob = await efiRequest("GET", `/v2/cob/${order.pix_txid}`, token);

      console.log(`EFI cob status for ${order.pix_txid}: ${cob.status}`);

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
