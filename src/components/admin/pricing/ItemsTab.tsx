import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/contexts/StoreContext";
import ItemsCategoryTable from "./ItemsCategoryTable";
import type { ProductRecipeEditorChange } from "./ProductRecipeEditor";
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
  const [products, setProducts] = useState<PricingProduct[]>([]);
  const [ingredients, setIngredients] = useState<PricingIngredient[]>([]);
  const [productIngredients, setProductIngredients] = useState<PricingProductIngredient[]>([]);
  const [extraCosts, setExtraCosts] = useState<PricingExtraCost[]>([]);
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
      .select("id, name, price, manual_cost, category_id, active, sort_order")
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

    setCategories((categoriesRes.data || []) as PricingCategory[]);
    setProducts((productsRes.data || []) as PricingProduct[]);
    setIngredients((ingredientsRes.data || []) as PricingIngredient[]);
    setProductIngredients((productIngredientsRes.data || []) as PricingProductIngredient[]);
    setExtraCosts((extraCostsRes.data || []) as PricingExtraCost[]);
    setLoading(false);
  };

  useEffect(() => {
    void fetchData();
  }, [storeId]);

  const rows = useMemo(
    () =>
      buildProductCostRows({
        categories,
        products,
        ingredients,
        productIngredients,
        extraCosts,
      }),
    [categories, extraCosts, ingredients, productIngredients, products],
  );

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

  const lowMarginCount = useMemo(() => filteredRows.filter((row) => row.margin < 30).length, [filteredRows]);
  const withoutCostCount = useMemo(() => filteredRows.filter((row) => row.totalCost <= 0).length, [filteredRows]);

  const handleRecipeChange = ({ productId, manualCost, lines }: ProductRecipeEditorChange) => {
    setProducts((current) =>
      current.map((product) => (product.id === productId ? { ...product, manual_cost: manualCost } : product)),
    );
    setProductIngredients((current) => [
      ...current.filter((line) => line.product_id !== productId),
      ...lines.map((line) => ({ ...line, product_id: productId })),
    ]);
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{filteredRows.length} de {rows.length} itens do cardápio</p>
            <p className="text-xs text-muted-foreground">Edite ficha técnica e custo direto sem perder a posição da tela.</p>
          </div>
          <button
            onClick={() => void fetchData()}
            className="flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Atualizar lista
          </button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-background px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Itens visíveis</p>
            <p className="text-lg font-semibold text-foreground">{filteredRows.length}</p>
          </div>
          <div className="rounded-lg border border-border bg-background px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Margem abaixo de 30%</p>
            <p className="text-lg font-semibold text-foreground">{lowMarginCount}</p>
          </div>
          <div className="rounded-lg border border-border bg-background px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Sem custo calculado</p>
            <p className="text-lg font-semibold text-foreground">{withoutCostCount}</p>
          </div>
        </div>
      </div>

      <div className="sticky top-0 z-10 grid gap-2 rounded-xl border border-border bg-background/95 p-3 backdrop-blur lg:grid-cols-[minmax(0,1fr)_220px_220px]">
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
            <ItemsCategoryTable
              key={categoryName}
              categoryName={categoryName}
              rows={categoryRows as ProductCostRow[]}
              expandedId={expandedId}
              onToggleExpanded={(id) => setExpandedId((current) => (current === id ? null : id))}
              onRecipeChange={handleRecipeChange}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default ItemsTab;