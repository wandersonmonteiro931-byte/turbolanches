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

const EFI_HOST = (
  Deno.env.get("EFI_API_HOST") ||
  (Deno.env.get("EFI_ENVIRONMENT") === "homologation"
    ? "pix-h.api.efipay.com.br"
    : "pix.api.efipay.com.br")
)
  .replace(/^https?:\/\//, "")
  .replace(/\/+$/, "");

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

async function createOrGetPixCharge(token: string, txid: string, payload: any) {
  // PUT com txid próprio torna a criação idempotente: o mesmo pedido nunca recebe
  // duas cobranças diferentes mesmo se o cliente clicar novamente ou houver retry.
  const resp = await mtlsFetchWithRetry(`/v2/cob/${encodeURIComponent(txid)}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (resp.status >= 200 && resp.status < 300) return JSON.parse(resp.body);

  // Se a cobrança já existir, consulta a cobrança com o mesmo txid em vez de criar outra.
  if (resp.status === 409 || resp.status === 422) {
    try {
      return await checkCobStatus(token, txid);
    } catch {
      // Mantém o erro original caso a consulta também falhe.
    }
  }

  throw new Error(`Create cob failed (${resp.status}): ${resp.body.substring(0, 200)}`);
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
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      // Supabase Edge Functions não permitem configurar a validação mTLS de entrada.
      // A Efí oferece skip-mTLS para hospedagens compartilhadas; o callback continua
      // protegido pelo segredo HMAC longo presente na URL cadastrada.
      "x-skip-mtls-checking": "true",
    },
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

async function requirePlatformAdmin(req: Request): Promise<{ userId: string } | Response> {
  const result = await authenticateUser(req);
  if (result instanceof Response) return result;

  const { data } = await adminSupa().from("platform_admins")
    .select("user_id")
    .eq("user_id", result.userId)
    .maybeSingle();

  if (!data) return json({ error: "Forbidden" }, 403);
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
      const admin = await requirePlatformAdmin(req);
      if (admin instanceof Response) return admin;
      return await handleRegisterWebhook();
    }
    if (path === "check-webhook") {
      const admin = await requirePlatformAdmin(req);
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
  const { order_id, descricao } = body;
  console.log("create-charge:", { order_id, userId });
  if (!order_id) return json({ error: "order_id required" }, 400);

  try {
    const db = adminSupa();
    const { data: order, error: orderError } = await db
      .from("orders")
      .select("id, user_id, store_id, order_number, total, status, payment_method, payment_confirmed, pix_txid, pix_copia_cola, pix_qrcode_image, pix_loc_id")
      .eq("id", order_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (orderError) throw orderError;
    if (!order) return json({ error: "Pedido não encontrado" }, 404);
    if (order.payment_method !== "pix") return json({ error: "O pedido não utiliza PIX" }, 400);
    if (order.payment_confirmed) return json({ error: "Pedido já foi pago" }, 409);
    if (!["pending", "awaiting_payment"].includes(order.status)) {
      return json({ error: "Pedido não está aguardando pagamento" }, 409);
    }

    // Reaproveita a cobrança já criada para impedir vários QR Codes para o mesmo pedido.
    if (order.pix_txid && order.pix_copia_cola && order.pix_qrcode_image) {
      return json({
        txid: order.pix_txid,
        qrcode: order.pix_copia_cola,
        qrcode_image: order.pix_qrcode_image,
        expiracao: 3600,
        reused: true,
      });
    }

    const pixKey = getEnv("EFI_PIX_KEY");
    const token = await getAccessToken();
    const description = descricao || `Pedido #${order.order_number || order.id.slice(0, 8)} - Turbo Lanches`;

    // O valor sempre vem do banco. O navegador não escolhe o valor cobrado.
    const deterministicTxid = order.id.replace(/-/g, "");
    const cob = await createOrGetPixCharge(token, deterministicTxid, {
      calendario: { expiracao: 3600 },
      valor: { original: Number(order.total).toFixed(2) },
      chave: pixKey,
      solicitacaoPagador: String(description).slice(0, 140),
      infoAdicionais: [
        { nome: "pedido_id", valor: order.id },
        { nome: "loja_id", valor: order.store_id || "" },
      ],
    });
    const chargedAmount = Number(cob?.valor?.original ?? order.total);
    if (!Number.isFinite(chargedAmount) || Math.abs(chargedAmount - Number(order.total)) > 0.01) {
      throw new Error("A cobrança PIX existente possui valor diferente do pedido");
    }
    if (!cob?.loc?.id) throw new Error("A cobrança PIX não retornou uma localização válida");

    console.log("Charge created:", { txid: cob.txid, locId: cob.loc.id, orderId: order.id });

    const qr = await getQrCode(token, cob.loc.id);

    const { error: updateError } = await db.from("orders").update({
      pix_txid: cob.txid,
      pix_copia_cola: qr.qrcode,
      pix_qrcode_image: qr.imagemQrcode,
      pix_loc_id: cob.loc.id,
      status: "pending",
    }).eq("id", order.id).eq("user_id", userId).eq("payment_confirmed", false);

    if (updateError) throw updateError;

    return json({
      txid: cob.txid,
      qrcode: qr.qrcode,
      qrcode_image: qr.imagemQrcode,
      location: cob.loc.location,
      expiracao: cob.calendario.expiracao,
      amount: Number(order.total),
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
  const { data: order, error: queryErr } = await db.from("orders").select("*")
    .eq("id", order_id).eq("user_id", userId).maybeSingle();

  if (queryErr) {
    console.error("check-status query error:", queryErr.message);
    return json({ error: "DB query error" }, 500);
  }

  if (!order) {
    // Could be a timing issue — order not yet visible; return pending instead of 404
    console.warn("check-status: order not found yet", { order_id, userId: userId.substring(0, 8) });
    return json({ status: "pending", confirmed: false });
  }

  if (order.payment_confirmed) return json({ status: order.status, confirmed: true });
  if (!["pending", "awaiting_payment"].includes(order.status)) {
    return json({ status: order.status, confirmed: false });
  }

  if (order.pix_txid) {
    try {
      const token = await getAccessToken();
      const cobData = await checkCobStatus(token, order.pix_txid);

      if (cobData.status === "CONCLUIDA") {
        const payment = Array.isArray(cobData.pix) ? cobData.pix[0] : null;
        await confirmOrder(db, order, {
          txid: order.pix_txid,
          endToEndId: payment?.endToEndId || payment?.end_to_end_id || null,
          amount: Number(payment?.valor || order.total),
          paidAt: payment?.horario || new Date().toISOString(),
          rawPayload: cobData,
        });
        return json({ status: "paid", confirmed: true });
      }
    } catch (err: any) {
      console.error("Check status error:", err.message);
    }
  }

  return json({ status: "pending", confirmed: false });
}

async function confirmOrder(
  db: any,
  order: any,
  payment: {
    txid?: string | null;
    endToEndId?: string | null;
    amount?: number | null;
    paidAt?: string | null;
    rawPayload?: unknown;
  }
) {
  if (order.payment_confirmed) {
    console.log(`Order ${order.id} already processed — skipping`);
    return;
  }

  const paidAmount = Number(payment.amount ?? order.total);
  const paidAt = payment.paidAt || new Date().toISOString();

  const { error } = await db.rpc("confirm_pix_order_and_credit_wallet", {
    _order_id: order.id,
    _txid: payment.txid || order.pix_txid || null,
    _end_to_end_id: payment.endToEndId || null,
    _paid_amount: paidAmount,
    _paid_at: paidAt,
    _raw_payload: payment.rawPayload || {},
  });

  if (error) {
    console.error(`Wallet credit failed for order ${order.id}:`, error.message);
    throw error;
  }

  console.log(`Order ${order.id} confirmed and store wallet credited!`);
}

async function handleWebhook(req: Request) {
  const expectedSecret = getEnv("EFI_WEBHOOK_SECRET");
  const suppliedSecret = new URL(req.url).searchParams.get("hmac");
  if (!suppliedSecret || suppliedSecret !== expectedSecret) {
    console.warn("Webhook Efí rejected: invalid secret");
    return json({ error: "Unauthorized webhook" }, 401);
  }

  try {
    const body = await req.json();
    console.log("PIX webhook received");

    const pixArray = Array.isArray(body.pix) ? body.pix : [];
    const db = adminSupa();

    for (const pix of pixArray) {
      // Retorno de PIX enviado (saque/repasse). Na Efí, o idEnvio vem em gnExtras.
      const idEnvio = pix?.gnExtras?.idEnvio || pix.idEnvio || pix.id_envio;
      if (idEnvio) {
        const status = String(pix.status || "").toUpperCase();
        const e2eId = pix.endToEndId || pix.e2eId || null;

        if (["REALIZADO", "CONCLUIDA", "LIQUIDADO"].includes(status)) {
          const { error } = await db.rpc("mark_withdrawal_paid", {
            _id_envio: idEnvio,
            _efi_e2e_id: e2eId,
            _efi_status: status,
          });
          if (error) throw error;
        } else if (["NAO_REALIZADO", "NÃO_REALIZADO", "REJEITADO", "FALHA", "FALHOU", "CANCELADO", "DEVOLVIDO"].includes(status)) {
          const { data: withdrawal, error: withdrawalError } = await db
            .from("wallet_withdrawal_requests")
            .select("id")
            .eq("id_envio", idEnvio)
            .maybeSingle();
          if (withdrawalError) throw withdrawalError;
          if (withdrawal) {
            const reason = pix?.gnExtras?.erro?.motivo || pix?.gnExtras?.erro?.descricao || `Repasse ${status}`;
            const { error } = await db.rpc("mark_withdrawal_failed", {
              _withdrawal_id: withdrawal.id,
              _error_message: String(reason),
              _efi_status: status,
            });
            if (error) throw error;
          }
        } else {
          const { data: withdrawal, error: withdrawalError } = await db
            .from("wallet_withdrawal_requests")
            .select("id")
            .eq("id_envio", idEnvio)
            .maybeSingle();
          if (withdrawalError) throw withdrawalError;
          if (withdrawal) {
            const { error } = await db.rpc("mark_withdrawal_processing", {
              _withdrawal_id: withdrawal.id,
              _efi_e2e_id: e2eId,
              _efi_status: status || "EM_PROCESSAMENTO",
            });
            if (error) throw error;
          }
        }
        continue;
      }

      // PIX recebido de um cliente.
      const txid = pix.txid;
      if (!txid) continue;

      const { data: order, error: orderError } = await db.from("orders")
        .select("*").eq("pix_txid", txid).maybeSingle();

      if (orderError) throw orderError;

      if (order && !order.payment_confirmed) {
        await confirmOrder(db, order, {
          txid,
          endToEndId: pix.endToEndId || pix.e2eId || null,
          amount: Number(pix.valor || order.total),
          paidAt: pix.horario || new Date().toISOString(),
          rawPayload: pix,
        });
      }
    }

    return json({ ok: true });
  } catch (err: any) {
    // Retorna erro para permitir nova tentativa da Efí. O ledger é idempotente.
    console.error("Webhook error:", err.message);
    return json({ error: "Webhook processing failed" }, 500);
  }
}

async function handleRegisterWebhook() {
  try {
    const pixKey = getEnv("EFI_PIX_KEY");
    const supaUrl = getEnv("SUPABASE_URL");
    const webhookSecret = getEnv("EFI_WEBHOOK_SECRET");
    // O parâmetro ignorar evita o sufixo /pix adicionado pela Efí e mantém a rota explícita.
    const webhookUrl = `${supaUrl}/functions/v1/pix-efi/webhook?hmac=${encodeURIComponent(webhookSecret)}&ignorar=`;

    const token = await getAccessToken();
    const result = await registerWebhookEfi(token, pixKey, webhookUrl);

    return json({
      registered: result.status >= 200 && result.status < 300,
      status: result.status,
      response: result.body,
      webhookBaseUrl: `${supaUrl}/functions/v1/pix-efi/webhook`,
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
