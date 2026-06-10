import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useStore } from "@/contexts/StoreContext";

export type ReceiptImageSize = "small" | "medium" | "large" | "xlarge";

export interface ReceiptTemplate {
  id: string;
  template_type: string;
  store_id?: string | null;
  store_name: string;
  label: string;
  custom_message: string;
  footer_message: string;
  body_template: string;
  show_customer_code: boolean;
  show_max_delivery_time: boolean;
  show_driver_field: boolean;
  show_troco: boolean;
  show_obs: boolean;
  show_payment_info: boolean;
  show_totals_detail: boolean;
  items_font_size: number;
  label_font_size: number;
  body_font_size: number;
  logo_image_url?: string | null;
  logo_image_size?: ReceiptImageSize | null;
  panfleto_image_url?: string | null;
  panfleto_image_size?: ReceiptImageSize | null;
  updated_at: string;
}

const normalizeImageSize = (value: unknown, fallback: ReceiptImageSize = "medium"): ReceiptImageSize => {
  return value === "small" || value === "medium" || value === "large" || value === "xlarge" ? value : fallback;
};

const normalizeTemplateRow = (row: ReceiptTemplate): ReceiptTemplate => ({
  ...row,
  logo_image_url: row.logo_image_url ?? null,
  logo_image_size: normalizeImageSize(row.logo_image_size, "medium"),
  panfleto_image_url: row.panfleto_image_url ?? null,
  panfleto_image_size: normalizeImageSize(row.panfleto_image_size, "large"),
});

export const useReceiptTemplates = () => {
  const { storeId } = useStore();

  return useQuery({
    queryKey: ["receipt_templates", storeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("receipt_templates").select("*").order("template_type");

      if (error) throw error;

      const rows = ((data as unknown as ReceiptTemplate[]) || []).reduce<Record<string, ReceiptTemplate>>(
        (acc, row) => {
          const normalized = normalizeTemplateRow(row);
          const current = acc[normalized.template_type];

          if (!current) {
            acc[normalized.template_type] = normalized;
            return acc;
          }

          const rowIsStore = storeId && normalized.store_id === storeId;
          const currentIsStore = storeId && current.store_id === storeId;

          if (rowIsStore && !currentIsStore) {
            acc[normalized.template_type] = normalized;
          }

          return acc;
        },
        {},
      );

      return Object.values(rows).sort((left, right) => left.template_type.localeCompare(right.template_type));
    },
  });
};

const EDITABLE_FIELDS = [
  "store_name",
  "label",
  "custom_message",
  "footer_message",
  "body_template",
  "show_customer_code",
  "show_max_delivery_time",
  "show_driver_field",
  "show_troco",
  "show_obs",
  "show_payment_info",
  "show_totals_detail",
  "items_font_size",
  "label_font_size",
  "body_font_size",
  "logo_image_url",
  "logo_image_size",
  "panfleto_image_url",
  "panfleto_image_size",
] as const;

const buildPayload = (template: Partial<ReceiptTemplate> & { template_type: string; id?: string }) => {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };

  for (const key of EDITABLE_FIELDS) {
    if (key in template) payload[key] = (template as any)[key];
  }

  if ("logo_image_url" in template) payload.logo_image_url = template.logo_image_url || null;
  if ("panfleto_image_url" in template) payload.panfleto_image_url = template.panfleto_image_url || null;
  if ("logo_image_size" in template) payload.logo_image_size = normalizeImageSize(template.logo_image_size, "medium");
  if ("panfleto_image_size" in template)
    payload.panfleto_image_size = normalizeImageSize(template.panfleto_image_size, "large");

  return payload;
};

export const useUpdateReceiptTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (template: Partial<ReceiptTemplate> & { template_type: string; id?: string }) => {
      const payload = buildPayload(template);

      /*
        CORREÇÃO DEFINITIVA:
        Seu Supabase tem UNIQUE em template_type e RLS bloqueando INSERT pelo app.
        Então a tela NÃO deve tentar criar linha nova.
        Ela deve sempre atualizar a linha já existente pelo template_type.
      */

      if (template.id) {
        const { error } = await supabase
          .from("receipt_templates")
          .update(payload as any)
          .eq("id", template.id);

        if (!error) return;
        console.warn("[receipt_templates] falhou por id, tentando por template_type:", error.message);
      }

      const { error: updateByTypeError } = await supabase
        .from("receipt_templates")
        .update(payload as any)
        .eq("template_type", template.template_type);

      if (updateByTypeError) throw updateByTypeError;

      return;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["receipt_templates"] });
      toast.success("Modelo de impressão salvo com sucesso!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao salvar modelo de impressão");
    },
  });
};
