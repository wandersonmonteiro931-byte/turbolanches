/**
 * Preferência global do modo de impressão.
 * - "auto": tenta QZ Tray e cai no PDF/popup se indisponível.
 * - "qz":   força QZ Tray (ESC/POS local).
 * - "wifi": força impressão por Wi-Fi/Rede (bridge local -> impressora IP:porta).
 * - "pdf":  força PDF/popup do navegador.
 */

export type PrintMode = "auto" | "qz" | "wifi" | "pdf";

const KEY = "turbo_print_mode_pref_v1";

const isValid = (v: unknown): v is PrintMode =>
  v === "auto" || v === "qz" || v === "wifi" || v === "pdf";

export const getPrintMode = (): PrintMode => {
  if (typeof window === "undefined") return "auto";
  const v = window.localStorage.getItem(KEY);
  return isValid(v) ? v : "auto";
};

export const setPrintMode = (mode: PrintMode) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, mode);
  window.dispatchEvent(new CustomEvent("turbo:print-mode-changed", { detail: mode }));
};

export const PRINT_MODE_LABEL: Record<PrintMode, string> = {
  auto: "Auto",
  qz: "QZ Tray",
  wifi: "Wi-Fi",
  pdf: "PDF",
};
