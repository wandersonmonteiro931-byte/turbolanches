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
// SAQUES E REPASSES
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

async function canManageWithdrawal(userId: string, storeId: string): Promise<boolean> {
  const db = adminSupa();
  const [{ data: platform }, { data: role }] = await Promise.all([
    db.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle(),
    db.from("user_roles").select("id").eq("user_id", userId).eq("role", "admin").eq("store_id", storeId).maybeSingle(),
  ]);
  return Boolean(platform || role);
}

async function isPlatformAdmin(userId: string): Promise<boolean> {
  const { data } = await adminSupa().from("platform_admins")
    .select("user_id").eq("user_id", userId).maybeSingle();
  return Boolean(data);
}

async function sendPixPayout(token: string, withdrawal: any, description: string) {
  const document = String(withdrawal.payout_holder_document || "").replace(/\D/g, "");
  const favorecido: Record<string, string> = { chave: withdrawal.payout_pix_key };
  if (document.length === 11) favorecido.cpf = document;
  if (document.length === 14) favorecido.cnpj = document;

  const safeDescription = (Deno.env.get("EFI_PAYOUT_DESCRIPTION_OVERRIDE") || description || "REPASSE TURBO LANCHES").trim();
  const payload = {
    valor: Number(withdrawal.net_amount).toFixed(2),
    pagador: {
      chave: getEnv("EFI_PIX_KEY"),
      infoPagador: `${safeDescription} - ${withdrawal.id.slice(0, 8)}`.slice(0, 140),
    },
    favorecido,
  };

  const resp = await mtlsFetchWithRetry(`/v3/gn/pix/${encodeURIComponent(withdrawal.id_envio)}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }, 1);

  let parsed: any = null;
  try { parsed = JSON.parse(resp.body); } catch { parsed = { raw: resp.body }; }
  return { status: resp.status, data: parsed };
}

async function consultPixPayout(token: string, idEnvio: string) {
  const resp = await mtlsFetchWithRetry(`/v2/gn/pix/enviados/id-envio/${encodeURIComponent(idEnvio)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  }, 2);
  let parsed: any = null;
  try { parsed = JSON.parse(resp.body); } catch { parsed = { raw: resp.body }; }
  return { status: resp.status, data: parsed };
}

function payoutErrorMessage(data: any): string {
  return data?.detail || data?.mensagem || data?.message || data?.title || data?.nome || "Falha ao enviar o PIX";
}

function isFinalFailure(status: string): boolean {
  return ["NAO_REALIZADO", "NÃO_REALIZADO", "REJEITADO", "FALHA", "FALHOU", "CANCELADO", "DEVOLVIDO"].includes(status);
}

async function processWithdrawal(withdrawalId: string) {
  const db = adminSupa();
  const { data: withdrawal, error } = await db.from("wallet_withdrawal_requests")
    .select("*").eq("id", withdrawalId).maybeSingle();

  if (error) throw error;
  if (!withdrawal) return json({ error: "Solicitação de saque não encontrada" }, 404);
  if (withdrawal.status === "paid") return json({ ok: true, status: "paid", withdrawal });
  if (!["requested", "processing"].includes(withdrawal.status)) {
    return json({ error: `Saque não pode ser processado no status ${withdrawal.status}` }, 409);
  }

  await db.rpc("mark_withdrawal_processing", {
    _withdrawal_id: withdrawal.id,
    _efi_e2e_id: withdrawal.efi_e2e_id || null,
    _efi_status: withdrawal.efi_status || "INICIANDO",
  });

  try {
    const { data: settings, error: settingsError } = await db
      .from("platform_finance_settings")
      .select("payout_description")
      .eq("id", 1)
      .single();
    if (settingsError) throw settingsError;

    const token = await getAccessToken();
    const result = await sendPixPayout(token, withdrawal, settings?.payout_description || "REPASSE TURBO LANCHES");
    const status = String(result.data?.status || "").toUpperCase();

    if (result.status >= 200 && result.status < 300) {
      await db.rpc("mark_withdrawal_processing", {
        _withdrawal_id: withdrawal.id,
        _efi_e2e_id: result.data?.e2eId || result.data?.endToEndId || null,
        _efi_status: status || "EM_PROCESSAMENTO",
      });

      if (["REALIZADO", "CONCLUIDA", "LIQUIDADO"].includes(status)) {
        await db.rpc("mark_withdrawal_paid", {
          _id_envio: withdrawal.id_envio,
          _efi_e2e_id: result.data?.e2eId || result.data?.endToEndId || null,
          _efi_status: status,
        });
      }

      return json({ ok: true, status: status || "EM_PROCESSAMENTO", data: result.data });
    }

    const message = payoutErrorMessage(result.data);
    if (result.status >= 500) {
      // A Efí informa que um 5xx pode ter sido processado. Mantemos reservado para consulta idempotente.
      await db.from("wallet_withdrawal_requests").update({
        status: "processing",
        efi_status: `HTTP_${result.status}_CONSULTAR`,
        error_message: message,
        updated_at: new Date().toISOString(),
      }).eq("id", withdrawal.id);
      return json({ ok: false, uncertain: true, error: message }, 202);
    }

    await db.rpc("mark_withdrawal_failed", {
      _withdrawal_id: withdrawal.id,
      _error_message: message,
      _efi_status: status || `HTTP_${result.status}`,
    });
    return json({ error: message }, result.status || 400);
  } catch (err: any) {
    // Erro de conexão também é incerto: consultar antes de liberar o saldo.
    await db.from("wallet_withdrawal_requests").update({
      status: "processing",
      efi_status: "CONEXAO_INDEFINIDA",
      error_message: String(err.message || err).slice(0, 1000),
      updated_at: new Date().toISOString(),
    }).eq("id", withdrawal.id);
    return json({ ok: false, uncertain: true, error: "Envio em verificação. Não solicite novamente." }, 202);
  }
}

