const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HOST = '127.0.0.1';
const PORT = 8182;
const BASE_DIR = __dirname;
const CERT_PATH = path.join(BASE_DIR, 'digital-certificate.txt');
const KEY_PATH = path.join(BASE_DIR, 'private-key.pem');
const LOG_PATH = path.join(BASE_DIR, 'signer.log');
const ALLOWED_ORIGINS = new Set([
  'https://turbolanches.lovable.app',
]);

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try { fs.appendFileSync(LOG_PATH, line, 'utf8'); } catch (_) {}
}

function send(res, status, body, contentType = 'text/plain; charset=utf-8') {
  res.statusCode = status;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

function applyCors(req, res) {
  const origin = req.headers.origin || '';
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
}

function originAllowed(req) {
  const origin = req.headers.origin || '';
  return ALLOWED_ORIGINS.has(origin);
}

function readRequiredFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} não encontrado em ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.trim()) {
    throw new Error(`${label} está vazio em ${filePath}`);
  }
  return content;
}

const server = http.createServer((req, res) => {
  applyCors(req, res);

  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);

  if (req.method === 'OPTIONS') {
    if (!originAllowed(req)) {
      return send(res, 403, 'Origem não autorizada.');
    }
    res.statusCode = 204;
    return res.end();
  }

  if (url.pathname === '/health' && req.method === 'GET') {
    // Permite a checagem local do instalador (sem Origin) e do site autorizado.
    const origin = req.headers.origin || '';
    if (origin && !originAllowed(req)) {
      return send(res, 403, 'Origem não autorizada.');
    }

    let certificateOk = false;
    let privateKeyOk = false;
    try { certificateOk = !!readRequiredFile(CERT_PATH, 'Certificado').trim(); } catch (_) {}
    try { privateKeyOk = !!readRequiredFile(KEY_PATH, 'Chave privada').trim(); } catch (_) {}

    return send(
      res,
      200,
      JSON.stringify({
        ok: certificateOk && privateKeyOk,
        service: 'TurboLanches QZ Local Signer',
        certificateOk,
        privateKeyOk,
      }),
      'application/json; charset=utf-8',
    );
  }

  if (!originAllowed(req)) {
    log(`Bloqueado acesso de origem: ${req.headers.origin || '(sem Origin)'} ${req.method} ${url.pathname}`);
    return send(res, 403, 'Origem não autorizada.');
  }

  if (url.pathname === '/certificate' && req.method === 'GET') {
    try {
      const certificate = readRequiredFile(CERT_PATH, 'Certificado');
      return send(res, 200, certificate);
    } catch (error) {
      log(`Erro ao carregar certificado: ${error.message}`);
      return send(res, 500, error.message);
    }
  }

  if (url.pathname === '/sign' && req.method === 'POST') {
    let body = '';
    let tooLarge = false;

    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        tooLarge = true;
        req.destroy();
      }
    });

    req.on('end', () => {
      if (tooLarge) {
        return send(res, 413, 'Solicitação muito grande.');
      }

      try {
        const privateKey = readRequiredFile(KEY_PATH, 'Chave privada');
        const signature = crypto.sign(
          'RSA-SHA512',
          Buffer.from(body, 'utf8'),
          {
            key: privateKey,
            padding: crypto.constants.RSA_PKCS1_PADDING,
          },
        );
        return send(res, 200, signature.toString('base64'));
      } catch (error) {
        log(`Erro ao assinar solicitação: ${error.stack || error.message}`);
        return send(res, 500, `Falha ao assinar: ${error.message}`);
      }
    });

    req.on('error', (error) => {
      log(`Erro de leitura da solicitação: ${error.message}`);
      if (!res.headersSent) send(res, 500, 'Falha ao ler solicitação.');
    });

    return;
  }

  return send(res, 404, 'Não encontrado.');
});

server.on('error', (error) => {
  log(`Falha fatal do servidor: ${error.stack || error.message}`);
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  log(`Signer iniciado em http://${HOST}:${PORT} para https://turbolanches.lovable.app`);
});

process.on('uncaughtException', (error) => {
  log(`uncaughtException: ${error.stack || error.message}`);
});

process.on('unhandledRejection', (error) => {
  log(`unhandledRejection: ${error && error.stack ? error.stack : String(error)}`);
});
