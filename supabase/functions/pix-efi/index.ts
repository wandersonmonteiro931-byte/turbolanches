import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import forge from "https://esm.sh/node-forge@1.3.1";

// ══════════════════════════════════════════════════════════════
// CORS
// ══════════════════════════════════════════════════════════════

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

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function decodeChunked(raw: string): string {
  let result = "";
  let idx = 0;
  while (idx < raw.length) {
    const nl = raw.indexOf("\r\n", idx);
    if (nl === -1) break;
    const sizeStr = raw.substring(idx, nl).trim();
    const size = parseInt(sizeStr, 16);
    if (isNaN(size) || size === 0) break;
    const start = nl + 2;
    result += raw.substring(start, start + size);
    idx = start + size + 2; // skip chunk data + \r\n
  }
  return result;
}

// ══════════════════════════════════════════════════════════════
// PEM CREDENTIALS (cached)
// ══════════════════════════════════════════════════════════════

let _cachedPem: { cert: string; keyPkcs8: string; keyPkcs1: string } | null = null;

function getPemCredentials(): { cert: string; keyPkcs8: string; keyPkcs1: string } {
  if (_cachedPem) return _cachedPem;

  const b64 = getEnv("EFI_CERTIFICATE_BASE64");
  const derBytes = forge.util.decode64(b64);
  const asn1 = forge.asn1.fromDer(derBytes);
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, "");

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const allCerts = certBags[forge.pki.oids.certBag] || [];
  if (!allCerts[0]?.cert) throw new Error("No certificate in .p12");
  const cert = forge.pki.certificateToPem(allCerts[0].cert);

  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keyBag = (keyBags[forge.pki.oids.pkcs8ShroudedKeyBag] || [])[0];
  if (!keyBag?.key) throw new Error("No private key in .p12");

  // PKCS#8 (BEGIN PRIVATE KEY)
  const rsaKey = forge.pki.privateKeyToAsn1(keyBag.key);
  const pkInfo = forge.pki.wrapRsaPrivateKey(rsaKey);
  const keyPkcs8 = forge.pki.privateKeyInfoToPem(pkInfo);

  // PKCS#1 (BEGIN RSA PRIVATE KEY)
  const keyPkcs1 = forge.pki.privateKeyToPem(keyBag.key);

  const certObj = allCerts[0].cert;
  console.log("Cert CN:", certObj.subject.getField("CN")?.value);
  console.log("Cert valid:", certObj.validity.notBefore, "->", certObj.validity.notAfter);

  _cachedPem = { cert, keyPkcs8, keyPkcs1 };
  return _cachedPem;
}

// ══════════════════════════════════════════════════════════════
// mTLS CLIENT — Deno.connectTls with raw HTTP/1.1
// ══════════════════════════════════════════════════════════════

const EFI_HOST = "pix.api.efipay.com.br";

interface MtlsResult {
  status: number;
  body: string;
}

// Try multiple TLS option combinations
function getTlsStrategies(cert: string, keyPkcs8: string, keyPkcs1: string): Array<{
  label: string;
  opts: Record<string, unknown>;
}> {
  return [
    {
      label: "certChain+privateKey(PKCS8)",
      opts: { hostname: EFI_HOST, port: 443, certChain: cert, privateKey: keyPkcs8 },
    },
    {
      label: "certChain+privateKey(PKCS1)",
      opts: { hostname: EFI_HOST, port: 443, certChain: cert, privateKey: keyPkcs1 },
    },
    {
      label: "cert+key(PKCS8)",
      opts: { hostname: EFI_HOST, port: 443, cert, key: keyPkcs8 },
    },
    {
      label: "cert+key(PKCS1)",
      opts: { hostname: EFI_HOST, port: 443, cert, key: keyPkcs1 },
    },
  ];
}

async function readFullStream(conn: Deno.TlsConn): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const buf = new Uint8Array(16384);
  try {
    while (true) {
      const n = await conn.read(buf);
      if (n === null) break;
      chunks.push(buf.slice(0, n));
    }
  } catch (e: any) {
    // Efí closes without close_notify — this is expected
    const msg = (e.message || "").toLowerCase();
    if (
      msg.includes("close_notify") ||
      msg.includes("eof") ||
      msg.includes("connection reset") ||
      msg.includes("broken pipe") ||
      msg.includes("os error") ||
      msg.includes("unexpected eof") ||
      msg.includes("tls") ||
      msg.includes("closed")
    ) {
      console.log("Stream ended (expected):", msg.substring(0, 80));
    } else {
      console.warn("Stream read error:", msg.substring(0, 120));
    }
  }

  // Merge chunks
  let totalLen = 0;
  for (const c of chunks) totalLen += c.length;
  const merged = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  return merged;
}

