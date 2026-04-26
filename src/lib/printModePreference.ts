/**
 * Preferência de modo de impressão para comandas do Dashboard.
 * - "auto": usa QZ Tray (sistema atual) e cai no popup HTML se indisponível.
 * - "qz": força QZ Tray (ESC/POS) — sistema atual.
 * - "pdf": força o popup HTML (modo antigo).
 *
 * Aplica-se SOMENTE às comandas do Dashboard:
 *   - "pedido"      (comanda)
 *   - "entregador"  (fechamento de rota)
 *   - "obrigado"    (comanda do cliente)
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
  auto: "Automático",
  qz: "Sistema atual (QZ Tray)",
  pdf: "Antigo (PDF / Popup)",
};
