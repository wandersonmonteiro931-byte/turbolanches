import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_RULES = [
  "O subtotal dos produtos precisa ser igual ou maior que o valor mínimo configurado.",
  "A taxa de entrega não entra no cálculo da promoção.",
  "Pedidos que utilizam cupom de desconto não participam da raspadinha.",
  "A raspadinha só fica disponível quando o pedido for entregue com sucesso.",
  "Cada pedido elegível dá direito a apenas uma raspadinha.",
  "A promoção depende da disponibilidade de prêmios cadastrados.",
  "Ao raspar, você recebe um cupom de desconto vinculado à sua conta.",
  "O cupom gerado é de uso único e possui validade.",
  "O desconto do cupom não se aplica à taxa de entrega.",
];

export const SCRATCH_RULES_KEY = "scratch_rules";

export const useScratchRules = () => {
  const [rules, setRules] = useState<string[]>(DEFAULT_RULES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("site_content")
        .select("value")
        .eq("key", SCRATCH_RULES_KEY)
        .maybeSingle();

      if (data?.value) {
        try {
          const parsed = JSON.parse(data.value as string);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setRules(parsed);
          }
        } catch {}
      }
      setLoading(false);
    };
    void fetch();
  }, []);

  return { rules, loading, defaultRules: DEFAULT_RULES };
};
