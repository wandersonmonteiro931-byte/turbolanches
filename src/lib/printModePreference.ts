/**
 * Preferência global do modo de impressão das comandas.
 * Usado no Dashboard e também na tela de modelos de Comandas.
 * - "auto": tenta QZ Tray e cai no PDF/popup se indisponível.
 * - "qz": força QZ Tray (ESC/POS).
 * - "pdf": força PDF/popup do navegador.
 */

export type PrintMode = "auto" | "qz" | "pdf";

const KEY = "turbo_print_mode_pref_v1";

export const getPrintMode = (): PrintMode => {
  if (typeof window === "undefined") return "auto";
  const v = window.localStorage.getItem(KEY);
  return v === "qz" || v === "pdf" || v === "auto" ? v : "auto";
};

export const setPrintMode = (mode: PrintMode) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, mode);
  window.dispatchEvent(new CustomEvent("turbo:print-mode-changed", { detail: mode }));
};

export const PRINT_MODE_LABEL: Record<PrintMode, string> = {
  auto: "Auto",
  qz: "QZ Tray",
  pdf: "PDF",
};
