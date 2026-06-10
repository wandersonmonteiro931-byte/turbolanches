import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/contexts/StoreContext";
import FreeReceiptEditor from "@/components/admin/FreeReceiptEditor";
import { buildAdminPrintDocument } from "@/lib/adminPrintTemplates";
import { getThermalPrintSettings } from "@/lib/thermalPrintSettings";

const TEMPLATE_TYPE = "livre";

const DEFAULT_LIVRE = `[CENTRO][NOMELOJA][/CENTRO]
[CENTRO][GRANDE]IMPRESSÃO LIVRE[/GRANDE][/CENTRO]
---
Digite aqui o conteúdo que você quer imprimir.
Você pode usar todas as variáveis e formatações.
---
[CENTRO][RODAPÉ][/CENTRO]`;

const AdminFreePrint = () => {
  const { storeId } = useStore();
  const [value, setValue] = useState<string>(DEFAULT_LIVRE);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        let query = supabase
          .from("receipt_templates" as any)
          .select("id, body_template, store_id")
          .eq("template_type", TEMPLATE_TYPE);

        query = storeId ? query.or(`store_id.eq.${storeId},store_id.is.null`) : query.is("store_id", null);

        const { data, error } = await query.order("store_id", { ascending: false }).limit(1).maybeSingle();
        if (error) throw error;

        if (data) {
          const row = data as any;
          setTemplateId(row.id);
          setValue(row.body_template || DEFAULT_LIVRE);
        } else {
          setTemplateId(null);
          setValue(DEFAULT_LIVRE);
        }
      } catch (err: any) {
        console.error(err);
        toast.error(err.message || "Erro ao carregar modelo livre");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [storeId]);

  const handleSave = async (next: string) => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        body_template: next,
        updated_at: new Date().toISOString(),
      };

      if (templateId) {
        const { error } = await supabase
          .from("receipt_templates" as any)
          .update(payload as any)
          .eq("id", templateId);
        if (error) throw error;
      } else {
        const insertPayload = {
          ...payload,
          template_type: TEMPLATE_TYPE,
          store_id: storeId ?? null,
          store_name: "TURBO LANCHES",
          label: "IMPRESSÃO LIVRE",
          custom_message: "",
          footer_message: "",
          show_customer_code: false,
          show_max_delivery_time: false,
          show_driver_field: false,
          show_troco: false,
          show_obs: false,
          show_payment_info: false,
          show_totals_detail: false,
          items_font_size: 14,
          label_font_size: 24,
          body_font_size: 11,
        };
        const { data, error } = await supabase
          .from("receipt_templates" as any)
          .insert(insertPayload as any)
          .select("id")
          .single();
        if (error) throw error;
        setTemplateId((data as any).id);
      }

      setValue(next);
      toast.success("Modelo livre salvo com sucesso!");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erro ao salvar modelo livre");
    } finally {
      setSaving(false);
    }
  };

  const handlePrintTest = (next: string) => {
    try {
      const thermal = getThermalPrintSettings();
      const html = buildAdminPrintDocument({
        title: "Impressão Livre",
        template: next,
        variables: {
          "[NOMELOJA]": "TURBO LANCHES",
          "[DATAHORA]": new Date().toLocaleString("pt-BR"),
          "[RODAPÉ]": "Obrigado pela preferência!",
        },
        pageWidthMm: thermal.paperWidthMm ?? 72,
        pageMarginMm: 0,
        bodyFontSizePx: 12,
      });

      const win = window.open("", "imprimir_livre", "width=380,height=640");
      if (!win) {
        toast.error("Popup bloqueado. Permita popups para imprimir o teste.");
        return;
      }
      win.document.open();
      win.document.write(html);
      win.document.close();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erro ao imprimir teste");
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando modelo livre...</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-foreground">Impressão Livre</h2>
        <p className="text-sm text-muted-foreground">
          Editor livre — digite qualquer conteúdo, use variáveis e tags de formatação, salve e imprima.
        </p>
      </div>

      <FreeReceiptEditor
        title="Conteúdo da impressão livre"
        value={value}
        defaultValue={DEFAULT_LIVRE}
        onSave={handleSave}
        onPrintTest={handlePrintTest}
        saving={saving}
      />
    </div>
  );
};

export default AdminFreePrint;
