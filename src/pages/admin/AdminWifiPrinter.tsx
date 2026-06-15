import { useEffect, useState } from "react";
import { Printer, Wifi, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import {
  DEFAULT_WIFI_PRINTER_SETTINGS,
  getThermalPrintSettings,
  saveThermalPrintSettings,
  type WifiPrinterSettings,
} from "@/lib/thermalPrintSettings";
import { printWifiTestReceipt, WIFI_BRIDGE_HINT } from "@/lib/wifiPrinter";
import { getPrintMode, setPrintMode, type PrintMode } from "@/lib/printModePreference";
import { toast } from "sonner";

const AdminWifiPrinter = () => {
  const [wifi, setWifi] = useState<WifiPrinterSettings>(() => getThermalPrintSettings().wifi);
  const [mode, setMode] = useState<PrintMode>(() => getPrintMode());
  const [testing, setTesting] = useState(false);
  const [lastResult, setLastResult] = useState<"ok" | "err" | null>(null);

  useEffect(() => {
    setWifi(getThermalPrintSettings().wifi);
  }, []);

  const update = <K extends keyof WifiPrinterSettings>(key: K, value: WifiPrinterSettings[K]) => {
    setWifi((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    const current = getThermalPrintSettings();
    const next = saveThermalPrintSettings({ ...current, wifi });
    setWifi(next.wifi);
    toast.success("Configurações Wi-Fi salvas");
  };

  const handleReset = () => {
    setWifi(DEFAULT_WIFI_PRINTER_SETTINGS);
    toast.message("Padrão carregado. Clique em Salvar para aplicar.");
  };

  const handleModeChange = (next: PrintMode) => {
    setPrintMode(next);
    setMode(next);
  };

  const handleTest = async () => {
    handleSave();
    setTesting(true);
    setLastResult(null);
    try {
      await printWifiTestReceipt();
      setLastResult("ok");
      toast.success("Teste enviado para a impressora Wi-Fi");
    } catch (err) {
      setLastResult("err");
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg || WIFI_BRIDGE_HINT);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Wifi size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold">Impressora Wi-Fi / Rede</h1>
          <p className="text-sm text-muted-foreground">
            Configuração da impressora térmica POS-80 conectada por Ethernet/Wi-Fi.
          </p>
        </div>
      </header>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-muted-foreground">
          <Printer size={14} /> MODO DE IMPRESSÃO GLOBAL
        </h2>
        <div className="flex flex-wrap gap-2">
          {(["auto", "qz", "wifi", "pdf"] as PrintMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => handleModeChange(m)}
              className={
                "rounded-md border px-3 py-1.5 text-xs font-bold uppercase transition-colors " +
                (mode === m
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted")
              }
            >
              {m === "auto" ? "Auto" : m === "qz" ? "QZ Tray" : m === "wifi" ? "Wi-Fi" : "PDF"}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Selecionando Wi-Fi, todas as impressões do sistema serão enviadas para a impressora abaixo.
        </p>
      </section>

      <section className="grid gap-4 rounded-xl border border-border bg-card p-4 md:grid-cols-2">
        <Field label="Modelo">
          <input
            value={wifi.model}
            onChange={(e) => update("model", e.target.value)}
            className="input-text"
          />
        </Field>
        <Field label="Comando">
          <input
            value={wifi.command}
            onChange={(e) => update("command", e.target.value)}
            className="input-text"
          />
        </Field>
        <Field label="IP da impressora">
          <input
            value={wifi.ip}
            onChange={(e) => update("ip", e.target.value)}
            className="input-text"
            placeholder="192.168.1.87"
          />
        </Field>
        <Field label="Porta">
          <input
            type="number"
            value={wifi.port}
            onChange={(e) => update("port", Number(e.target.value) || 9100)}
            className="input-text"
            placeholder="9100"
          />
        </Field>
        <Field label="Largura do papel">
          <select
            value={wifi.paperWidth}
            onChange={(e) => update("paperWidth", e.target.value)}
            className="input-text"
          >
            <option value="58mm">58mm</option>
            <option value="80mm">80mm</option>
          </select>
        </Field>
        <Field label="Caracteres por linha (fontA)">
          <input
            type="number"
            value={wifi.charsPerLine}
            onChange={(e) => update("charsPerLine", Number(e.target.value) || 48)}
            className="input-text"
          />
        </Field>
        <Field label="Bridge HTTP local (opcional)">
          <input
            value={wifi.bridgeUrl}
            onChange={(e) => update("bridgeUrl", e.target.value)}
            className="input-text"
            placeholder="http://127.0.0.1:9999/print"
          />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input
            type="checkbox"
            checked={wifi.autoCut}
            onChange={(e) => update("autoCut", e.target.checked)}
          />
          Corte automático ao final
        </label>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">
          {WIFI_BRIDGE_HINT}
        </p>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90"
        >
          Salvar
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="rounded-md border border-border bg-background px-4 py-2 text-sm font-bold text-muted-foreground hover:bg-muted"
        >
          Restaurar padrão
        </button>
        <button
          type="button"
          onClick={handleTest}
          disabled={testing}
          className="ml-auto inline-flex items-center gap-2 rounded-md border border-primary bg-primary/10 px-4 py-2 text-sm font-bold text-primary hover:bg-primary/20 disabled:opacity-60"
        >
          {testing ? <Loader2 className="animate-spin" size={16} /> : <Wifi size={16} />}
          Testar Wi-Fi
        </button>
        {lastResult === "ok" && <CheckCircle2 className="text-green-600" size={20} />}
        {lastResult === "err" && <XCircle className="text-red-600" size={20} />}
      </div>

      <style>{`
        .input-text {
          width: 100%;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--background));
          color: hsl(var(--foreground));
          border-radius: 8px;
          padding: 8px 10px;
          font-size: 14px;
        }
      `}</style>
    </div>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="flex flex-col gap-1 text-sm">
    <span className="text-xs font-bold uppercase text-muted-foreground">{label}</span>
    {children}
  </label>
);

export default AdminWifiPrinter;
