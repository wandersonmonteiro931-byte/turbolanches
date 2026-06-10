import TurboLoader from "@/components/TurboLoader";
import { useState, useEffect, useMemo } from "react";
import { useReceiptTemplates, useUpdateReceiptTemplate, ReceiptTemplate } from "@/hooks/useReceiptTemplates";
import { getDefaultTemplate } from "@/lib/receiptDefaults";
import ReceiptVariableReference from "@/components/admin/ReceiptVariableReference";
import { PrintModeSelector } from "@/components/admin/PrintModeSelector";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import ImageUpload from "@/components/admin/ImageUpload";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Save,
  ClipboardList,
  Heart,
  RotateCcw,
  Sticker,
  ShoppingBasket,
  Truck,
  Printer,
  Armchair,
  DollarSign,
  Zap,
  RefreshCw,
  FileText,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { openPrintUrl } from "@/lib/printPopup";
import { getPrintMode, type PrintMode } from "@/lib/printModePreference";
import { tryPrintOrderViaQz } from "@/lib/printRouter";
import { isQzAvailable, listQzPrinters, getQzDefaultPrinter, printRawEscPos } from "@/lib/qzTray";
import { EscPosBuilder } from "@/lib/escposBuilder";
import { toast } from "sonner";
import {
  DEFAULT_THERMAL_PRINT_SETTINGS,
  ThermalPrintSettings,
  getThermalPrintSettings,
  saveThermalPrintSettings,
} from "@/lib/thermalPrintSettings";

const tabConfig = [
  { type: "pedido", label: "Comanda Pedido", icon: ClipboardList },
  { type: "mesa", label: "Comanda Mesa", icon: Armchair },
  { type: "mesa_conta", label: "Conta Mesa", icon: Printer },
  { type: "mesa_cobrar", label: "Cobrar Mesa", icon: Printer },
  { type: "obrigado", label: "Comanda Obrigado", icon: Heart },
  { type: "panfleto", label: "Panfleto", icon: FileText },
  { type: "entregador", label: "Fechamento de Rota", icon: Truck },
  { type: "relatorio_entregas", label: "Relatório Entregador", icon: Truck },
  { type: "relatorio_periodo", label: "Relatório Período", icon: ClipboardList },
  { type: "etiquetas", label: "Etiquetas", icon: Sticker },
  { type: "etiqueta_preco", label: "Etiqueta de Preço", icon: DollarSign },
  { type: "reposicao", label: "Reposição", icon: ShoppingBasket },
];

const DEFAULT_LABELS: Record<string, string> = {
  pedido: "PEDIDO",
  mesa: "MESA",
  mesa_conta: "CONTA MESA",
  mesa_cobrar: "COBRAR MESA",
  obrigado: "OBRIGADO!",
  panfleto: "PANFLETO",
  entregador: "FECHAMENTO DE ROTA",
  relatorio_entregas: "RELATÓRIO DE ENTREGAS",
  relatorio_periodo: "RELATÓRIO DE PERÍODO",
  etiquetas: "ETIQUETA",
  etiqueta_preco: "PREÇO",
  reposicao: "LISTA DE COMPRAS",
};

const buildTemplateDraft = (type: string, source?: Partial<ReceiptTemplate>) => ({
  id: source?.id,
  template_type: type,
  store_id: source?.store_id ?? null,
  store_name: source?.store_name ?? "TURBO LANCHES",
  label: source?.label ?? DEFAULT_LABELS[type] ?? type.toUpperCase(),
  custom_message: source?.custom_message ?? "",
  footer_message: source?.footer_message ?? "",
  body_template: source?.body_template ?? getDefaultTemplate(type),
  show_customer_code: source?.show_customer_code ?? false,
  show_max_delivery_time: source?.show_max_delivery_time ?? false,
  show_driver_field: source?.show_driver_field ?? false,
  show_troco: source?.show_troco ?? false,
  show_obs: source?.show_obs ?? false,
  show_payment_info: source?.show_payment_info ?? false,
  show_totals_detail: source?.show_totals_detail ?? false,
  items_font_size: source?.items_font_size ?? (type === "etiquetas" ? 10 : 14),
  label_font_size: source?.label_font_size ?? (type === "etiquetas" ? 14 : 24),
  body_font_size: source?.body_font_size ?? 11,
  logo_image_url: (source as any)?.logo_image_url ?? "",
  logo_image_size: (source as any)?.logo_image_size ?? "medium",
  panfleto_image_url: (source as any)?.panfleto_image_url ?? "",
  panfleto_image_size: (source as any)?.panfleto_image_size ?? "large",
});

