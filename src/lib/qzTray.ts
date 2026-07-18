/**
 * Cliente QZ Tray para impressão raw (ESC/POS).
 *
 * QZ Tray (https://qz.io) é um aplicativo gratuito que roda no PC do kiosk
 * e expõe uma API local via WebSocket (wss://localhost:8181). Este módulo
 * carrega o SDK oficial sob demanda, conecta e envia bytes brutos para a
 * impressora térmica nominada — pulando completamente o navegador, drivers
 * de papel e CSS. Resultado: corte exato, zero sobra de papel.
 *
 * IMPORTANTE — pré-requisitos no PC:
 *   1. Instalar QZ Tray (https://qz.io/download/) — Windows/Mac/Linux.
 *   2. Iniciar o aplicativo (ele fica na bandeja do sistema).
 *   3. Conceder permissão "Sempre permitir" para este site na primeira impressão.
 *
 * Modo "promiscuous": usamos o QZ sem assinatura digital. Isso causa um
 * popup de confirmação na PRIMEIRA impressão (depois pode marcar "lembrar").
 * Para produção sem prompt, gere um certificado em qz.io/wiki/2.0-signing-messages.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { supabase } from "@/integrations/supabase/client";

const QZ_CDN_URL = "https://cdn.jsdelivr.net/npm/qz-tray@2.2.5/qz-tray.js";

const QZ_DIGITAL_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIECzCCAvOgAwIBAgIGAZ92rYSGMA0GCSqGSIb3DQEBCwUAMIGiMQswCQYDVQQG
EwJVUzELMAkGA1UECAwCTlkxEjAQBgNVBAcMCUNhbmFzdG90YTEbMBkGA1UECgwS
UVogSW5kdXN0cmllcywgDcJHrrHSgvFpsYxqb6g97uaQTd2kE31rPUeDZTeDsjVq
HDAaBgkqhkiG9w0BCQEWDXN1cHBvcnRAcXouaW8xGjAYBgNVBAMMEVFaIFRyYXkg
RGVtbyBDZXJ0MB4XDTI2MDcxNzE5MjE1MFoXDTQ2MDcxNzE5MjE1MFowgaIxCzAJ
BgNVBAYTAlVTMQswCQYDVQQIDAJOWTESMBAGA1UEBwwJQ2FuYXN0b3RhMRswGQYD
VQQKDBJRWiBJbmR1c3RyaWVzLCBMTEMxGzAZBgNVBAsMElFaIEluZHVzdHJpZXMs
IExMQzEcMBoGCSqGSIb3DcJHrrHSgvFpsYxqb6g97uaQTd2kE31rPUeDZTeDsjVq
VHJheSBEZW1vIENlcnQwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDG
0gVMpqsY5u7YEhwdEIadaj9z7cUMxcey5RD+hitYdsExJ7Oq7m8DqqRVTx7PkqXN
EPbfzVLLNW4kwuf6fj2UFHeTCNTyKWtX1KAHEco9VZ7kO4ZKPaWg4tHdoejHbKMI
GxiBhVWKRugnyr2du0r6RpgID+nweUBgtjJuSx3COA1918CTkAInKHgmNBAR8XRm
l6EsrhvKE/5VgTbNTRYaa7HWOucMtX3zEGIQ9H1zcbeaTlXt5OriPPBow1kxVw3K
e+UHbO2qYul5bHHLhFXljjBXYK2iWGmrhcVGHo0bHk6mk6S0htj0+hzs0vqb8qhp
apgkcIc3j0Bhz8ABmwnLAgMBAAGjRTBDMBIGA1UdEwEB/wQIMAYBAf8CAQEwDgYD
VR0PAQH/BAQDAgEGMB0GA1UdDgQWBBQ1IzAiwkOmBJ+wusmCW8xunZLZ5jANBgkq
hkiG9w0BAQsFAAOCAQEABsxu3Jhf829knDaSXASJAl3wfVxDx9B3k9H/TbcKVtyZ
X3lRJ9S+TjiA/Q15TuBcMBh7sLRG9n7tST5y6ijzwlTY7ej8Hx1+ayfclkrvpI7L
HUquTIc+Ai6LwiqKrZcglmpwXC+GwyXnv1iKkLSFKql9AMISig45+4W2JYoB2LwA
srbxKZ3rNip8MTtgabMKG81CQV8X9rJl9zQJeLD77Qh2thgj1LKHdeFPJeRcPMzm
IgLx8d04wvlvXh8B5hHj55dhdwphOuImQ5NMO6HykO9H7Ogxg4BGsDbaLPldZnFL
fj1oXFG1CeTSObaJZSDFv+lMkhgKZ2NnQq7dtBlCwQ==
-----END CERTIFICATE-----`;

declare global {
  interface Window {
    __turboQzConnecting?: Promise<any>;
  }
}

let loaderPromise: Promise<any> | null = null;

const configureQzSecurity = (qz: any) => {
  if (qz.__turboQzSecurityConfigured) return;

  qz.security.setCertificatePromise((resolve: (cert: string) => void) => {
    resolve(QZ_DIGITAL_CERTIFICATE);
  });

  qz.security.setSignatureAlgorithm("SHA512");

  qz.security.setSignaturePromise((toSign: string) => {
    return async (resolve: (signature: string) => void, reject: (error: Error) => void) => {
      try {
        const { data, error } = await supabase.functions.invoke("qz-sign", {
          body: { request: toSign },
        });

        if (error) throw error;

        const signature = data?.signature;

        if (!signature) {
          throw new Error("A Edge Function qz-sign não retornou assinatura.");
        }

        resolve(signature);
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Erro ao assinar requisição do QZ Tray."));
      }
    };
  });

  qz.__turboQzSecurityConfigured = true;
};



const loadQzScript = (): Promise<any> => {
  if (typeof window === "undefined") return Promise.reject(new Error("QZ Tray indisponível no servidor"));
  if ((window as any).qz) return Promise.resolve((window as any).qz);
  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = QZ_CDN_URL;
    script.async = true;
    script.onload = () => {
      const qz = (window as any).qz;
      if (!qz) {
        reject(new Error("Script QZ Tray carregou mas o objeto global não está disponível."));
        return;
      }
      try {
        configureQzSecurity(qz);
      } catch (err) {
        console.warn("[QZ] não foi possível configurar assinatura/certificado", err);
      }
      resolve(qz);
    };
    script.onerror = () => {
      loaderPromise = null;
      reject(new Error("Falha ao carregar QZ Tray do CDN. Verifique sua conexão."));
    };
    document.head.appendChild(script);
  });

  return loaderPromise;
};

const ensureConnected = async (qz: any): Promise<void> => {
  configureQzSecurity(qz);

  if (qz.websocket.isActive()) return;

  if (!window.__turboQzConnecting) {
    window.__turboQzConnecting = qz.websocket
      .connect({ retries: 1, delay: 1 })
      .then(() => qz)
      .finally(() => {
        window.__turboQzConnecting = undefined;
      });
  }

  await window.__turboQzConnecting;
};

/** Verifica se o QZ Tray está instalado e respondendo. */
export const isQzAvailable = async (): Promise<boolean> => {
  try {
    const qz = await loadQzScript();
    await ensureConnected(qz);
    return qz.websocket.isActive();
  } catch {
    return false;
  }
};

