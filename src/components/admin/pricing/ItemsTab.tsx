import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/contexts/StoreContext";
import ProductRecipeEditor from "./ProductRecipeEditor";
import { formatCurrency } from "./pricingMoney";
import {
  buildProductCostRows,
  type PricingCategory,
  type PricingExtraCost,
  type PricingIngredient,
  type PricingProduct,
  type PricingProductIngredient,
  type ProductCostRow,
} from "./productCosting";

const ItemsTab = () => {
  const { storeId } = useStore();
  const [categories, setCategories] = useState<PricingCategory[]>([]);
  const [rows, setRows] = useState<ProductCostRow[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);

    let categoriesQuery = supabase.from("categories").select("id, name, sort_order").order("sort_order").order("name");
    let productsQuery = supabase
      .from("products")
      .select("id, name, price, category_id, active, sort_order")
      .order("sort_order")
      .order("name");
    let ingredientsQuery = supabase.from("ingredients").select("id, cost_per_unit");
    let productIngredientsQuery = supabase.from("product_ingredients").select("id, product_id, ingredient_id, quantity");
    let extraCostsQuery = supabase.from("extra_costs").select("cost_type, value");

    if (storeId) {
      categoriesQuery = categoriesQuery.eq("store_id", storeId);
      productsQuery = productsQuery.eq("store_id", storeId);
      ingredientsQuery = ingredientsQuery.eq("store_id", storeId);
      productIngredientsQuery = productIngredientsQuery.eq("store_id", storeId);
      extraCostsQuery = extraCostsQuery.eq("store_id", storeId);
    }

    const [categoriesRes, productsRes, ingredientsRes, productIngredientsRes, extraCostsRes] = await Promise.all([
      categoriesQuery,
      productsQuery,
      ingredientsQuery,
      productIngredientsQuery,
      extraCostsQuery,
    ]);

    const nextCategories = (categoriesRes.data || []) as PricingCategory[];
    const nextRows = buildProductCostRows({
      categories: nextCategories,
      products: (productsRes.data || []) as PricingProduct[],
      ingredients: (ingredientsRes.data || []) as PricingIngredient[],
      productIngredients: (productIngredientsRes.data || []) as PricingProductIngredient[],
      extraCosts: (extraCostsRes.data || []) as PricingExtraCost[],
    });

    setCategories(nextCategories);
    setRows(nextRows);
    setLoading(false);
  };

  useEffect(() => {
    void fetchData();
  }, [storeId]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesSearch =
        !normalizedSearch ||
        row.name.toLowerCase().includes(normalizedSearch) ||
        row.categoryName.toLowerCase().includes(normalizedSearch);
      const matchesCategory = categoryFilter === "all" || row.categoryId === categoryFilter;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && row.active) ||
        (statusFilter === "inactive" && !row.active) ||
        (statusFilter === "with-cost" && row.totalCost > 0) ||
        (statusFilter === "without-cost" && row.totalCost <= 0);

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [categoryFilter, rows, search, statusFilter]);

  const groupedRows = useMemo(() => {
    return filteredRows.reduce<Record<string, ProductCostRow[]>>((groups, row) => {
      if (!groups[row.categoryName]) groups[row.categoryName] = [];
      groups[row.categoryName].push(row);
      return groups;
    }, {});
  }, [filteredRows]);

  const categoryOptions = useMemo(
    () => categories.map((category) => ({ id: category.id, name: category.name })),
    [categories],
  );

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{filteredRows.length} de {rows.length} itens do cardápio</p>
          <p className="text-xs text-muted-foreground">Edite a ficha técnica e o custo salva automaticamente, inclusive para bebidas.</p>
        </div>
        <button
          onClick={() => void fetchData()}
          className="flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Atualizar
        </button>
      </div>

      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Pesquisar item ou categoria"
            className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-3 text-sm"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
        >
          <option value="all">Todas as categorias</option>
          {categoryOptions.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
        >
          <option value="all">Todos os filtros</option>
          <option value="active">Somente ativos</option>
          <option value="inactive">Somente ocultos</option>
          <option value="with-cost">Com custo calculado</option>
          <option value="without-cost">Sem custo calculado</option>
        </select>
      </div>

      {loading ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Carregando itens...
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Nenhum item encontrado.
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedRows).map(([categoryName, categoryRows]) => (
            <section key={categoryName} className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="border-b border-border bg-muted/30 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{categoryName}</h3>
                    <p className="text-xs text-muted-foreground">{categoryRows.length} item(ns)</p>
                  </div>
                </div>
              </div>

              <div className="overflow-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="py-3 pl-4 pr-2 font-medium text-muted-foreground">Item</th>
                      <th className="px-2 py-3 text-right font-medium text-muted-foreground">Venda</th>
                      <th className="px-2 py-3 text-right font-medium text-muted-foreground">Ingredientes</th>
                      <th className="px-2 py-3 text-right font-medium text-muted-foreground">Extras</th>
                      <th className="px-2 py-3 text-right font-medium text-muted-foreground">Custo total</th>
                      <th className="px-2 py-3 text-right font-medium text-muted-foreground">Lucro</th>
                      <th className="px-2 py-3 text-right font-medium text-muted-foreground">Margem</th>
                      <th className="py-3 pl-2 pr-4 text-right font-medium text-muted-foreground">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryRows.map((row) => {
                      const isExpanded = expandedId === row.id;
                      const emphasisClass = row.totalCost <= 0 ? "text-destructive" : "text-foreground";

                      return (
                        <>
                          <tr key={row.id} className="border-b border-border/50 align-top last:border-b-0">
                            <td className="py-3 pl-4 pr-2">
                              <div className="space-y-1">
                                <p className="font-medium text-foreground">{row.name}</p>
                                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                  <span>{row.active ? "Ativo" : "Oculto"}</span>
                                  <span>•</span>
                                  <span>{row.ingredientCount} ingrediente(s)</span>
                                </div>
                              </div>
                            </td>
                            <td className="px-2 py-3 text-right text-foreground">{formatCurrency(row.price)}</td>
                            <td className={`px-2 py-3 text-right ${emphasisClass}`}>{formatCurrency(row.ingredientCost)}</td>
                            <td className="px-2 py-3 text-right text-muted-foreground">{formatCurrency(row.extraCost)}</td>
                            <td className={`px-2 py-3 text-right font-medium ${emphasisClass}`}>{formatCurrency(row.totalCost)}</td>
                            <td className={`px-2 py-3 text-right ${row.profit < 0 ? "text-destructive" : "text-foreground"}`}>
                              {formatCurrency(row.profit)}
                            </td>
                            <td className={`px-2 py-3 text-right ${row.margin < 30 ? "text-destructive" : "text-primary"}`}>
                              {row.margin.toFixed(1)}%
                            </td>
                            <td className="py-3 pl-2 pr-4 text-right">
                              <button
                                onClick={() => setExpandedId(isExpanded ? null : row.id)}
                                className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground"
                              >
                                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                Editar
                              </button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr key={`${row.id}-editor`} className="border-b border-border/50 bg-muted/10 last:border-b-0">
                              <td colSpan={8} className="p-4">
                                <ProductRecipeEditor productId={row.id} onChange={() => void fetchData()} />
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

export default ItemsTab;