async function checkWithdrawal(withdrawalId: string) {
  const db = adminSupa();
  const { data: withdrawal, error } = await db.from("wallet_withdrawal_requests")
    .select("*").eq("id", withdrawalId).maybeSingle();
  if (error) throw error;
  if (!withdrawal) return json({ error: "Solicitação não encontrada" }, 404);
  if (["paid", "failed", "cancelled"].includes(withdrawal.status)) return json({ withdrawal });

  const token = await getAccessToken();
  const result = await consultPixPayout(token, withdrawal.id_envio);
  if (result.status === 404) return json({ withdrawal, status: "AGUARDANDO_ENVIO" });
  if (result.status < 200 || result.status >= 300) {
    return json({ withdrawal, status: "CONSULTA_INDISPONIVEL" }, 202);
  }

  const status = String(result.data?.status || "").toUpperCase();
  if (["REALIZADO", "CONCLUIDA", "LIQUIDADO"].includes(status)) {
    await db.rpc("mark_withdrawal_paid", {
      _id_envio: withdrawal.id_envio,
      _efi_e2e_id: result.data?.endToEndId || result.data?.e2eId || null,
      _efi_status: status,
    });
  } else if (isFinalFailure(status)) {
    await db.rpc("mark_withdrawal_failed", {
      _withdrawal_id: withdrawal.id,
      _error_message: payoutErrorMessage(result.data),
      _efi_status: status,
    });
  } else {
    await db.rpc("mark_withdrawal_processing", {
      _withdrawal_id: withdrawal.id,
      _efi_e2e_id: result.data?.endToEndId || result.data?.e2eId || null,
      _efi_status: status || "EM_PROCESSAMENTO",
    });
  }

  const { data: updated } = await db.from("wallet_withdrawal_requests")
    .select("*").eq("id", withdrawal.id).single();
  return json({ withdrawal: updated });
}

async function processAutomaticPayouts() {
  const db = adminSupa();
  const { data: accounts, error } = await db.from("store_financial_accounts")
    .select("store_id")
    .eq("status", "active")
    .eq("auto_payout_enabled", true)
    .neq("auto_payout_frequency", "manual")
    .limit(1000);
  if (error) throw error;

  const results: any[] = [];
  for (const account of accounts || []) {
    const { data: withdrawalId, error: createError } = await db.rpc("create_automatic_withdrawal", {
      _store_id: account.store_id,
    });
    if (createError) {
      results.push({ store_id: account.store_id, ok: false, error: createError.message });
      continue;
    }
    if (!withdrawalId) continue;

    const response = await processWithdrawal(withdrawalId);
    let payload: any = {};
    try { payload = await response.clone().json(); } catch { /* ignore */ }
    results.push({ store_id: account.store_id, withdrawal_id: withdrawalId, http_status: response.status, ...payload });
  }
  return json({ ok: true, processed: results.length, results });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const path = url.pathname.split("/").filter(Boolean).pop() || "";

    if (path === "process-auto-payouts") {
      const cronSecret = req.headers.get("x-cron-secret");
      if (cronSecret && cronSecret === Deno.env.get("WALLET_CRON_SECRET")) {
        return await processAutomaticPayouts();
      }
      const auth = await authenticateUser(req);
      if (auth instanceof Response) return auth;
      if (!(await isPlatformAdmin(auth.userId))) return json({ error: "Forbidden" }, 403);
      return await processAutomaticPayouts();
    }

    const auth = await authenticateUser(req);
    if (auth instanceof Response) return auth;
    const body = await req.json().catch(() => ({}));
    const withdrawalId = body.withdrawal_id;
    if (!withdrawalId) return json({ error: "withdrawal_id required" }, 400);

    const db = adminSupa();
    const { data: withdrawal } = await db.from("wallet_withdrawal_requests")
      .select("store_id").eq("id", withdrawalId).maybeSingle();
    if (!withdrawal) return json({ error: "Solicitação não encontrada" }, 404);
    if (!(await canManageWithdrawal(auth.userId, withdrawal.store_id))) return json({ error: "Forbidden" }, 403);

    if (path === "process-withdrawal") return await processWithdrawal(withdrawalId);
    if (path === "check-withdrawal") return await checkWithdrawal(withdrawalId);

    return json({ error: "Unknown action" }, 400);
  } catch (err: any) {
    console.error("wallet-efi error:", err.message);
    return json({ error: err.message || "Erro financeiro" }, 500);
  }
});
