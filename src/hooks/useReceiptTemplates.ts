import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useStore } from "@/contexts/StoreContext";

export interface ReceiptTemplate {
  id: string;
  template_type: string;
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
      return (data as unknown as ReceiptTemplate[]) || [];
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
    mutationFn: async (template: Partial<ReceiptTemplate> & { id: string }) => {
      const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const key of EDITABLE_FIELDS) {
        if (key in template) {
          payload[key] = (template as any)[key];
        }
      }
      const { error } = await supabase
        .from("receipt_templates")
        .update(payload)
        .eq("id", template.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["receipt_templates", storeId] });
      toast.success("Comanda salva com sucesso!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao salvar comanda");
    },
  });
};