function parseHttpResponse(raw: string): MtlsResult {
  const headerEnd = raw.indexOf("\r\n\r\n");
  if (headerEnd === -1) {
    // Try to find any JSON in the raw data
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) return { status: 200, body: jsonMatch[0] };
    throw new Error("No HTTP headers found in response");
  }

  const headerSection = raw.substring(0, headerEnd);
  const bodyRaw = raw.substring(headerEnd + 4);

  // Parse status
  const statusMatch = headerSection.match(/HTTP\/\d\.?\d?\s+(\d+)/);
  const status = statusMatch ? parseInt(statusMatch[1]) : 200;

  // Check transfer-encoding
  const isChunked = /transfer-encoding:\s*chunked/i.test(headerSection);
  const body = isChunked ? decodeChunked(bodyRaw) : bodyRaw;

  return { status, body };
}

async function mtlsFetch(
  path: string,
  options: { method: string; headers?: Record<string, string>; body?: string }
): Promise<MtlsResult> {
  const { cert, keyPkcs8, keyPkcs1 } = getPemCredentials();
  const strategies = getTlsStrategies(cert, keyPkcs8, keyPkcs1);

  // Build raw HTTP/1.1 request
  const hdrs: string[] = [
    `${options.method} ${path} HTTP/1.1`,
    `Host: ${EFI_HOST}`,
    `Connection: close`,
    `Accept: application/json`,
  ];
  if (options.headers) {
    for (const [k, v] of Object.entries(options.headers)) {
      hdrs.push(`${k}: ${v}`);
    }
  }
  if (options.body) {
    hdrs.push(`Content-Length: ${new TextEncoder().encode(options.body).byteLength}`);
  }
  hdrs.push("", ""); // end of headers
  const reqStr = hdrs.join("\r\n") + (options.body || "");
  const reqBytes = new TextEncoder().encode(reqStr);

  let lastError: Error | null = null;

  for (const strategy of strategies) {
    try {
      console.log(`mTLS trying: ${strategy.label} ${options.method} ${path}`);
      const conn = await (Deno as any).connectTls(strategy.opts);

      try {
        // Write request
        let written = 0;
        while (written < reqBytes.length) {
          const n = await conn.write(reqBytes.subarray(written));
          if (n === null) throw new Error("Write returned null");
          written += n;
        }

        // Read full response (tolerating close_notify)
        const rawBytes = await readFullStream(conn);
        const rawStr = new TextDecoder().decode(rawBytes);

        if (rawStr.length === 0) {
          throw new Error("Empty response from server");
        }

        const result = parseHttpResponse(rawStr);
        console.log(`mTLS OK [${strategy.label}]: status=${result.status} bodyLen=${result.body.length}`);
        return result;
      } finally {
        try { conn.close(); } catch { /* ignore */ }
      }
    } catch (e: any) {
      lastError = e;
      console.warn(`mTLS [${strategy.label}] failed: ${(e.message || "").substring(0, 100)}`);
    }
  }

  throw lastError || new Error("All mTLS strategies failed");
}

async function mtlsFetchWithRetry(
  path: string,
  opts: { method: string; headers?: Record<string, string>; body?: string },
  maxRetries = 3
): Promise<MtlsResult> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await mtlsFetch(path, opts);
    } catch (e: any) {
      lastError = e;
      console.warn(`Attempt ${attempt}/${maxRetries} failed: ${(e.message || "").substring(0, 100)}`);
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError || new Error("All retries exhausted");
}

// ══════════════════════════════════════════════════════════════
// API Efí
// ══════════════════════════════════════════════════════════════

async function getAccessToken(): Promise<string> {
  const credentials = btoa(`${getEnv("EFI_CLIENT_ID")}:${getEnv("EFI_CLIENT_SECRET")}`);
  const resp = await mtlsFetchWithRetry("/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ grant_type: "client_credentials" }),
  });
  if (resp.status !== 200) throw new Error(`OAuth failed (${resp.status}): ${resp.body.substring(0, 200)}`);
  return JSON.parse(resp.body).access_token;
}

async function createPixCharge(token: string, payload: any) {
  const resp = await mtlsFetchWithRetry("/v2/cob", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (resp.status < 200 || resp.status >= 300) throw new Error(`Create cob failed (${resp.status}): ${resp.body.substring(0, 200)}`);
  return JSON.parse(resp.body);
}

async function getQrCode(token: string, locId: number) {
  const resp = await mtlsFetchWithRetry(`/v2/loc/${locId}/qrcode`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (resp.status < 200 || resp.status >= 300) throw new Error(`QR code failed (${resp.status}): ${resp.body.substring(0, 200)}`);
  return JSON.parse(resp.body);
}

async function checkCobStatus(token: string, txid: string) {
  const resp = await mtlsFetchWithRetry(`/v2/cob/${txid}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (resp.status < 200 || resp.status >= 300) throw new Error(`Check cob failed (${resp.status}): ${resp.body.substring(0, 200)}`);
  return JSON.parse(resp.body);
}

async function registerWebhookEfi(token: string, pixKey: string, webhookUrl: string) {
  const resp = await mtlsFetchWithRetry(`/v2/webhook/${encodeURIComponent(pixKey)}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ webhookUrl }),
  });
  return { status: resp.status, body: resp.body };
}