const IMAGE_SIZE_OPTIONS = [
  { value: "small", label: "Pequeno" },
  { value: "medium", label: "Médio" },
  { value: "large", label: "Grande" },
  { value: "xlarge", label: "Muito grande" },
] as const;

const AdminReceipts = () => {
  const { data: templates, isLoading } = useReceiptTemplates();
  const updateMutation = useUpdateReceiptTemplate();
  const [searchParams, setSearchParams] = useSearchParams();
  const availableTypes = useMemo(() => tabConfig.map((tab) => tab.type), []);
  const requestedTab = searchParams.get("tipo") || "pedido";
  const activeTab = availableTypes.includes(requestedTab) ? requestedTab : "pedido";
  const [editData, setEditData] = useState<Record<string, Partial<ReceiptTemplate>>>({});
  const [printQty, setPrintQty] = useState<Record<string, number>>({});
  const [printing, setPrinting] = useState(false);
  const [thermalSettings, setThermalSettings] = useState<ThermalPrintSettings>(() => getThermalPrintSettings());
  const [qzPrinters, setQzPrinters] = useState<string[]>([]);
  const [qzStatus, setQzStatus] = useState<"unknown" | "online" | "offline">("unknown");
  const [qzBusy, setQzBusy] = useState(false);

  const updateThermalSetting = (field: keyof ThermalPrintSettings, value: number | string | boolean) => {
    const next = saveThermalPrintSettings({ ...thermalSettings, [field]: value as never });
    setThermalSettings(next);
  };

  const resetThermalSettings = () => {
    const next = saveThermalPrintSettings(DEFAULT_THERMAL_PRINT_SETTINGS);
    setThermalSettings(next);
    toast.success("Padrão deste computador restaurado.");
  };

  const detectQz = async () => {
    setQzBusy(true);
    try {
      const ok = await isQzAvailable();
      setQzStatus(ok ? "online" : "offline");
      if (ok) {
        const [printers, def] = await Promise.all([listQzPrinters(), getQzDefaultPrinter()]);
        setQzPrinters(printers);
        if (!thermalSettings.qzPrinterName && def) {
          updateThermalSetting("qzPrinterName", def);
        }
        toast.success(`QZ Tray online — ${printers.length} impressora(s) detectada(s).`);
      } else {
        toast.error("QZ Tray não está rodando neste computador. Instale e abra o QZ Tray.");
      }
    } catch (err) {
      console.error(err);
      setQzStatus("offline");
      toast.error("Falha ao conectar com QZ Tray.");
    } finally {
      setQzBusy(false);
    }
  };

  const handleQzTest = async () => {
    if (!thermalSettings.qzPrinterName) {
      toast.error("Selecione uma impressora primeiro.");
      return;
    }
    setQzBusy(true);
    try {
      const b = new EscPosBuilder({
        columns: thermalSettings.qzColumns,
        codepage: thermalSettings.qzCodepage,
        feedLines: thermalSettings.qzFeedLines,
      });
      b.align("center").bold(true).size(1, 1).line("TURBO LANCHES").size(0, 0).bold(false);
      b.separator("=");
      b.align("center").line("TESTE DE IMPRESSÃO").line("QZ Tray + ESC/POS");
      b.separator("-");
      b.align("left").line("Acentuação: ção, área, façanha");
      b.line(new Date().toLocaleString("pt-BR"));
      b.feed().cut();
      await printRawEscPos(thermalSettings.qzPrinterName, b.build(), 1);
      toast.success("Teste enviado! O corte deve sair exatamente após o texto.");
    } catch (err: any) {
      console.error(err);
      toast.error(`Falha no teste: ${err?.message || "verifique o QZ Tray"}`);
    } finally {
      setQzBusy(false);
    }
  };

  const handlePrintTest = async (e: React.MouseEvent, type: string) => {
    e.preventDefault();
    e.stopPropagation();

    const qty = Math.max(1, Math.min(20, Number(printQty[type] || 1)));
    const mode: PrintMode = getPrintMode();

    // Regra Turbo:
    // Todo teste, de qualquer tipo de comanda, usa SEMPRE o último pedido real do sistema como base.
    // Isso garante que variáveis, colunas, itens, valores, endereço e formatação sejam testados
    // exatamente no mesmo fluxo de uma impressão normal.
    setPrinting(true);

    try {
      const { data: lastOrder, error } = await supabase
        .from("orders")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !lastOrder) {
        toast.error("Nenhum pedido encontrado para teste de impressão.");
        return;
      }

      if (mode !== "pdf") {
        const sentViaQz = await tryPrintOrderViaQz(lastOrder.id, { tipo: type, copies: qty });

        if (sentViaQz) {
          toast.success("Teste enviado via QZ Tray usando o último pedido como base.");
          return;
        }

        if (mode === "qz") {
          toast.error("QZ Tray indisponível. Abra o QZ Tray e confira a impressora configurada.");
          return;
        }
      }

      const win = openPrintUrl(
        `/admin/imprimir/${lastOrder.id}?tipo=${type}&copies=${qty}&delay_ms=100&teste=1`,
        `teste_${type}`,
        "width=300,height=600",
      );

      if (!win || win.closed) {
        toast.error("Popup bloqueado. Permita popups neste site para imprimir o teste em PDF.");
        return;
      }

      toast.success("Teste enviado pela tela de comandas/PDF usando o último pedido como base.");
    } catch (err: any) {
      console.error(err);
      toast.error(`Falha no teste: ${err?.message || "verifique a impressão"}`);
    } finally {
      setPrinting(false);
    }
  };

  useEffect(() => {
    const map: Record<string, Partial<ReceiptTemplate>> = {};
    tabConfig.forEach((tab) => {
      const existing = templates?.find((template) => template.template_type === tab.type);
      map[tab.type] = buildTemplateDraft(tab.type, existing);
    });
    setEditData(map);
  }, [templates]);

  const getField = (type: string) => editData[type] || buildTemplateDraft(type);

  const updateField = (type: string, field: string, value: any) => {
    setEditData((prev) => ({
      ...prev,
      [type]: { ...prev[type], [field]: value },
    }));
  };

  const handleSave = (type: string) => {
    const data = editData[type];
    if (!data) return;
    updateMutation.mutate(data as Partial<ReceiptTemplate> & { template_type: string; id?: string });
  };

  const handleResetTemplate = (type: string) => {
    updateField(type, "body_template", getDefaultTemplate(type));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <TurboLoader size={120} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-foreground">Comandas de Impressão</h2>
        <p className="text-sm text-muted-foreground">
          Edite o modelo completo de cada comanda usando variáveis e formatação
        </p>
      </div>

      <ReceiptVariableReference />

      {/* ============ PAINEL QZ TRAY (ESC/POS) ============ */}
      <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Zap size={18} className="text-primary" />
            <div>
              <h3 className="text-sm font-bold text-foreground">Impressão direta via QZ Tray (ESC/POS)</h3>
              <p className="text-xs text-muted-foreground">
                Envia comandos diretos à impressora térmica — corte exato, sem sobra de papel.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-bold ${
                qzStatus === "online"
                  ? "text-emerald-600"
                  : qzStatus === "offline"
                    ? "text-destructive"
                    : "text-muted-foreground"
              }`}
            >
              {qzStatus === "online" ? "● Online" : qzStatus === "offline" ? "● Offline" : "○ Não verificado"}
            </span>
            <button
              type="button"
              onClick={detectQz}
              disabled={qzBusy}
              className="flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold transition-all active:scale-[0.98] disabled:opacity-50"
            >
              <RefreshCw size={12} className={qzBusy ? "animate-spin" : ""} />
              Detectar
            </button>
          </div>
        </div>

        <div className="mb-3 flex items-center gap-3 rounded-md bg-card/60 p-2.5">
          <Switch checked={thermalSettings.qzEnabled} onCheckedChange={(v) => updateThermalSetting("qzEnabled", v)} />
          <div className="flex-1">
            <p className="text-xs font-semibold">Usar QZ Tray para imprimir comandas de pedido</p>
            <p className="text-[11px] text-muted-foreground">
              Quando ativo, o sistema envia bytes ESC/POS direto pra impressora. Se falhar, cai automaticamente no modo
              HTML.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs font-semibold">Impressora</Label>
            {qzPrinters.length > 0 ? (
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={thermalSettings.qzPrinterName}
                onChange={(e) => updateThermalSetting("qzPrinterName", e.target.value)}
              >
                <option value="">— Selecione —</option>
                {qzPrinters.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                value={thermalSettings.qzPrinterName}
                onChange={(e) => updateThermalSetting("qzPrinterName", e.target.value)}
                placeholder='Ex: "EPSON TM-T20", "POS-58"'
              />
            )}
            <p className="text-[11px] text-muted-foreground">
              Clique em "Detectar" pra carregar a lista de impressoras do sistema.
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Colunas (largura)</Label>
            <Input
              type="number"
              min={24}
              max={64}
              value={thermalSettings.qzColumns}
              onChange={(e) => updateThermalSetting("qzColumns", Number(e.target.value))}
            />
            <p className="text-[11px] text-muted-foreground">48 = 80mm/72mm · 32 = 58mm</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Linhas antes do corte</Label>
            <Input
              type="number"
              min={0}
              max={10}
              value={thermalSettings.qzFeedLines}
              onChange={(e) => updateThermalSetting("qzFeedLines", Number(e.target.value))}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleQzTest}
            disabled={qzBusy || !thermalSettings.qzPrinterName}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-all active:scale-[0.98] disabled:opacity-50"
          >
            <Printer size={14} />
            Imprimir teste ESC/POS
          </button>
          <a
            href="https://qz.io/download/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
          >
            Baixar QZ Tray (grátis)
          </a>
        </div>

        <div className="mt-3 rounded-md bg-amber-500/10 p-2.5 text-[11px] text-amber-900 dark:text-amber-200">
          <strong>Como configurar:</strong> 1) Baixe e instale o QZ Tray no PC do caixa. 2) Abra o app (fica na
          bandeja). 3) Clique em "Detectar" acima. 4) Selecione sua impressora. 5) Ative o switch e teste. Na primeira
          impressão o QZ pedirá permissão — marque "sempre permitir".
        </div>
      </div>
      {/* ============ /PAINEL QZ TRAY ============ */}

      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-foreground">Padrão de impressão deste computador</h3>
            <p className="text-xs text-muted-foreground">Salvo somente neste navegador/PC usado no kiosk.</p>
          </div>
          <button
            type="button"
            onClick={resetThermalSettings}
            className="flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw size={12} />
            Restaurar
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Largura do papel (mm)</Label>
            <Input
              type="number"
              min={40}
              max={110}
              value={thermalSettings.paperWidthMm}
              onChange={(e) => updateThermalSetting("paperWidthMm", Number(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Altura fixa da página (mm)</Label>
            <Input
              type="number"
              min={0}
              max={500}
              value={thermalSettings.fixedHeightMm}
              onChange={(e) => updateThermalSetting("fixedHeightMm", Number(e.target.value))}
            />
            <p className="text-[11px] text-muted-foreground">
              0 = automática. Se houver sobra, ajuste o tamanho do papel/driver no computador.
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Folga após o texto (mm)</Label>
            <Input
              type="number"
              min={0}
              max={80}
              value={thermalSettings.cutOffsetMm}
              onChange={(e) => updateThermalSetting("cutOffsetMm", Number(e.target.value))}
            />
            <p className="text-[11px] text-muted-foreground">
              0 = sem folga extra. Não corta texto; só adiciona espaço quando necessário.
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Largura da janela (px)</Label>
            <Input
              type="number"
              min={180}
              max={800}
              value={thermalSettings.popupWidthPx}
              onChange={(e) => updateThermalSetting("popupWidthPx", Number(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Altura da janela (px)</Label>
            <Input
              type="number"
              min={80}
              max={1200}
              value={thermalSettings.popupHeightPx}
              onChange={(e) => updateThermalSetting("popupHeightPx", Number(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Intervalo entre cópias (ms)</Label>
            <Input
              type="number"
              min={350}
              max={5000}
              value={thermalSettings.printGapMs}
              onChange={(e) => updateThermalSetting("printGapMs", Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      {activeTab === "pedido" && (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="mb-3">
            <h3 className="text-sm font-bold text-foreground">Destacar informações</h3>
            <p className="text-xs text-muted-foreground">
              Destaques automáticos aplicados somente na comanda de Pedido impressa pelo QZ Tray.
            </p>
          </div>

          <div className="mb-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            Os destaques podem variar conforme a impressora térmica. Faça impressões de teste.
          </div>

          <div className="divide-y rounded-md border border-border">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Número do pedido</p>
                <p className="text-xs text-muted-foreground">Destaca automaticamente o campo [NUMEROPEDIDO].</p>
              </div>
              <Switch
                checked={thermalSettings.pedidoHighlightOrderNumber}
                onCheckedChange={(v) => updateThermalSetting("pedidoHighlightOrderNumber", v)}
              />
            </div>

            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Entregas com prioridade</p>
                <p className="text-xs text-muted-foreground">
                  Destaca o tipo DELIVERY quando o pedido tiver informação de prioridade.
                </p>
              </div>
              <Switch
                checked={thermalSettings.pedidoHighlightPriorityDeliveries}
                onCheckedChange={(v) => updateThermalSetting("pedidoHighlightPriorityDeliveries", v)}
              />
            </div>

            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Prioridade do pedido</p>
                <p className="text-xs text-muted-foreground">
                  Destaca a observação quando encontrar prioridade, urgente ou atraso.
                </p>
              </div>
              <Switch
                checked={thermalSettings.pedidoHighlightOrderPriority}
                onCheckedChange={(v) => updateThermalSetting("pedidoHighlightOrderPriority", v)}
              />
            </div>

            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Previsão de entrega</p>
                <p className="text-xs text-muted-foreground">Destaca automaticamente o campo [DATAHORAENTREGA].</p>
              </div>
              <Switch
                checked={thermalSettings.pedidoHighlightDeliveryEstimate}
                onCheckedChange={(v) => updateThermalSetting("pedidoHighlightDeliveryEstimate", v)}
              />
            </div>

            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Quantidade de itens</p>
                <p className="text-xs text-muted-foreground">
                  Destaca automaticamente a quantidade dos itens do pedido.
                </p>
              </div>
              <Switch
                checked={thermalSettings.pedidoHighlightItemQuantity}
                onCheckedChange={(v) => updateThermalSetting("pedidoHighlightItemQuantity", v)}
              />
            </div>

            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Complementos</p>
                <p className="text-xs text-muted-foreground">
                  Destaca automaticamente adicionais/complementos dos itens.
                </p>
              </div>
              <Switch
                checked={thermalSettings.pedidoHighlightComplements}
                onCheckedChange={(v) => updateThermalSetting("pedidoHighlightComplements", v)}
              />
            </div>

            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Observações</p>
                <p className="text-xs text-muted-foreground">Destaca automaticamente observações dos itens/pedido.</p>
              </div>
              <Switch
                checked={thermalSettings.pedidoHighlightObservations}
                onCheckedChange={(v) => updateThermalSetting("pedidoHighlightObservations", v)}
              />
            </div>
          </div>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(value) => setSearchParams({ tipo: value })}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted p-1">
          {tabConfig.map((tab) => (
            <TabsTrigger
              key={tab.type}
              value={tab.type}
              className="flex-grow basis-[calc(50%-0.25rem)] gap-1.5 whitespace-nowrap px-2 py-1.5 text-xs sm:basis-[calc(33.333%-0.25rem)] sm:text-sm md:basis-[calc(25%-0.25rem)] lg:basis-[calc(16.666%-0.25rem)]"
            >
              <tab.icon size={14} className="text-primary shrink-0" />
              <span className="truncate">{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {tabConfig.map((tab) => {
          const fields = getField(tab.type);
          const bodyTemplate = (fields.body_template as string) || "";

          return (
            <TabsContent key={tab.type} value={tab.type} className="space-y-4 mt-4">
              {/* Quick fields */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">[NOMELOJA]</Label>
                  <Input
                    value={(fields.store_name as string) || ""}
                    onChange={(e) => updateField(tab.type, "store_name", e.target.value)}
                    placeholder="TURBO LANCHES"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">[TIPOCOMANDA]</Label>
                  <Input
                    value={(fields.label as string) || ""}
                    onChange={(e) => updateField(tab.type, "label", e.target.value)}
                    placeholder={DEFAULT_LABELS[tab.type] ?? "MODELO"}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">[DIVULGAÇÃO]</Label>
                  <Input
                    value={(fields.custom_message as string) || ""}
                    onChange={(e) => updateField(tab.type, "custom_message", e.target.value)}
                    placeholder="Ex: Siga @turbolanches no Instagram!"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">[RODAPÉ]</Label>
                  <Input
                    value={(fields.footer_message as string) || ""}
                    onChange={(e) => updateField(tab.type, "footer_message", e.target.value)}
                    placeholder="Ex: Agradecemos a preferência!"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Tamanho do Texto Base (px)</Label>
                  <Input
                    type="number"
                    value={fields.body_font_size ?? 11}
                    onChange={(e) => updateField(tab.type, "body_font_size", Number(e.target.value))}
                    min={7}
                    max={20}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Tamanho do Título (px)</Label>
                  <Input
                    type="number"
                    value={fields.label_font_size ?? 24}
                    onChange={(e) => updateField(tab.type, "label_font_size", Number(e.target.value))}
                    min={12}
                    max={40}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Tamanho dos Itens (px)</Label>
                  <Input
                    type="number"
                    value={fields.items_font_size ?? 14}
                    onChange={(e) => updateField(tab.type, "items_font_size", Number(e.target.value))}
                    min={8}
                    max={24}
                  />
                </div>
              </div>

              <div className="grid gap-4 rounded-xl border border-dashed border-border bg-muted/20 p-4 md:grid-cols-2">
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs font-semibold">
                      Imagem inteira do panfleto — variável [IMAGEMPANFLETO]
                    </Label>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Use no modelo: [CENTRO][IMAGEMPANFLETO][/CENTRO]
                    </p>
                  </div>

                  <ImageUpload
                    value={(fields as any).panfleto_image_url || ""}
                    onChange={(url) => updateField(tab.type, "panfleto_image_url", url)}
                    folder="receipt-panfletos"
                  />

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Tamanho da imagem do panfleto</Label>
                    <select
                      value={((fields as any).panfleto_image_size as string) || "large"}
                      onChange={(e) => updateField(tab.type, "panfleto_image_size", e.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {IMAGE_SIZE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <Label className="text-xs font-semibold">Logotipo da loja — variável [LOGOLOJA]</Label>
                    <p className="mt-1 text-[11px] text-muted-foreground">Use no modelo: [CENTRO][LOGOLOJA][/CENTRO]</p>
                  </div>

                  <ImageUpload
                    value={(fields as any).logo_image_url || ""}
                    onChange={(url) => updateField(tab.type, "logo_image_url", url)}
                    folder="receipt-logos"
                  />

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Tamanho do logotipo</Label>
                    <select
                      value={((fields as any).logo_image_size as string) || "medium"}
                      onChange={(e) => updateField(tab.type, "logo_image_size", e.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {IMAGE_SIZE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="md:col-span-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                  <div className="font-semibold">Aviso</div>
                  <div className="mt-1">
                    Sua imagem deve ser em texto/ícones pretos e fundo branco para boa qualidade.
                  </div>
                </div>
              </div>

              {/* Full body template */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">Modelo Completo da Comanda</Label>
                  <button
                    onClick={() => handleResetTemplate(tab.type)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <RotateCcw size={12} />
                    Restaurar padrão
                  </button>
                </div>
                <Textarea
                  value={bodyTemplate || getDefaultTemplate(tab.type)}
                  onChange={(e) => updateField(tab.type, "body_template", e.target.value)}
                  rows={20}
                  className="font-mono text-xs leading-relaxed"
                  placeholder="Cole ou edite o modelo da comanda aqui..."
                />
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => handleSave(tab.type)}
                  disabled={updateMutation.isPending}
                  className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  <Save size={16} />
                  {updateMutation.isPending ? "Salvando..." : "Salvar"}
                </button>

                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border px-3 py-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground">Cópias</Label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={printQty[tab.type] ?? 1}
                    onChange={(e) => setPrintQty((prev) => ({ ...prev, [tab.type]: Number(e.target.value) }))}
                    className="h-9 w-16 text-center"
                  />

                  <PrintModeSelector />

                  <button
                    type="button"
                    onClick={(e) => handlePrintTest(e, tab.type)}
                    disabled={printing}
                    className="flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-bold text-background transition-all active:scale-[0.98] disabled:opacity-50"
                    title="Imprime cópias separadas (uma por vez)"
                  >
                    <Printer size={16} />
                    Imprimir
                  </button>
                </div>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
};

export default AdminReceipts;
