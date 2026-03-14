import { useState, useEffect } from "react";
import { useReceiptTemplates, useUpdateReceiptTemplate, ReceiptTemplate } from "@/hooks/useReceiptTemplates";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Save, Eye, ChefHat, Truck, Heart, Info } from "lucide-react";

const VARIABLES = [
  { key: "[LOJA]", desc: "Nome da loja" },
  { key: "[PEDIDO]", desc: "Número do pedido (ex: #00001)" },
  { key: "[CODIGO]", desc: "Código do cliente (ex: T00001)" },
  { key: "[NOME]", desc: "Nome do cliente" },
  { key: "[TELEFONE]", desc: "Telefone do cliente" },
  { key: "[DATA_HORA]", desc: "Data e hora do pedido" },
  { key: "[HORARIO_MAX]", desc: "Horário máximo de entrega" },
  { key: "[ENDERECO]", desc: "Endereço completo" },
  { key: "[TOTAL]", desc: "Valor total do pedido" },
  { key: "[SUBTOTAL]", desc: "Subtotal (sem entrega)" },
  { key: "[ENTREGA_VALOR]", desc: "Taxa de entrega" },
  { key: "[DESCONTO]", desc: "Valor do desconto" },
  { key: "[PAGAMENTO]", desc: "Método de pagamento" },
  { key: "[TROCO]", desc: "Valor do troco" },
  { key: "[TIPO_ENTREGA]", desc: "DELIVERY / RETIRADA" },
];

const tabConfig = [
  { type: "cozinha", label: "Cozinha", icon: ChefHat, color: "text-orange-500" },
  { type: "entrega", label: "Entrega", icon: Truck, color: "text-blue-500" },
  { type: "cliente", label: "Cliente", icon: Heart, color: "text-pink-500" },
];

const AdminReceipts = () => {
  const { data: templates, isLoading } = useReceiptTemplates();
  const updateMutation = useUpdateReceiptTemplate();
  const [editData, setEditData] = useState<Record<string, Partial<ReceiptTemplate>>>({});

  useEffect(() => {
    if (templates) {
      const map: Record<string, Partial<ReceiptTemplate>> = {};
      templates.forEach((t) => {
        map[t.template_type] = { ...t };
      });
      setEditData(map);
    }
  }, [templates]);

  const getField = (type: string) => editData[type] || {};

  const updateField = (type: string, field: string, value: any) => {
    setEditData((prev) => ({
      ...prev,
      [type]: { ...prev[type], [field]: value },
    }));
  };

  const handleSave = (type: string) => {
    const data = editData[type];
    if (!data?.id) return;
    updateMutation.mutate(data as ReceiptTemplate & { id: string });
  };

  const handlePreview = (type: string) => {
    // Open a sample preview - uses first order or a demo
    window.open(`/admin/imprimir/preview?tipo=${type}`, "_blank", "width=320,height=600");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Comandas de Impressão</h2>
        <p className="text-sm text-muted-foreground">
          Personalize o texto e configurações de cada tipo de comanda
        </p>
      </div>

      {/* Variables reference */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Info size={16} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">Variáveis disponíveis</span>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
          {VARIABLES.map((v) => (
            <div key={v.key} className="flex items-center gap-2 text-xs">
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-primary">{v.key}</code>
              <span className="text-muted-foreground">{v.desc}</span>
            </div>
          ))}
        </div>
      </div>

      <Tabs defaultValue="cozinha">
        <TabsList className="w-full grid grid-cols-3">
          {tabConfig.map((tab) => (
            <TabsTrigger key={tab.type} value={tab.type} className="gap-2">
              <tab.icon size={16} className={tab.color} />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {tabConfig.map((tab) => {
          const fields = getField(tab.type);
          return (
            <TabsContent key={tab.type} value={tab.type} className="space-y-4 mt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Store name */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Nome da Loja</Label>
                  <Input
                    value={(fields.store_name as string) || ""}
                    onChange={(e) => updateField(tab.type, "store_name", e.target.value)}
                    placeholder="TURBO LANCHES"
                  />
                </div>

                {/* Label */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Título da Comanda</Label>
                  <Input
                    value={(fields.label as string) || ""}
                    onChange={(e) => updateField(tab.type, "label", e.target.value)}
                    placeholder={tab.type === "cliente" ? "OBRIGADO!" : tab.label.toUpperCase()}
                  />
                </div>

                {/* Label font size */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Tamanho do Título (px)</Label>
                  <Input
                    type="number"
                    value={fields.label_font_size ?? 24}
                    onChange={(e) => updateField(tab.type, "label_font_size", Number(e.target.value))}
                    min={12}
                    max={40}
                  />
                </div>

                {/* Items font size */}
                <div className="space-y-1.5">
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

              {/* Custom message */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  Mensagem Personalizada
                  <span className="ml-1 text-muted-foreground font-normal">(use variáveis como [NOME])</span>
                </Label>
                <Textarea
                  value={(fields.custom_message as string) || ""}
                  onChange={(e) => updateField(tab.type, "custom_message", e.target.value)}
                  placeholder="Ex: [NOME], seu pedido foi preparado com muito carinho!"
                  rows={2}
                />
              </div>

              {/* Footer */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Mensagem de Rodapé</Label>
                <Textarea
                  value={(fields.footer_message as string) || ""}
                  onChange={(e) => updateField(tab.type, "footer_message", e.target.value)}
                  placeholder="Ex: Agradecemos a preferência!"
                  rows={2}
                />
              </div>

              {/* Toggles */}
              <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
                <span className="text-sm font-semibold text-foreground">Exibir seções</span>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Código do cliente</Label>
                    <Switch
                      checked={fields.show_customer_code ?? true}
                      onCheckedChange={(v) => updateField(tab.type, "show_customer_code", v)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Horário máx. entrega</Label>
                    <Switch
                      checked={fields.show_max_delivery_time ?? true}
                      onCheckedChange={(v) => updateField(tab.type, "show_max_delivery_time", v)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Info de pagamento</Label>
                    <Switch
                      checked={fields.show_payment_info ?? true}
                      onCheckedChange={(v) => updateField(tab.type, "show_payment_info", v)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Detalhes dos totais</Label>
                    <Switch
                      checked={fields.show_totals_detail ?? true}
                      onCheckedChange={(v) => updateField(tab.type, "show_totals_detail", v)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Troco</Label>
                    <Switch
                      checked={fields.show_troco ?? true}
                      onCheckedChange={(v) => updateField(tab.type, "show_troco", v)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Observações</Label>
                    <Switch
                      checked={fields.show_obs ?? true}
                      onCheckedChange={(v) => updateField(tab.type, "show_obs", v)}
                    />
                  </div>
                  {tab.type === "entrega" && (
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Campo entregador</Label>
                      <Switch
                        checked={fields.show_driver_field ?? true}
                        onCheckedChange={(v) => updateField(tab.type, "show_driver_field", v)}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => handleSave(tab.type)}
                  disabled={updateMutation.isPending}
                  className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  <Save size={16} />
                  {updateMutation.isPending ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
};

export default AdminReceipts;
