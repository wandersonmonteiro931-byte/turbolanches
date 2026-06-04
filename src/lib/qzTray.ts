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
MIIECzCCAvOgAwIBAgIGAZ6T5U0IMA0GCSqGSIb3DQEBCwUAMIGiMQswCQYDVQQG
EwJVUzELMAkGA1UECAwCTlkxEjAQBgNVBAcMCUNhbmFzdG90YTEbMBkGA1UECgwS
UVogSW5kdXN0cmllcywgTExDMRswGQYDVQQLDBJRWiBJbmR1c3RyaWVzLCBMTEMx
HDAaBgkqhkiG9w0BCQEWDXN1cHBvcnRAcXouaW8xGjAYBgNVBAMMEVFaIFRyYXkg
RGVtbyBDZXJ0MB4XDTI2MDYwMzE4Mjg1OFoXDTQ2MDYwMzE4Mjg1OFowgaIxCzAJ
BgNVBAYTAlVTMQswCQYDVQQIDAJOWTESMBAGA1UEBwwJQ2FuYXN0b3RhMRswGQYD
VQQKDBJRWiBJbmR1c3RyaWVzLCBMTEMxGzAZBgNVBAsMElFaIEluZHVzdHJpZXMs
IExMQzEcMBoGCSqGSIb3DQEJARYNc3VwcG9ydEBxei5pbzEaMBgGA1UEAwwRUVog
VHJheSBEZW1vIENlcnQwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQCw
GNKR/1Z39qvhYdi35L8ilk4xcbZj0gvGTCnri30U9Of3FnElfPYUZMtCx9my5dhT
nnpzERCjdA2Ka05iERqYZlJDmN0536O12Ho/gdCT2ktjshj05IFbNsFv69ja1yHB
Nq6hjrBFi2hrBbbUSog+Q4wUF0mcIxMGPuHbKFob9GN+nzrFpr77qyBsr/yZhw+K
YvCZR6gyt8FfsxkqXzgIyRhZX3ek17JzMLfLddwGLnpuOaX/PVNF9EA7YzNViu2a
n4wePHolp4fWXO46RiAZUFq0+g1m2U08aeC31Dzq0/zadkTeCUXHGv1Ui4B29FI2
TbJdqWGyNc+BGpEM5jw3AgMBAAGjRTBDMBIGA1UdEwEB/wQIMAYBAf8CAQEwDgYD
VR0PAQH/BAQDAgEGMB0GA1UdDgQWBBQcATB/NUBvnIlRPPC6/ibuXVPn1TANBgkq
hkiG9w0BAQsFAAOCAQEAeubIKU9A9RDUn7IpbhVndsr8M5KK1nYHoryGZrpzsVDk
0vdYSg62Ip+wxiXSC0b8kTP6Arn+72eQeEGlNgfGhroQPfDkd7r0Tn5QDBR5WSGH
VlURx4Drwnfdq//cpItRpTd2K0k690HGXgveOyCp5rbmIK+LgcH4w/pt+PX/9m0Y
SDUBCJsMr0TCtGHP4fBg4zg8SuA3ot6IR7T0++sRPonR74NK/WQiBtj3dRP+59Q0
oB3s7OWPdw72Fup+c7HbSJeNzf2aW+cAcQJnQhxmWtwGiu60Oqfo7L3obRdd9++B
UGQROe5pyyk4mq8+AKUtzLL5V6LH9mC3k4gHWxpvAw==
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

/** Lista todas as impressoras visíveis pelo sistema operacional. */
export const listQzPrinters = async (): Promise<string[]> => {
  const qz = await loadQzScript();
  await ensureConnected(qz);
  const printers = await qz.printers.find();
  return Array.isArray(printers) ? printers : [printers].filter(Boolean);
};

/** Retorna o nome da impressora padrão do SO. */
export const getQzDefaultPrinter = async (): Promise<string | null> => {
  const qz = await loadQzScript();
  await ensureConnected(qz);
  try {
    return (await qz.printers.getDefault()) || null;
  } catch {
    return null;
  }
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
  if (!printerName) throw new Error("Nome da impressora não configurado.");
  const qz = await loadQzScript();
  await ensureConnected(qz);

  // Não configure `encoding: "RAW"`: o QZ interpreta isso como charset Java
  // e falha com a mensagem curta "RAW". Para ESC/POS bruto, o raw fica no
  // objeto de dados abaixo.
  const config = qz.configs.create(printerName);

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
