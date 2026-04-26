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

const QZ_CDN_URL = "https://cdn.jsdelivr.net/npm/qz-tray@2.2.5/qz-tray.js";

let loaderPromise: Promise<any> | null = null;

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
      // Modo sem assinatura: aceita o prompt de confiança na primeira conexão.
      try {
        qz.security.setCertificatePromise((resolveCert: any) => resolveCert());
        qz.security.setSignatureAlgorithm("SHA512");
        qz.security.setSignaturePromise(() => (resolveSig: any) => resolveSig());
      } catch (err) {
        console.warn("[QZ] não foi possível configurar security promises", err);
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
  if (qz.websocket.isActive()) return;
  await qz.websocket.connect({ retries: 1, delay: 1 });
};

/** Verifica se o QZ Tray está instalado e respondendo. */
export const isQzAvailable = async (): Promise<boolean> => {
  try {
    const qz = await loadQzScript();
    if (qz.websocket.isActive()) return true;
    await qz.websocket.connect({ retries: 0, delay: 0 });
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