async function checkWebhookEfi(token: string, pixKey: string) {
  const resp = await mtlsFetchWithRetry(`/v2/webhook/${encodeURIComponent(pixKey)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: resp.status, body: resp.body };
}

// ══════════════════════════════════════════════════════════════
// Supabase
// ══════════════════════════════════════════════════════════════

function adminSupa() {
  return createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"));
}

// ══════════════════════════════════════════════════════════════
// AUTH HELPERS
// ══════════════════════════════════════════════════════════════

async function authenticateUser(req: Request): Promise<{ userId: string } | Response> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const token = auth.replace("Bearer ", "");
  const supaUser = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: auth } },
  });
  const { data, error } = await supaUser.auth.getClaims(token);
  if (error || !data?.claims?.sub) return json({ error: "Unauthorized" }, 401);

  return { userId: data.claims.sub as string };
}

async function requireAdmin(req: Request): Promise<{ userId: string } | Response> {
  const result = await authenticateUser(req);
  if (result instanceof Response) return result;

  const db = adminSupa();
  const { data } = await db.from("user_roles")
    .select("role")
    .eq("user_id", result.userId)
    .eq("role", "admin");

  if (!data || data.length === 0) return json({ error: "Forbidden" }, 403);
  return result;
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
    const isWebhook =
      path === "webhook" ||
      path === "pix" ||
      (segments.length >= 2 && segments[segments.length - 2] === "webhook");

    if (isWebhook) {
      if (req.method === "GET") return json({ ok: true });
      return await handleWebhook(req);
    }

    // Admin endpoints
    if (path === "register-webhook") {
      const admin = await requireAdmin(req);
      if (admin instanceof Response) return admin;
      return await handleRegisterWebhook();
    }
    if (path === "check-webhook") {
      const admin = await requireAdmin(req);
      if (admin instanceof Response) return admin;
      return await handleCheckWebhook();
    }

    // Authenticated user endpoints
    const authResult = await authenticateUser(req);
    if (authResult instanceof Response) return authResult;
    const { userId } = authResult;

    const body = await req.json();

    if (path === "create-charge") return await handleCreateCharge(userId, body);
    if (path === "check-status") return await handleCheckStatus(userId, body);

    return json({ error: "Unknown action" }, 400);
  } catch (err: any) {
    console.error("pix-efi error:", err.message);
    return json({ error: err.message }, 500);
  }
});

// ══════════════════════════════════════════════════════════════
// ACTIONS
// ══════════════════════════════════════════════════════════════

async function handleCreateCharge(userId: string, body: any) {
  const { order_id, amount, descricao } = body;
  console.log("create-charge:", { order_id, userId });
  if (!order_id || !amount) return json({ error: "order_id and amount required" }, 400);

  try {
    const pixKey = getEnv("EFI_PIX_KEY");
    const token = await getAccessToken();

    const cob = await createPixCharge(token, {
      calendario: { expiracao: 3600 },
      valor: { original: Number(amount).toFixed(2) },
      chave: pixKey,
      solicitacaoPagador: descricao || "Pedido Turbo Lanches",
    });
    console.log("Charge created:", { txid: cob.txid, locId: cob.loc?.id });

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
  } catch (err: any) {
    console.error("create-charge ERROR:", err.message);
    return json({ error: err.message || "Erro ao gerar cobrança PIX" }, 500);
  }
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
  // Atomic lock: only update if still pending
  const { data: updated } = await db.from("orders")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      payment_confirmed: true,
    })
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
    console.log("PIX webhook received");

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
  } catch (err: any) {
    console.error("Webhook error:", err.message);
    return json({ ok: true });
  }
}

async function handleRegisterWebhook() {
  try {
    const pixKey = getEnv("EFI_PIX_KEY");
    const supaUrl = getEnv("SUPABASE_URL");
    const webhookUrl = `${supaUrl}/functions/v1/pix-efi/webhook`;

    const token = await getAccessToken();
    const result = await registerWebhookEfi(token, pixKey, webhookUrl);

    return json({
      registered: result.status >= 200 && result.status < 300,
      status: result.status,
      response: result.body,
      webhookUrl,
    });
  } catch (err: any) {
    console.error("Register webhook error:", err.message);
    return json({ error: err.message }, 500);
  }
}

async function handleCheckWebhook() {
  try {
    const pixKey = getEnv("EFI_PIX_KEY");
    const token = await getAccessToken();
    const result = await checkWebhookEfi(token, pixKey);

    return json({
      status: result.status,
      response: result.body,
    });
  } catch (err: any) {
    console.error("Check webhook error:", err.message);
    return json({ error: err.message }, 500);
  }
}
