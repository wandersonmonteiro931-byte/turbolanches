/**
 * Impressão Wi-Fi / Rede para impressora térmica POS-80 (JP80H-UE).
 *
 * Navegadores comuns não conseguem abrir TCP raw na porta 9100 por segurança.
 * Esta camada tenta, nesta ordem:
 *   1) window.TurboWifiPrinter.printEscPos(bytes, settings)  -> bridge nativa (Android/WebView/Electron)
 *   2) HTTP POST configurado em wifi.bridgeUrl                -> bridge HTTP local
 *   3) Lança erro amigável (não trava a tela).
 *
 * Não substitui QZ Tray nem PDF — é um terceiro caminho.
 */

import { EscPosBuilder } from "./escposBuilder";
import { getThermalPrintSettings, type WifiPrinterSettings } from "./thermalPrintSettings";

declare global {
  interface Window {
    TurboWifiPrinter?: {
      printEscPos?: (
        payloadHex: string,
        settings: { ip: string; port: number; autoCut: boolean; model: string },
      ) => Promise<unknown> | unknown;
    };
  }
}

const BRIDGE_HINT =
  "Para imprimir por Wi-Fi no celular Android, instale e configure o app RawBT apontando para 192.168.1.87:9100 (JP80H-UE). No PC, use o bridge HTTP local. Sem isso o navegador não consegue acessar a impressora.";

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join("");

const toBase64 = (bytes: Uint8Array): string => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  if (typeof btoa !== "undefined") return btoa(bin);
  return "";
};

const isAndroid = (): boolean => {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent || "");
};

/** Dispara intent RawBT no Android. O app RawBT registra o esquema `rawbt:` e
 * recebe os bytes ESC/POS codificados em base64, mandando direto para a
 * JP80H-UE em 192.168.1.87:9100 (sem abrir o spooler do Android). */
const sendViaRawBt = (bytes: Uint8Array): boolean => {
  if (!isAndroid() || typeof window === "undefined" || typeof document === "undefined") return false;
  try {
    const b64 = toBase64(bytes);
    if (!b64) return false;
    const a = document.createElement("a");
    a.href = `rawbt:${b64}`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 1500);
    return true;
  } catch (err) {
    console.warn("[WiFi] RawBT intent falhou:", err);
    return false;
  }
};

/** Tenta enviar bytes ESC/POS via bridge nativa, RawBT (Android) ou HTTP local. */
export const printWifiEscPos = async (
  bytes: Uint8Array,
  settings?: WifiPrinterSettings,
): Promise<void> => {
  const cfg = settings || getThermalPrintSettings().wifi;
  const hex = toHex(bytes);

  // 1) Bridge nativa injetada por app/WebView (TurboWifiPrinter)
  const native = typeof window !== "undefined" ? window.TurboWifiPrinter : undefined;
  if (native && typeof native.printEscPos === "function") {
    try {
      await native.printEscPos(hex, {
        ip: cfg.ip,
        port: cfg.port,
        autoCut: cfg.autoCut,
        model: cfg.model,
      });
      return;
    } catch (err) {
      console.warn("[WiFi] bridge nativa falhou, tentando RawBT/HTTP:", err);
    }
  }

  // 2) RawBT (Android) — envia direto para o app que fala TCP 9100 com a JP80H-UE
  if (sendViaRawBt(bytes)) return;

  // 3) Bridge HTTP local configurada (PC/kiosk)
  if (cfg.bridgeUrl) {
    try {
      const res = await fetch(cfg.bridgeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ip: cfg.ip,
          port: cfg.port,
          autoCut: cfg.autoCut,
          model: cfg.model,
          encoding: "hex",
          data: hex,
          dataBase64: toBase64(bytes),
        }),
      });
      if (!res.ok) {
        throw new Error(`Bridge HTTP retornou ${res.status}`);
      }
      return;
    } catch (err) {
      console.warn("[WiFi] bridge HTTP falhou:", err);
      throw new Error(`Falha ao enviar para a bridge HTTP local (${cfg.bridgeUrl}). ${BRIDGE_HINT}`);
    }
  }

  // 4) Sem caminho disponível
  throw new Error(BRIDGE_HINT);
};

/** Imprime um conteúdo texto simples (com tags básicas) por Wi-Fi.
 *  Tags suportadas: [B]..[/B] negrito, [C]..[/C] centro, [BIG]..[/BIG] tamanho duplo,
 *  --- = linha separadora. */
export const printWifiReceipt = async (
  content: string,
  settings?: WifiPrinterSettings,
): Promise<void> => {
  const cfg = settings || getThermalPrintSettings().wifi;
  const cols = cfg.charsPerLine || 48;
  const b = new EscPosBuilder({ columns: cols, codepage: 16, feedLines: 3 });

  const lines = String(content || "").replace(/\r\n/g, "\n").split("\n");
  for (const raw of lines) {
    const line = raw ?? "";
    if (line.trim() === "---") {
      b.separator("-");
      continue;
    }

    const centered = /^\s*\[C\](.*)\[\/C\]\s*$/i.exec(line);
    const isBig = /^\s*\[BIG\](.*)\[\/BIG\]\s*$/i.exec(line);
    const isBold = /^\s*\[B\](.*)\[\/B\]\s*$/i.exec(line);

    if (centered) {
      b.align("center").line(centered[1]).align("left");
    } else if (isBig) {
      b.align("center").bold(true).size(1, 1).line(isBig[1]).size(0, 0).bold(false).align("left");
    } else if (isBold) {
      b.bold(true).line(isBold[1]).bold(false);
    } else {
      b.line(line);
    }
  }

  b.feed();
  if (cfg.autoCut) b.cut();

  await printWifiEscPos(b.build(), cfg);
};

/** Impressão de teste exigida pelo botão "Testar Wi-Fi". */
export const printWifiTestReceipt = async (): Promise<void> => {
  const cfg = getThermalPrintSettings().wifi;
  const now = new Date().toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

  const content = [
    "[BIG]TURBO LANCHES[/BIG]",
    "[C]TESTE DE IMPRESSAO WI-FI[/C]",
    "---",
    `Impressora: ${cfg.model}`,
    `IP: ${cfg.ip}`,
    `Porta: ${cfg.port}`,
    `Papel: ${cfg.paperWidth}`,
    "Status: Configuracao enviada",
    `Data/Hora: ${now}`,
    "---",
  ].join("\n");

  await printWifiReceipt(content, cfg);
};

export const WIFI_BRIDGE_HINT = BRIDGE_HINT;
