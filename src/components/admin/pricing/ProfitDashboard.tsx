import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/contexts/StoreContext";
import { formatCurrency } from "./pricingMoney";
import {
  buildProductCostRows,
  type PricingCategory,
  type PricingComboComponent,
  type PricingExtraCost,
  type PricingIngredient,
  type PricingProduct,
  type PricingProductIngredient,
} from "./productCosting";

const ProfitDashboard = () => {
  const { storeId } = useStore();
  const [rows, setRows] = useState<Array<{
    name: string;
    price: number;
    ingredientCost: number;
    manualCost: number;
    extraCost: number;
    totalCost: number;
    profit: number;
    margin: number;
  }>>([]);

  useEffect(() => {
    const load = async () => {
      let productsQuery = supabase
        .from("products")
        .select("id, name, price, manual_cost, category_id, active, sort_order, is_combo, combo_item_count")
        .eq("active", true);
      let ingredientsQuery = supabase.from("ingredients").select("id, cost_per_unit");
      let productIngredientsQuery = supabase.from("product_ingredients").select("product_id, ingredient_id, quantity");
      let comboComponentsQuery = supabase.from("product_combo_items").select("product_id, component_product_id, quantity, sort_order");
      let extraCostsQuery = supabase.from("extra_costs").select("cost_type, value");

      if (storeId) {
        productsQuery = productsQuery.eq("store_id", storeId);
        ingredientsQuery = ingredientsQuery.eq("store_id", storeId);
        productIngredientsQuery = productIngredientsQuery.eq("store_id", storeId);
        comboComponentsQuery = comboComponentsQuery.eq("store_id", storeId);
        extraCostsQuery = extraCostsQuery.eq("store_id", storeId);
      }

      const [prodRes, ingRes, piRes, comboRes, ecRes] = await Promise.all([
        productsQuery,
        ingredientsQuery,
        productIngredientsQuery,
        comboComponentsQuery,
        extraCostsQuery,
      ]);

      const computed = buildProductCostRows({
        categories: [] as PricingCategory[],
        products: (prodRes.data || []) as PricingProduct[],
        ingredients: (ingRes.data || []) as PricingIngredient[],
        productIngredients: (piRes.data || []) as PricingProductIngredient[],
        comboComponents: (comboRes.data || []) as PricingComboComponent[],
        extraCosts: (ecRes.data || []) as PricingExtraCost[],
      }).map((row) => ({
        name: row.name,
        price: row.price,
        ingredientCost: row.ingredientCost,
        manualCost: row.manualCost,
        extraCost: row.extraCost,
        totalCost: row.totalCost,
        profit: row.profit,
        margin: row.margin,
      }));

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
              <th className="py-2 px-2 font-medium text-muted-foreground text-right">Direto</th>
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
                <td className="py-2 px-2 text-right text-foreground">{formatCurrency(r.price)}</td>
                <td className="py-2 px-2 text-right text-muted-foreground">{formatCurrency(r.ingredientCost)}</td>
                <td className="py-2 px-2 text-right text-muted-foreground">{formatCurrency(r.manualCost)}</td>
                <td className="py-2 px-2 text-right text-muted-foreground">{formatCurrency(r.extraCost)}</td>
                <td className="py-2 px-2 text-right text-foreground">{formatCurrency(r.totalCost)}</td>
                <td className={`py-2 px-2 text-right ${marginColor(r.margin)}`}>{formatCurrency(r.profit)}</td>
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
