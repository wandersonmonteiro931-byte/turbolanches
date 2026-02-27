/**
 * EFI mTLS Proxy - Deploy este arquivo em um servidor Node.js (Render, Railway, VPS)
 * 
 * Este proxy resolve o problema de mTLS que Edge Functions não suportam.
 * Ele faz a ponte entre suas Edge Functions e a API da EFI.
 * 
 * === VARIÁVEIS DE AMBIENTE NECESSÁRIAS ===
 * EFI_CLIENT_ID       - Client ID da EFI
 * EFI_CLIENT_SECRET   - Client Secret da EFI
 * EFI_PIX_KEY         - Chave PIX (CPF, CNPJ, email, telefone ou EVP)
 * EFI_CERT_PEM        - Certificado PEM da EFI (conteúdo completo)
 * EFI_KEY_PEM         - Chave privada PEM da EFI (conteúdo completo)
 * PROXY_SECRET        - Segredo compartilhado para autenticar chamadas do Supabase
 * SUPABASE_WEBHOOK_URL - URL do webhook Supabase (ex: https://kyoyfsxgqmlxwtnmtbuh.supabase.co/functions/v1/pix-webhook)
 * PORT                - Porta do servidor (default: 3000)
 * 
 * === DEPLOY NO RENDER.COM (Grátis) ===
 * 1. Crie um repositório Git com este arquivo + package.json
 * 2. No Render, crie um "Web Service" apontando para o repo
 * 3. Configure as variáveis de ambiente acima
 * 4. Deploy! A URL será algo como https://seu-proxy.onrender.com
 * 5. Configure EFI_PROXY_URL no Supabase secrets com essa URL
 * 
 * === package.json mínimo ===
 * {
 *   "name": "efi-mtls-proxy",
 *   "version": "1.0.0",
 *   "main": "efi-mtls-proxy.js",
 *   "scripts": { "start": "node efi-mtls-proxy.js" },
 *   "dependencies": { "express": "^4.18.0", "axios": "^1.6.0", "https": "^1.0.0" }
 * }
 */

const express = require("express");
const https = require("https");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const PROXY_SECRET = process.env.PROXY_SECRET || "";
const SUPABASE_WEBHOOK_URL = process.env.SUPABASE_WEBHOOK_URL || "";

// ── mTLS Agent ──────────────────────────────────────────────────────
function createMtlsAgent() {
  const cert = (process.env.EFI_CERT_PEM || "").replace(/\\n/g, "\n");
  const key = (process.env.EFI_KEY_PEM || "").replace(/\\n/g, "\n");
  return new https.Agent({ cert, key, rejectUnauthorized: true });
}

// ── EFI Token ───────────────────────────────────────────────────────
let cachedToken = null;
let tokenExpiry = 0;

async function getEfiToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const credentials = Buffer.from(
    `${process.env.EFI_CLIENT_ID}:${process.env.EFI_CLIENT_SECRET}`
  ).toString("base64");

  const res = await axios.post(
    "https://pix.api.efipay.com.br/oauth/token",
    { grant_type: "client_credentials" },
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
      httpsAgent: createMtlsAgent(),
      timeout: 10000,
    }
  );

  cachedToken = res.data.access_token;
  tokenExpiry = Date.now() + (res.data.expires_in - 60) * 1000;
  return cachedToken;
}

// ── Auth Middleware ──────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const secret = req.headers["x-proxy-secret"];
  if (!PROXY_SECRET || secret === PROXY_SECRET) {
    return next();
  }
  return res.status(401).json({ error: "Unauthorized" });
}

// ── Health Check ────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "ok", service: "efi-mtls-proxy" });
});

