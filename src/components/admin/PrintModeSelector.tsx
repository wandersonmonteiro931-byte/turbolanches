import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { getPrintMode, setPrintMode, type PrintMode } from "@/lib/printModePreference";

/**
 * Seletor do modo de impressão das comandas (Pedido, Fechamento de Rota, Obrigado).
 * - QZ Tray: envia direto para a impressora térmica via QZ Tray (ESC/POS).
 * - PDF: abre o popup HTML/PDF para impressão pelo navegador.
 * - Auto: tenta QZ Tray e, se falhar, usa PDF.
 */
export const PrintModeSelector = () => {
  const [mode, setLocal] = useState<PrintMode>(() => getPrintMode());

  useEffect(() => {
    const handler = (e: Event) => {
      const next = (e as CustomEvent<PrintMode>).detail;
      if (next) setLocal(next);
    };
    window.addEventListener("turbo:print-mode-changed", handler as EventListener);
    return () => window.removeEventListener("turbo:print-mode-changed", handler as EventListener);
  }, []);

  const change = (next: PrintMode) => {
    setPrintMode(next);
    setLocal(next);
  };

  const opts: { value: PrintMode; label: string; hint: string }[] = [
    { value: "auto", label: "Auto", hint: "Tenta QZ Tray; se falhar, usa PDF" },
    { value: "qz", label: "QZ Tray", hint: "Imprime direto na térmica via QZ Tray" },
    { value: "wifi", label: "Wi-Fi", hint: "Envia ESC/POS para a impressora Wi-Fi via bridge local" },
    { value: "pdf", label: "PDF", hint: "Abre PDF/popup do navegador" },
  ];

  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2"
      title="Modo de impressão do sistema"
    >
      <Printer size={16} className="text-muted-foreground" />
      <span className="text-xs font-semibold text-muted-foreground">Impressão:</span>
      <div className="flex overflow-hidden rounded-md border border-border">
        {opts.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => change(o.value)}
            title={o.hint}
            className={
              "px-2.5 py-1 text-[11px] font-bold transition-colors " +
              (mode === o.value ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted")
            }
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default PrintModeSelector;
