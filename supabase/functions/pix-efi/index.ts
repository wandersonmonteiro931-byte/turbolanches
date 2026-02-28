import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import forge from "https://esm.sh/node-forge@1.3.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

function getEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

let _cachedPem: { cert: string; key: string } | null = null;

function getPemCredentials(): { cert: string; key: string } {
  if (_cachedPem) return _cachedPem;

  const b64 = getEnv("EFI_CERTIFICATE_BASE64");
  const derBytes = forge.util.decode64(b64);
  const asn1 = forge.asn1.fromDer(derBytes);
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, "");

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const allCerts = certBags[forge.pki.oids.certBag] || [];
  if (!allCerts[0]?.cert) throw new Error("No certificate in .p12");
  const cert = allCerts
    .filter((b: any) => b.cert)
    .map((b: any) => forge.pki.certificateToPem(b.cert))
    .join("\n");

  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keyBag = (keyBags[forge.pki.oids.pkcs8ShroudedKeyBag] || [])[0];
  if (!keyBag?.key) throw new Error("No private key in .p12");
  const rsaKey = forge.pki.privateKeyToAsn1(keyBag.key);
  const pkInfo = forge.pki.wrapRsaPrivateKey(rsaKey);
  const key = forge.pki.privateKeyInfoToPem(pkInfo);

  _cachedPem = { cert, key };
  return _cachedPem;
}

// ══════════════════════════════════════════════════════════════
// mTLS
// ══════════════════════════════════════════════════════════════

const EFI_HOST = "pix.api.efipay.com.br";

async function mtlsFetch(
  path: string,
  options: { method: string; headers?: Record<string, string>; body?: string }
): Promise<{ status: number; body: string }> {
  const { cert, key } = getPemCredentials();

  const pkcs1Key = forge.pki.privateKeyToPem(forge.pki.privateKeyFromPem(key));
  const approaches = [
    { opts: { hostname: EFI_HOST, port: 443, cert, key } },
    { opts: { hostname: EFI_HOST, port: 443, cert, key: pkcs1Key } },
  ];

  for (const approach of approaches) {
    try {
      const conn = await (Deno as any).connectTls(approach.opts);
      try {
        const bodyBytes = options.body ? new TextEncoder().encode(options.body) : null;
        const hdrs: Record<string, string> = {
          Host: EFI_HOST, Connection: "close", ...options.headers,
        };
        if (bodyBytes) hdrs["Content-Length"] = String(bodyBytes.length);

        let request = `${options.method} ${path} HTTP/1.1\r\n`;
        for (const [k, v] of Object.entries(hdrs)) request += `${k}: ${v}\r\n`;
        request += "\r\n";

        await conn.write(new TextEncoder().encode(request));
        if (bodyBytes) await conn.write(bodyBytes);

        const chunks: Uint8Array[] = [];
        const buf = new Uint8Array(8192);
        while (true) {
          const n = await conn.read(buf);
          if (n === null) break;
          chunks.push(buf.slice(0, n));
        }
        const raw = new TextDecoder().decode(
          chunks.reduce((a, c) => { const m = new Uint8Array(a.length + c.length); m.set(a); m.set(c, a.length); return m; }, new Uint8Array(0))
        );
        const hdrEnd = raw.indexOf("\r\n\r\n");
        if (hdrEnd === -1) throw new Error("No HTTP response");
        const statusLine = raw.substring(0, raw.indexOf("\r\n"));
        const status = parseInt(statusLine.match(/HTTP\/\d\.\d\s+(\d+)/)?.[1] || "0");
        let respBody = raw.substring(hdrEnd + 4);
        if (raw.substring(0, hdrEnd).toLowerCase().includes("transfer-encoding: chunked")) {
          respBody = decodeChunked(respBody);
        }
        return { status, body: respBody };
      } finally {
        try { conn.close(); } catch { /* */ }
      }
    } catch { /* try next approach */ }
  }
  throw new Error("All mTLS approaches failed");
}

function decodeChunked(data: string): string {
  let result = "", remaining = data;
  while (remaining.length > 0) {
    const le = remaining.indexOf("\r\n");
    if (le === -1) break;
    const size = parseInt(remaining.substring(0, le), 16);
    if (size === 0 || isNaN(size)) break;
    result += remaining.substring(le + 2, le + 2 + size);
    remaining = remaining.substring(le + 2 + size + 2);
  }
  return result;
}

async function mtlsFetchRetry(path: string, opts: any, retries = 3) {
  for (let i = 1; i <= retries; i++) {
    try { return await mtlsFetch(path, opts); }
    catch (e) { if (i >= retries) throw e; await new Promise(r => setTimeout(r, 2000 * i)); }
  }
  throw new Error("Unreachable");
}

// ══════════════════════════════════════════════════════════════
// API Efí
// ══════════════════════════════════════════════════════════════

async function getAccessToken(): Promise<string> {
  const credentials = btoa(`${getEnv("EFI_CLIENT_ID")}:${getEnv("EFI_CLIENT_SECRET")}`);
  const resp = await mtlsFetchRetry("/oauth/token", {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials" }),
  });
  if (resp.status !== 200) throw new Error(`OAuth failed: ${resp.body}`);
  return JSON.parse(resp.body).access_token;
}