// ── Criar COB (Cobrança PIX) ────────────────────────────────────────
app.post("/create-cob", authMiddleware, async (req, res) => {
  try {
    const { txid, amount, description } = req.body;
    if (!txid || !amount) {
      return res.status(400).json({ error: "txid and amount required" });
    }

    const token = await getEfiToken();
    const pixKey = process.env.EFI_PIX_KEY;

    const cobPayload = {
      calendario: { expiracao: 3600 },
      devedor: {},
      valor: { original: Number(amount).toFixed(2) },
      chave: pixKey,
      solicitacaoPagador: description || "Pedido Turbo Lanches",
    };

    const cobRes = await axios.put(
      `https://pix.api.efipay.com.br/v2/cob/${txid}`,
      cobPayload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        httpsAgent: createMtlsAgent(),
        timeout: 15000,
      }
    );

    const cobData = cobRes.data;

    // Gerar QR Code da cobrança
    let qrcode = null;
    let qrcodeImage = null;
    if (cobData.loc?.id) {
      try {
        const qrRes = await axios.get(
          `https://pix.api.efipay.com.br/v2/loc/${cobData.loc.id}/qrcode`,
          {
            headers: { Authorization: `Bearer ${token}` },
            httpsAgent: createMtlsAgent(),
            timeout: 10000,
          }
        );
        qrcode = qrRes.data.qrcode;
        qrcodeImage = qrRes.data.imagemQrcode;
      } catch (qrErr) {
        console.error("QR code generation failed:", qrErr.message);
      }
    }

    res.json({
      txid: cobData.txid,
      status: cobData.status,
      qrcode: qrcode || cobData.pixCopiaECola,
      qrcode_image: qrcodeImage || null,
      loc_id: cobData.loc?.id || null,
    });
  } catch (err) {
    console.error("Create COB error:", err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// ── Verificar Status da COB ─────────────────────────────────────────
app.get("/check/:txid", authMiddleware, async (req, res) => {
  try {
    const token = await getEfiToken();
    const cobRes = await axios.get(
      `https://pix.api.efipay.com.br/v2/cob/${req.params.txid}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        httpsAgent: createMtlsAgent(),
        timeout: 10000,
      }
    );

    const cobData = cobRes.data;
    res.json({
      status: cobData.status, // ATIVA, CONCLUIDA, REMOVIDA_PELO_USUARIO_RECEBEDOR, REMOVIDA_PELO_PSP
      paid: cobData.status === "CONCLUIDA",
      txid: cobData.txid,
    });
  } catch (err) {
    console.error("Check COB error:", err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// ── Webhook da EFI (recebe notificação de pagamento) ────────────────
app.post("/webhook", async (req, res) => {
  try {
    console.log("EFI webhook received:", JSON.stringify(req.body));

    // Forward to Supabase edge function
    if (SUPABASE_WEBHOOK_URL) {
      await axios.post(SUPABASE_WEBHOOK_URL, req.body, {
        headers: { "Content-Type": "application/json" },
        timeout: 10000,
      });
      console.log("Forwarded to Supabase webhook successfully");
    }

    res.json({ status: "ok" });
  } catch (err) {
    console.error("Webhook forward error:", err.message);
    res.json({ status: "ok" }); // Always return 200 to EFI
  }
});

// EFI validates webhook with GET
app.get("/webhook", (req, res) => {
  res.status(200).send();
});

// ── Registrar Webhook na EFI ────────────────────────────────────────
app.post("/register-webhook", authMiddleware, async (req, res) => {
  try {
    const { webhook_url } = req.body;
    if (!webhook_url) {
      return res.status(400).json({ error: "webhook_url required" });
    }

    const token = await getEfiToken();
    const pixKey = process.env.EFI_PIX_KEY;

    await axios.put(
      `https://pix.api.efipay.com.br/v2/webhook/${pixKey}`,
      { webhookUrl: webhook_url },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        httpsAgent: createMtlsAgent(),
        timeout: 10000,
      }
    );

    res.json({ status: "ok", message: "Webhook registered successfully" });
  } catch (err) {
    console.error("Register webhook error:", err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 EFI mTLS Proxy running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/`);
  console.log(`   Create COB: POST /create-cob`);
  console.log(`   Check Status: GET /check/:txid`);
  console.log(`   Webhook: POST /webhook`);
});
