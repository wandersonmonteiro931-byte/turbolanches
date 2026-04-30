import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
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
import { normalizeSearch } from "@/lib/searchNormalize";

interface ProfitRow {
  id: string;
  name: string;
  categoryId: string | null;
  categoryName: string;
  price: number;
  ingredientCost: number;
  manualCost: number;
  extraCost: number;
  totalCost: number;
  profit: number;
  margin: number;
}

const ProfitDashboard = () => {
  const { storeId } = useStore();
  const [rows, setRows] = useState<ProfitRow[]>([]);
  const [categories, setCategories] = useState<PricingCategory[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [marginFilter, setMarginFilter] = useState("all");

  useEffect(() => {
    const load = async () => {
      let categoriesQuery = supabase.from("categories").select("id, name, sort_order").order("sort_order").order("name");
      let productsQuery = supabase
        .from("products")
        .select("id, name, price, manual_cost, category_id, active, sort_order, is_combo, combo_item_count")
        .eq("active", true);
      let ingredientsQuery = supabase.from("ingredients").select("id, cost_per_unit");
      let productIngredientsQuery = supabase.from("product_ingredients").select("product_id, ingredient_id, quantity");
      let comboComponentsQuery = supabase.from("product_combo_items").select("product_id, component_product_id, quantity, sort_order");
      let extraCostsQuery = supabase
        .from("extra_costs")
        .select("cost_type, value, division_mode, days_duration, items_per_day, preset_key, sort_order, notes, name");

      if (storeId) {
        categoriesQuery = categoriesQuery.eq("store_id", storeId);
        productsQuery = productsQuery.eq("store_id", storeId);
        ingredientsQuery = ingredientsQuery.eq("store_id", storeId);
        productIngredientsQuery = productIngredientsQuery.eq("store_id", storeId);
        comboComponentsQuery = comboComponentsQuery.eq("store_id", storeId);
        extraCostsQuery = extraCostsQuery.eq("store_id", storeId);
      }

      const [catRes, prodRes, ingRes, piRes, comboRes, ecRes] = await Promise.all([
        categoriesQuery,
        productsQuery,
        ingredientsQuery,
        productIngredientsQuery,
        comboComponentsQuery,
        extraCostsQuery,
      ]);

      const cats = (catRes.data || []) as PricingCategory[];
      setCategories(cats);

      const computed = buildProductCostRows({
        categories: cats,
        products: (prodRes.data || []) as PricingProduct[],
        ingredients: (ingRes.data || []) as PricingIngredient[],
        productIngredients: (piRes.data || []) as PricingProductIngredient[],
        comboComponents: (comboRes.data || []) as PricingComboComponent[],
        extraCosts: (ecRes.data || []) as PricingExtraCost[],
      }).map((row) => ({
        id: row.id,
        name: row.name,
        categoryId: row.categoryId,
        categoryName: row.categoryName,
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

  const filteredRows = useMemo(() => {
    const q = normalizeSearch(search);
    return rows.filter((r) => {
      const matchesSearch = !q || normalizeSearch(r.name).includes(q);
      const matchesCategory = categoryFilter === "all" || r.categoryId === categoryFilter;
      const matchesMargin =
        marginFilter === "all" ||
        (marginFilter === "negative" && r.margin < 0) ||
        (marginFilter === "low" && r.margin >= 0 && r.margin < 30) ||
        (marginFilter === "good" && r.margin >= 30);
      return matchesSearch && matchesCategory && matchesMargin;
    });
  }, [rows, search, categoryFilter, marginFilter]);

  const groupedRows = useMemo(() => {
    return filteredRows.reduce<Record<string, ProfitRow[]>>((groups, row) => {
      const key = row.categoryName || "Sem categoria";
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
      return groups;
    }, {});
  }, [filteredRows]);

  const marginColor = (m: number) => {
    if (m < 0) return "text-destructive font-bold";
    if (m < 30) return "text-foreground font-semibold";
    return "text-primary font-semibold";
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="relative sm:col-span-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar produto"
            className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-3 text-sm"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
        >
          <option value="all">Todas as categorias</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={marginFilter}
          onChange={(e) => setMarginFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
        >
          <option value="all">Todas as margens</option>
          <option value="negative">Margem negativa</option>
          <option value="low">Margem abaixo de 30%</option>
          <option value="good">Margem acima de 30%</option>
        </select>
      </div>

      <p className="text-xs text-muted-foreground">{filteredRows.length} de {rows.length} produtos</p>

      {filteredRows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          {rows.length === 0
            ? "Cadastre ingredientes e vincule-os aos produtos para ver o dashboard de lucro."
            : "Nenhum produto encontrado com os filtros aplicados."}
        </p>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedRows).map(([categoryName, catRows]) => (
            <div key={categoryName} className="rounded-xl border border-border bg-card">
              <div className="border-b border-border bg-muted/30 px-4 py-2">
                <h3 className="text-sm font-semibold text-foreground">{categoryName}</h3>
              </div>
              <div className="space-y-3 p-3 lg:hidden">
                {catRows.map((r) => (
                  <article key={r.id} className="rounded-xl border border-border bg-background p-3">
                    <p className="break-words text-sm font-semibold text-foreground">{r.name}</p>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                      <div className="rounded-lg border border-border p-2"><p className="text-muted-foreground">Venda</p><p className="font-semibold text-foreground">{formatCurrency(r.price)}</p></div>
                      <div className="rounded-lg border border-border p-2"><p className="text-muted-foreground">Ingred.</p><p className="text-foreground">{formatCurrency(r.ingredientCost)}</p></div>
                      <div className="rounded-lg border border-border p-2"><p className="text-muted-foreground">Direto</p><p className="text-foreground">{formatCurrency(r.manualCost)}</p></div>
                      <div className="rounded-lg border border-border p-2"><p className="text-muted-foreground">Extras</p><p className="text-foreground">{formatCurrency(r.extraCost)}</p></div>
                      <div className="rounded-lg border border-border p-2"><p className="text-muted-foreground">Custo</p><p className="text-foreground">{formatCurrency(r.totalCost)}</p></div>
                      <div className="rounded-lg border border-border p-2"><p className="text-muted-foreground">Lucro</p><p className={marginColor(r.margin)}>{formatCurrency(r.profit)}</p></div>
                      <div className="rounded-lg border border-border p-2"><p className="text-muted-foreground">Margem</p><p className={marginColor(r.margin)}>{r.margin.toFixed(1)}%</p></div>
                    </div>
                  </article>
                ))}
              </div>

              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="py-2 pl-4 pr-2 font-medium text-muted-foreground">Produto</th>
                      <th className="py-2 px-2 font-medium text-muted-foreground text-right whitespace-nowrap">Venda</th>
                      <th className="py-2 px-2 font-medium text-muted-foreground text-right whitespace-nowrap">Ingred.</th>
                      <th className="py-2 px-2 font-medium text-muted-foreground text-right whitespace-nowrap">Direto</th>
                      <th className="py-2 px-2 font-medium text-muted-foreground text-right whitespace-nowrap">Extras</th>
                      <th className="py-2 px-2 font-medium text-muted-foreground text-right whitespace-nowrap">Custo</th>
                      <th className="py-2 px-2 font-medium text-muted-foreground text-right whitespace-nowrap">Lucro</th>
                      <th className="py-2 pl-2 pr-4 font-medium text-muted-foreground text-right whitespace-nowrap">Margem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catRows.map((r) => (
                      <tr key={r.id} className="border-b border-border/50">
                        <td className="max-w-[260px] break-words py-2 pl-4 pr-2 font-medium text-foreground">{r.name}</td>
                        <td className="py-2 px-2 text-right whitespace-nowrap text-foreground">{formatCurrency(r.price)}</td>
                        <td className="py-2 px-2 text-right whitespace-nowrap text-muted-foreground">{formatCurrency(r.ingredientCost)}</td>
                        <td className="py-2 px-2 text-right whitespace-nowrap text-muted-foreground">{formatCurrency(r.manualCost)}</td>
                        <td className="py-2 px-2 text-right whitespace-nowrap text-muted-foreground">{formatCurrency(r.extraCost)}</td>
                        <td className="py-2 px-2 text-right whitespace-nowrap text-foreground">{formatCurrency(r.totalCost)}</td>
                        <td className={`py-2 px-2 text-right whitespace-nowrap ${marginColor(r.margin)}`}>{formatCurrency(r.profit)}</td>
                        <td className={`py-2 pl-2 pr-4 text-right whitespace-nowrap ${marginColor(r.margin)}`}>{r.margin.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProfitDashboard;
