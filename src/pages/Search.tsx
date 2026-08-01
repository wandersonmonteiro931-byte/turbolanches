import { useState, useMemo } from "react";
import { Search as SearchIcon, X, Flame, Tag } from "lucide-react";

import { useProducts, useCategories } from "@/hooks/useMenu";
import { useStoreStatus } from "@/hooks/useStoreStatus";
import ProductCard from "@/components/ProductCard";
import BottomNav from "@/components/BottomNav";
import CartFloatingButton from "@/components/CartFloatingButton";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { normalizeSearch } from "@/lib/searchNormalize";

const quickFilters = [
  { key: "popular", label: "Populares", icon: Flame },
  { key: "promo", label: "Promoções", icon: Tag },
] as const;

type QuickFilter = (typeof quickFilters)[number]["key"] | null;

const Search = () => {
  useScrollRestoration("search");
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<QuickFilter>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const { products } = useProducts();
  const { categories } = useCategories();
  const { isOpen: storeIsOpen } = useStoreStatus();

  const filtered = useMemo(() => {
    let result = products.filter((p) => p.active !== false);

    // Text search (matches name, description, or product code)
    if (query.trim().length >= 1) {
      const q = normalizeSearch(query).trim();
      result = result.filter(
        (p) =>
          normalizeSearch(p.name).includes(q) ||
          normalizeSearch(p.description).includes(q) ||
          (p.code != null && String(p.code).includes(q))
      );
    }

    // Category filter
    if (selectedCategory) {
      result = result.filter((p) => p.category === selectedCategory);
    }

    // Quick filters
    if (activeFilter === "popular") {
      result = result.filter((p) => p.popular);
    } else if (activeFilter === "promo") {
      result = result.filter((p) => p.originalPrice && p.originalPrice > p.price);
    }

    return result;
  }, [products, query, selectedCategory, activeFilter]);

  const hasActiveFilters = query.trim().length >= 1 || activeFilter || selectedCategory;

  const clearAll = () => {
    setQuery("");
    setActiveFilter(null);
    setSelectedCategory(null);
  };

  return (
    <div className="min-h-screen bg-background pb-36">
      {/* Search header */}
      <header className="sticky top-0 z-30 bg-background/95 px-4 pt-4 pb-3 backdrop-blur-md">
        <div className="mx-auto max-w-md space-y-3">
          {/* Search input */}
          <div className="flex items-center gap-2.5 rounded-full bg-muted/60 px-4 py-3 transition-colors focus-within:bg-muted">
            <SearchIcon size={19} className="text-muted-foreground shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar no cardápio"
              className="flex-1 bg-transparent text-base text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
              autoFocus
            />
            {query.length > 0 && (
              <button
                onClick={() => setQuery("")}
                aria-label="Limpar busca"
                className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Filtros rápidos + categorias */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {quickFilters.map((f) => {
              const Icon = f.icon;
              const isActive = activeFilter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setActiveFilter(isActive ? null : f.key)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Icon size={13} />
                  {f.label}
                </button>
              );
            })}

            {categories.map((cat) => {
              const isActive = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(isActive ? null : cat.id)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {cat.icon && <span className="text-sm">{cat.icon}</span>}
                  {cat.name}
                </button>
              );
            })}
          </div>

          {/* Resumo dos filtros ativos */}
          {hasActiveFilters && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {filtered.length} {filtered.length === 1 ? "resultado" : "resultados"}
              </p>
              <button
                onClick={clearAll}
                className="text-xs font-semibold text-primary"
              >
                Limpar
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Results */}
      <div className="mx-auto max-w-md px-4 mt-1 space-y-3">
        {hasActiveFilters && filtered.length === 0 && (
          <div className="flex flex-col items-center py-16">
            <div className="mb-4 text-4xl opacity-70">🔍</div>
            <p className="text-sm text-muted-foreground text-center">
              Nada encontrado por aqui
            </p>
            <p className="mt-1 text-xs text-muted-foreground/60">
              Tente outro nome ou toque em uma categoria
            </p>
          </div>
        )}

        {(hasActiveFilters ? filtered : []).map((product, i) => (
          <ProductCard
            key={product.id}
            product={product}
            index={i}
            storeIsOpen={storeIsOpen}
          />
        ))}

        {/* Estado inicial */}
        {!hasActiveFilters && (
          <div className="flex flex-col items-center py-14">
            <div className="mb-3 text-4xl opacity-70">🍔</div>
            <p className="max-w-[15rem] text-center text-sm text-muted-foreground">
              Digite o nome do produto ou escolha uma categoria acima
            </p>
          </div>
        )}
      </div>


      <CartFloatingButton />
      <BottomNav />
    </div>
  );
};

export default Search;
