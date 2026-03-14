import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ReceiptTemplate {
  id: string;
  template_type: string;
  store_name: string;
  label: string;
  custom_message: string;
  footer_message: string;
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
  return useQuery({
    queryKey: ["receipt_templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("receipt_templates" as any)
        .select("*")
        .order("template_type");
      if (error) throw error;
      return (data as unknown as ReceiptTemplate[]) || [];
    },
  });
};

export const useUpdateReceiptTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ReceiptTemplate> & { id: string }) => {
      const { error } = await supabase
        .from("receipt_templates" as any)
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["receipt_templates"] });
      toast.success("Comanda salva com sucesso!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao salvar comanda");
    },
  });
};