const normalizePrinterName = (value: string) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");

/** Lista todas as impressoras visíveis pelo sistema operacional. */
export const listQzPrinters = async (): Promise<string[]> => {
  const qz = await loadQzScript();
  await ensureConnected(qz);

  try {
    const printers = await qz.printers.find();
    const list = Array.isArray(printers) ? printers : [printers].filter(Boolean);
    return Array.from(new Set(list.map((name) => String(name || "").trim()).filter(Boolean)));
  } catch (error) {
    console.warn("[QZ] falha ao listar impressoras:", error);
    return [];
  }
};

/** Retorna o nome da impressora padrão do SO. */
export const getQzDefaultPrinter = async (): Promise<string | null> => {
  const qz = await loadQzScript();
  await ensureConnected(qz);
  try {
    const value = await qz.printers.getDefault();
    return value ? String(value) : null;
  } catch {
    return null;
  }
};

export const resolveQzPrinterName = async (requestedName?: string | null): Promise<string> => {
  const wanted = String(requestedName || "").trim();
  const printers = await listQzPrinters();

  if (wanted) {
    const exact = printers.find((name) => name === wanted);
    if (exact) return exact;

    const wantedNorm = normalizePrinterName(wanted);
    const alias = printers.find((name) => {
      const norm = normalizePrinterName(name);
      return norm === wantedNorm || norm.includes(wantedNorm) || wantedNorm.includes(norm);
    });

    if (alias) return alias;
  }

  const def = await getQzDefaultPrinter();
  if (def) return def;

  if (printers.length > 0) return printers[0];

  throw new Error(
    wanted
      ? `Cannot find printer with name "${wanted}". Clique em Detectar e selecione o nome exato da impressora no Windows.`
      : "Nenhuma impressora foi encontrada pelo QZ Tray. Instale o driver da JP80H no Windows e reinicie o QZ Tray.",
  );
};

/**
 * Envia bytes ESC/POS para a impressora informada.
 * Faz N cópias separadas (cada uma com seu próprio CUT).
 */
export const printRawEscPos = async (
  printerName: string,
  bytes: Uint8Array,
  copies = 1,
): Promise<void> => {
  const qz = await loadQzScript();
  await ensureConnected(qz);

  const resolvedPrinterName = await resolveQzPrinterName(printerName);

  // Não configure `encoding: "RAW"`: o QZ interpreta isso como charset Java
  // e falha com a mensagem curta "RAW". Para ESC/POS bruto, o raw fica no
  // objeto de dados abaixo.
  const config = qz.configs.create(resolvedPrinterName);

  // QZ Tray 2.2: formato hex é o mais confiável p/ RAW ESC/POS.
  // Convertemos cada byte para "XX" hexadecimal (ex: 0x1B → "1B").
  const hexString = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join("");

  const data = [
    {
      type: "raw",
      format: "command",
      flavor: "hex",
      data: hexString,
    },
  ];

  const safeCopies = Math.max(1, Math.min(20, copies));
  for (let i = 0; i < safeCopies; i += 1) {
    await qz.print(config, data);
  }
};

/** Encerra a conexão (opcional — QZ aguenta ficar aberto). */
export const disconnectQz = async (): Promise<void> => {
  try {
    const qz = (window as any).qz;
    if (qz?.websocket?.isActive()) await qz.websocket.disconnect();
  } catch {
    /* noop */
  }
};
