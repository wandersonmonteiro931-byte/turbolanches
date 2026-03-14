import { useState, useEffect } from "react";
import { useReceiptTemplates, useUpdateReceiptTemplate, ReceiptTemplate } from "@/hooks/useReceiptTemplates";
import { getDefaultTemplate } from "@/lib/receiptDefaults";
import ReceiptVariableReference from "@/components/admin/ReceiptVariableReference";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Save, ChefHat, Truck, Heart, RotateCcw } from "lucide-react";

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
                    placeholder={tab.type === "cliente" ? "OBRIGADO!" : tab.label.toUpperCase()}
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
