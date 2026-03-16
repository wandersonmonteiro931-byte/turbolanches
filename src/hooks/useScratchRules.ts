import { ReactNode, createElement, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_RULES = [
  "O subtotal dos produtos precisa ser igual ou maior que {min_value}.",
  "A taxa de entrega não entra no cálculo da promoção.",
  "Pedidos que utilizam cupom de desconto não participam da raspadinha.",
  "A raspadinha só fica disponível quando o pedido for entregue com sucesso.",
  "Cada pedido elegível dá direito a apenas uma raspadinha.",
  "A promoção depende da disponibilidade de prêmios cadastrados.",
  "Ao raspar, você recebe um cupom de desconto vinculado à sua conta.",
  "O cupom gerado é de uso único e possui validade.",
  "O desconto do cupom não se aplica à taxa de entrega.",
];

const DEFAULT_HOW_IT_WORKS = [
  "Faça um pedido com subtotal a partir de {min_value} (sem contar a taxa de entrega).",
  "Aguarde seu pedido ser entregue com sucesso.",
  "Acesse a seção \"Presentes\" no menu inferior e raspe sua raspadinha virtual!",
  "Ao raspar, você ganha um cupom de desconto exclusivo para usar no próximo pedido.",
  "Copie o código do cupom e aplique no carrinho antes de finalizar a compra.",
];

export const SCRATCH_RULES_KEY = "scratch_rules";
export const SCRATCH_HOW_IT_WORKS_KEY = "scratch_how_it_works";

export const renderScratchRule = (rule: string, minValueLabel: string): ReactNode[] => {
  const normalizedRule = rule.replace(/o valor mínimo configurado/g, "{min_value}");
  const parts = normalizedRule.split("{min_value}");

  return parts.flatMap((part, index) => {
    const nodes: ReactNode[] = [part];

    if (index < parts.length - 1) {
      nodes.push(
        createElement(
          "span",
          {
            key: `min-${index}`,
            className: "font-extrabold text-foreground",
          },
          minValueLabel,
        ),
      );
    }

    return nodes;
  });
};

export const useScratchRules = () => {
  const [rules, setRules] = useState<string[]>(DEFAULT_RULES);
  const [howItWorks, setHowItWorks] = useState<string[]>(DEFAULT_HOW_IT_WORKS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      const { data } = await supabase
        .from("site_content")
        .select("key, value")
        .in("key", [SCRATCH_RULES_KEY, SCRATCH_HOW_IT_WORKS_KEY]);

      if (data) {
        for (const row of data) {
          try {
            const parsed = JSON.parse(row.value as string);
            if (!Array.isArray(parsed) || parsed.length === 0) continue;
            if (row.key === SCRATCH_RULES_KEY) setRules(parsed);
            if (row.key === SCRATCH_HOW_IT_WORKS_KEY) setHowItWorks(parsed);
          } catch {}
        }
      }

      setLoading(false);
    };

    void fetchAll();
  }, []);

  return {
    rules,
    howItWorks,
    loading,
    defaultRules: DEFAULT_RULES,
    defaultHowItWorks: DEFAULT_HOW_IT_WORKS,
  };
};
