import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useStore } from "@/contexts/StoreContext";

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
  updated_at: string;
}

export const useReceiptTemplates = () => {
  const { storeId } = useStore();
  return useQuery({
    queryKey: ["receipt_templates", storeId],
    queryFn: async () => {
      let query = supabase
        .from("receipt_templates")
        .select("*")
        .order("template_type");

      if (storeId) {
        query = query.or(`store_id.eq.${storeId},store_id.is.null`);
      } else {
        query = query.is("store_id", null);
      }

      const { data, error } = await query;
      if (error) throw error;

      const rows = ((data as unknown as ReceiptTemplate[]) || []).reduce<Record<string, ReceiptTemplate>>((acc, row) => {
        const current = acc[row.template_type];
        const isStoreSpecific = row.store_id === storeId;
        const currentIsStoreSpecific = current?.store_id === storeId;

        if (!current || (isStoreSpecific && !currentIsStoreSpecific)) {
          acc[row.template_type] = row;
        }

        return acc;
      }, {});

      return Object.values(rows).sort((left, right) => left.template_type.localeCompare(right.template_type));
    },
  });
};

const EDITABLE_FIELDS = [
  "store_name", "label", "custom_message", "footer_message", "body_template",
  "show_customer_code", "show_max_delivery_time", "show_driver_field",
  "show_troco", "show_obs", "show_payment_info", "show_totals_detail",
  "items_font_size", "label_font_size",
] as const;

export const useUpdateReceiptTemplate = () => {
  const queryClient = useQueryClient();
  const { storeId } = useStore();

  return useMutation({
    mutationFn: async (template: Partial<ReceiptTemplate> & { template_type: string; id?: string }) => {
      const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const key of EDITABLE_FIELDS) {
        if (key in template) {
          payload[key] = (template as any)[key];
        }
      }

      if (template.id) {
        const { error } = await supabase
          .from("receipt_templates")
          .update(payload)
          .eq("id", template.id);
        if (error) throw error;
        return;
      }

      let existingQuery = supabase
        .from("receipt_templates")
        .select("id")
        .eq("template_type", template.template_type)
        .limit(1);

      existingQuery = storeId ? existingQuery.eq("store_id", storeId) : existingQuery.is("store_id", null);

      const { data: existing, error: existingError } = await existingQuery.maybeSingle();
      if (existingError) throw existingError;

      if (existing?.id) {
        const { error } = await supabase
          .from("receipt_templates")
          .update(payload)
          .eq("id", existing.id);
        if (error) throw error;
        return;
      }

      const { error } = await supabase
        .from("receipt_templates")
        .insert({
          ...payload,
          template_type: template.template_type,
          store_id: storeId ?? null,
          store_name: template.store_name ?? "TURBO LANCHES",
          label: template.label ?? template.template_type.toUpperCase(),
          custom_message: template.custom_message ?? "",
          footer_message: template.footer_message ?? "",
          body_template: template.body_template ?? "",
          show_customer_code: Boolean(template.show_customer_code),
          show_max_delivery_time: Boolean(template.show_max_delivery_time),
          show_driver_field: Boolean(template.show_driver_field),
          show_troco: Boolean(template.show_troco),
          show_obs: Boolean(template.show_obs),
          show_payment_info: Boolean(template.show_payment_info),
          show_totals_detail: Boolean(template.show_totals_detail),
          items_font_size: template.items_font_size ?? 14,
          label_font_size: template.label_font_size ?? 24,
        });
      if (error) throw error;
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
