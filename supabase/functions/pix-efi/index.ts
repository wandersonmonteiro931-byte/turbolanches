// Polyfill crypto.randomBytes for node-forge in Deno
import { Buffer } from "node:buffer";
if (typeof globalThis.crypto !== "undefined" && !(globalThis as any).crypto.randomBytes) {
  (globalThis as any).crypto.randomBytes = (size: number) => {
    const buf = new Uint8Array(size);
    crypto.getRandomValues(buf);
    return Buffer.from(buf);
  };
}

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
let _cachedForgeKey: any = null;

function getPemCredentials(): { cert: string; key: string; forgeKey: any } {
  if (_cachedPem && _cachedForgeKey) return { ..._cachedPem, forgeKey: _cachedForgeKey };

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
  _cachedForgeKey = keyBag.key;
  return { cert, key, forgeKey: _cachedForgeKey };
}

// ══════════════════════════════════════════════════════════════
// mTLS via forge pure-JS TLS over raw TCP (Deno.connect)
// Completely bypasses Deno rustls and node compat layer
// ══════════════════════════════════════════════════════════════

const EFI_HOST = "pix.api.efipay.com.br";

async function mtlsFetch(
  path: string,
  options: { method: string; headers?: Record<string, string>; body?: string }
): Promise<{ status: number; body: string }> {
  const { cert, key } = getPemCredentials();

  // 1. Raw TCP connection (no TLS — forge handles TLS in pure JS)
  const conn = await Deno.connect({ hostname: EFI_HOST, port: 443 });

  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    let responseData = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { conn.close(); } catch { /* */ }
        reject(new Error("Request timeout 20s"));
      }
    }, 20000);

    function finish() {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      try { conn.close(); } catch { /* */ }

      const idx = responseData.indexOf("\r\n\r\n");
      if (idx === -1) {
        console.error("Raw response (first 500 chars):", responseData.substring(0, 500));
        reject(new Error("No HTTP headers in response, data length: " + responseData.length));
        return;
      }
      const hdr = responseData.substring(0, idx);
      let body = responseData.substring(idx + 4);
      const m = hdr.match(/HTTP\/\d\.\d\s+(\d+)/);
      const status = m ? parseInt(m[1]) : 0;
      if (hdr.toLowerCase().includes("transfer-encoding: chunked")) body = decodeChunked(body);
      resolve({ status, body });
    }

    // Serialize writes to TCP
    let writeChain = Promise.resolve();
    function tcpWrite(bytes: Uint8Array) {
      writeChain = writeChain.then(() => conn.write(bytes)).catch(() => {});
    }

    // 2. Forge TLS connection (pure JS TLS implementation)
    const tls = forge.tls.createConnection({
      server: false,
      verify: (_c: any, _verified: any, _depth: any, _certs: any) => true,
      connected: (_c: any) => {
        console.log("forge TLS handshake complete");
        // Build and send HTTP/1.1 request
        const bodyLen = options.body
          ? new TextEncoder().encode(options.body).length
          : 0;
        let req = `${options.method} ${path} HTTP/1.1\r\n`;
        req += `Host: ${EFI_HOST}\r\n`;
        req += `Connection: close\r\n`;
        if (bodyLen > 0) req += `Content-Length: ${bodyLen}\r\n`;
        for (const [k, v] of Object.entries(options.headers || {})) {
          req += `${k}: ${v}\r\n`;
        }
        req += "\r\n";
        if (options.body) req += options.body;
        tls.prepare(req);
      },
      getCertificate: () => cert,
      getPrivateKey: () => key,
      tlsDataReady: (c: any) => {
        // Encrypted data ready → write to raw TCP socket
        const data = c.tlsData.getBytes();
        const buf = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) buf[i] = data.charCodeAt(i);
        tcpWrite(buf);
      },
      dataReady: (c: any) => {
        // Decrypted HTTP data received
        responseData += c.data.getBytes();
      },
      closed: () => {
        console.log("forge TLS closed, response length:", responseData.length);
        finish();
      },
      error: (_c: any, error: any) => {
        clearTimeout(timer);
        console.error("forge TLS error:", error.message);
        // If we already have response data, try to use it
        if (responseData.length > 0) {
          finish();
        } else if (!settled) {
          settled = true;
          try { conn.close(); } catch { /* */ }
          reject(new Error(`TLS error: ${error.message}`));
        }
      },
    });

    // 3. Start TLS handshake
    tls.handshake();

    // 4. Read loop: raw TCP → forge TLS processor
    (async () => {
      const buf = new Uint8Array(16384);
      try {
        while (!settled) {
          const n = await conn.read(buf);
          if (n === null) {
            // TCP connection closed by peer — normal with Connection: close
            finish();
            break;
          }
          // Convert Uint8Array to forge binary string
          let str = "";
          for (let i = 0; i < n; i++) str += String.fromCharCode(buf[i]);
          tls.process(str);
        }
      } catch (_e) {
        // TCP read error — resolve with whatever data we have
        finish();
      }
    })();
  });
}

function decodeChunked(raw: string): string {
  const parts: string[] = [];
  let pos = 0;
  while (pos < raw.length) {
    const nl = raw.indexOf("\r\n", pos);
    if (nl === -1) break;
    const size = parseInt(raw.substring(pos, nl).trim(), 16);
    if (isNaN(size) || size === 0) break;
    pos = nl + 2;
    parts.push(raw.substring(pos, pos + size));
    pos += size + 2;
  }
  return parts.join("");
}

async function mtlsFetchRetry(path: string, opts: any, retries = 2) {
  let lastError: Error | null = null;
  for (let i = 1; i <= retries; i++) {
    try {
      return await mtlsFetch(path, opts);
    } catch (e) {
      lastError = e as Error;
      console.warn(`mtlsFetch attempt ${i}/${retries} failed: ${lastError.message}`);
      if (i < retries) await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
  throw lastError || new Error("All retries failed");
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
  console.log("create-charge called:", { order_id, amount, userId });
  if (!order_id || !amount) return json({ error: "order_id and amount required" }, 400);

  try {
    const pixKey = getEnv("EFI_PIX_KEY");
    console.log("Getting OAuth token...");
    const token = await getAccessToken();
    console.log("OAuth token obtained");

    console.log("Creating PIX charge...");
    const cob = await createPixCharge(token, {
      calendario: { expiracao: 3600 },
      valor: { original: Number(amount).toFixed(2) },
      chave: pixKey,
      solicitacaoPagador: descricao || "Pedido Turbo Lanches",
    });
    console.log("PIX charge created:", { txid: cob.txid, locId: cob.loc?.id });

    console.log("Getting QR code...");
    const qr = await getQrCode(token, cob.loc.id);
    console.log("QR code obtained, length:", qr.qrcode?.length);

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
    console.error("create-charge ERROR:", err.message, err.stack);
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