async function createPixCharge(token: string, payload: any) {
  const resp = await mtlsFetchRetry("/v2/cob", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (resp.status < 200 || resp.status >= 300) throw new Error(`Create cob failed: ${resp.body}`);
  return JSON.parse(resp.body);
}

async function getQrCode(token: string, locId: number) {
  const resp = await mtlsFetchRetry(`/v2/loc/${locId}/qrcode`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (resp.status < 200 || resp.status >= 300) throw new Error(`QR code failed: ${resp.body}`);
  return JSON.parse(resp.body);
}

async function checkCobStatus(token: string, txid: string) {
  const resp = await mtlsFetchRetry(`/v2/cob/${txid}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (resp.status < 200 || resp.status >= 300) throw new Error(`Check cob failed: ${resp.body}`);
  return JSON.parse(resp.body);
}

// ══════════════════════════════════════════════════════════════
// Supabase
// ══════════════════════════════════════════════════════════════

function adminSupa() {
  return createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"));
}
function userSupa(auth: string) {
  return createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: auth } },
  });
}

// ══════════════════════════════════════════════════════════════
// HANDLER
// ══════════════════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const path = segments[segments.length - 1];

    // Webhook (public, called by Efí)
    const isWebhook = path === "webhook" || path === "pix" ||
      (segments.length >= 2 && segments[segments.length - 2] === "webhook");

    if (isWebhook) {
      if (req.method === "GET") return json({ ok: true });
      return await handleWebhook(req);
    }

    // Authenticated endpoints
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    
    const token = auth.replace("Bearer ", "");
    const supaUser = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: auth } },
    });
    const { data, error } = await supaUser.auth.getClaims(token);
    if (error || !data?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const userId = data.claims.sub as string;

    const body = await req.json();

    if (path === "create-charge") return await handleCreateCharge(userId, body);
    if (path === "check-status") return await handleCheckStatus(userId, body);

    return json({ error: "Unknown action" }, 400);
  } catch (err: any) {
    console.error("pix-efi error:", err);
    return json({ error: err.message }, 500);
  }
});

// ══════════════════════════════════════════════════════════════
// ACTIONS
// ══════════════════════════════════════════════════════════════

async function handleCreateCharge(userId: string, body: any) {
  const { order_id, amount, descricao } = body;
  if (!order_id || !amount) return json({ error: "order_id and amount required" }, 400);

  const pixKey = getEnv("EFI_PIX_KEY");
  const token = await getAccessToken();

  const cob = await createPixCharge(token, {
    calendario: { expiracao: 3600 },
    valor: { original: Number(amount).toFixed(2) },
    chave: pixKey,
    solicitacaoPagador: descricao || "Pedido Turbo Lanches",
  });

  const qr = await getQrCode(token, cob.loc.id);

  const db = adminSupa();
  await db.from("orders").update({
    pix_txid: cob.txid,
    pix_copia_cola: qr.qrcode,
    pix_qrcode_image: qr.imagemQrcode,
    pix_loc_id: cob.loc.id,
    status: "pending",
  }).eq("id", order_id);

  return json({
    txid: cob.txid,
    qrcode: qr.qrcode,
    qrcode_image: qr.imagemQrcode,
    location: cob.loc.location,
    expiracao: cob.calendario.expiracao,
  });
}

async function handleCheckStatus(userId: string, body: any) {
  const { order_id } = body;
  if (!order_id) return json({ error: "order_id required" }, 400);

  const db = adminSupa();
  const { data: order } = await db.from("orders").select("*")
    .eq("id", order_id).eq("user_id", userId).single();

  if (!order) return json({ error: "Order not found" }, 404);
  if (order.status !== "pending") return json({ status: order.status, confirmed: true });

  if (order.pix_txid) {
    try {
      const token = await getAccessToken();
      const cobData = await checkCobStatus(token, order.pix_txid);

      if (cobData.status === "CONCLUIDA") {
        await confirmOrder(db, order);
        return json({ status: "paid", confirmed: true });
      }
    } catch (err: any) {
      console.error("Check status error:", err.message);
    }
  }

  return json({ status: "pending", confirmed: false });
}

async function confirmOrder(db: any, order: any) {
  const { data: updated } = await db.from("orders")
    .update({ status: "paid", paid_at: new Date().toISOString(), payment_confirmed: true })
    .eq("id", order.id)
    .eq("status", "pending")
    .select("id");

  if (!updated || updated.length === 0) {
    console.log(`Order ${order.id} already processed — skipping`);
    return;
  }

  console.log(`Order ${order.id} confirmed!`);
}

async function handleWebhook(req: Request) {
  try {
    const body = await req.json();
    console.log("PIX webhook:", JSON.stringify(body));

    const pixArray = body.pix || [];
    const db = adminSupa();

    for (const pix of pixArray) {
      const txid = pix.txid;
      if (!txid) continue;

      const { data: order } = await db.from("orders")
        .select("*").eq("pix_txid", txid).single();

      if (order && order.status === "pending") {
        await confirmOrder(db, order);
      }
    }

    return json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return json({ ok: true });
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
