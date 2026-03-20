import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/contexts/StoreContext";

interface Product {
  id: string;
  name: string;
  price: number;
}

interface Ingredient {
  id: string;
  cost_per_unit: number;
}

interface ProductIngredient {
  product_id: string;
  ingredient_id: string;
  quantity: number;
}

interface ExtraCost {
  cost_type: string;
  value: number;
}

const ProfitDashboard = () => {
  const { storeId } = useStore();
  const [rows, setRows] = useState<Array<{
    name: string;
    price: number;
    ingredientCost: number;
    extraCost: number;
    totalCost: number;
    profit: number;
    margin: number;
  }>>([]);

  useEffect(() => {
    const load = async () => {
      const filters = storeId ? { store_id: storeId } : {};

      const [prodRes, ingRes, piRes, ecRes] = await Promise.all([
        supabase.from("products").select("id, name, price").eq("active", true).match(filters),
        supabase.from("ingredients").select("id, cost_per_unit").match(filters),
        supabase.from("product_ingredients").select("product_id, ingredient_id, quantity").match(filters),
        supabase.from("extra_costs").select("cost_type, value").match(filters),
      ]);

      const products = (prodRes.data || []) as Product[];
      const ingredients = (ingRes.data || []) as Ingredient[];
      const pis = (piRes.data || []) as ProductIngredient[];
      const extras = (ecRes.data || []) as ExtraCost[];

      const ingMap = new Map(ingredients.map((i) => [i.id, i.cost_per_unit]));

      const totalFixedExtra = extras.filter((e) => e.cost_type === "fixed").reduce((s, e) => s + Number(e.value), 0);
      const totalPctExtra = extras.filter((e) => e.cost_type === "percentage").reduce((s, e) => s + Number(e.value), 0);

      const computed = products.map((p) => {
        const myIngredients = pis.filter((pi) => pi.product_id === p.id);
        const ingredientCost = myIngredients.reduce((s, pi) => {
          const unitCost = ingMap.get(pi.ingredient_id) || 0;
          return s + Number(pi.quantity) * Number(unitCost);
        }, 0);

        const pctCost = (totalPctExtra / 100) * Number(p.price);
        const extraCost = totalFixedExtra + pctCost;
        const totalCost = ingredientCost + extraCost;
        const profit = Number(p.price) - totalCost;
        const margin = Number(p.price) > 0 ? (profit / Number(p.price)) * 100 : 0;

        return { name: p.name, price: Number(p.price), ingredientCost, extraCost, totalCost, profit, margin };
      });

      computed.sort((a, b) => a.margin - b.margin);
      setRows(computed);
    };
    load();
  }, [storeId]);

  const marginColor = (m: number) => {
    if (m < 0) return "text-red-600 font-bold";
    if (m < 30) return "text-amber-600 font-semibold";
    return "text-emerald-600 font-semibold";
  };

  return (
    <div className="mt-4 overflow-auto">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Cadastre ingredientes e vincule-os aos produtos para ver o dashboard de lucro.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-2 pr-2 font-medium text-muted-foreground">Produto</th>
              <th className="py-2 px-2 font-medium text-muted-foreground text-right">Venda</th>
              <th className="py-2 px-2 font-medium text-muted-foreground text-right">Ingred.</th>
              <th className="py-2 px-2 font-medium text-muted-foreground text-right">Extras</th>
              <th className="py-2 px-2 font-medium text-muted-foreground text-right">Custo</th>
              <th className="py-2 px-2 font-medium text-muted-foreground text-right">Lucro</th>
              <th className="py-2 pl-2 font-medium text-muted-foreground text-right">Margem</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-border/50">
                <td className="py-2 pr-2 text-foreground font-medium truncate max-w-[120px]">{r.name}</td>
                <td className="py-2 px-2 text-right text-foreground">R$ {r.price.toFixed(2)}</td>
                <td className="py-2 px-2 text-right text-muted-foreground">R$ {r.ingredientCost.toFixed(2)}</td>
                <td className="py-2 px-2 text-right text-muted-foreground">R$ {r.extraCost.toFixed(2)}</td>
                <td className="py-2 px-2 text-right text-foreground">R$ {r.totalCost.toFixed(2)}</td>
                <td className={`py-2 px-2 text-right ${marginColor(r.margin)}`}>R$ {r.profit.toFixed(2)}</td>
                <td className={`py-2 pl-2 text-right ${marginColor(r.margin)}`}>{r.margin.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default ProfitDashboard;
