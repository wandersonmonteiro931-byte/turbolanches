import { useState, useEffect, useMemo } from "react";
import { useReceiptTemplates, useUpdateReceiptTemplate, ReceiptTemplate } from "@/hooks/useReceiptTemplates";
import { getDefaultTemplate } from "@/lib/receiptDefaults";
import ReceiptVariableReference from "@/components/admin/ReceiptVariableReference";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Save, ClipboardList, Heart, RotateCcw, Sticker, ShoppingBasket, Truck, Printer } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const tabConfig = [
  { type: "pedido", label: "Comanda Pedido", icon: ClipboardList },
  { type: "obrigado", label: "Comanda Obrigado", icon: Heart },
  { type: "entregador", label: "Fechamento de Rota", icon: Truck },
  { type: "etiquetas", label: "Etiquetas", icon: Sticker },
  { type: "reposicao", label: "Reposição", icon: ShoppingBasket },
];

const DEFAULT_LABELS: Record<string, string> = {
  pedido: "PEDIDO",
  obrigado: "OBRIGADO!",
  entregador: "FECHAMENTO DE ROTA",
  etiquetas: "ETIQUETA",
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
});

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

  const handlePrintTest = async (e: React.MouseEvent, type: string) => {
    e.preventDefault();
    e.stopPropagation();
    const qty = Math.max(1, Math.min(20, Number(printQty[type] || 1)));
    if (type === "etiquetas" || type === "reposicao") {
      toast.info("Teste de impressão disponível apenas para Pedido / Obrigado / Fechamento de Rota.");
      return;
    }
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
      const stamp = Date.now();
      const queue = Array.from({ length: qty }, (_, index) => `/admin/imprimir/${lastOrder.id}?tipo=${type}&copy=${index + 1}&keep_open=1&delay_ms=${index === 0 ? 100 : 250}&t=${stamp}_${index}`);
      const win = window.open(queue[0], `_print_${type}_${stamp}`, "width=320,height=640");
      if (!win) {
        toast.error("O navegador bloqueou as janelas. Permita pop-ups para este site.");
      } else {
        for (let i = 1; i < queue.length; i += 1) {
          setTimeout(() => {
            try {
              if (!win.closed) {
                win.location.href = queue[i];
              }
            } catch (error) {
              console.error("[AdminReceipts] queue print navigation error", error);
            }
          }, i * 1800);
        }
        toast.success(`${qty} impressões separadas enviadas à impressora.`);
      }
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
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
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

      <Tabs value={activeTab} onValueChange={(value) => setSearchParams({ tipo: value })}>
        <TabsList className="grid w-full grid-cols-2 lg:grid-cols-5">
          {tabConfig.map((tab) => (
            <TabsTrigger key={tab.type} value={tab.type} className="gap-2">
              <tab.icon size={16} className="text-primary" />
              {tab.label}
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

              {/* Full body template */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">
                    Modelo Completo da Comanda
                  </Label>
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

                <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground">Cópias</Label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={printQty[tab.type] ?? 1}
                    onChange={(e) =>
                      setPrintQty((prev) => ({ ...prev, [tab.type]: Number(e.target.value) }))
                    }
                    className="h-9 w-16 text-center"
                  />
                  <button
                    type="button"
                    onClick={(e) => handlePrintTest(e, tab.type)}
                    disabled={printing}
                    className="flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-bold text-background transition-all active:scale-[0.98] disabled:opacity-50"
                    title="Imprime cópias separadas (uma por vez)"
                  >
                    <Printer size={16} />
                    Imprimir Teste
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
