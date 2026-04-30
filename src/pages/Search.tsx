import { useState, useMemo } from "react";
import { Search as SearchIcon, X, Flame, Star, Tag } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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
      <header className="sticky top-0 z-30 bg-background/90 px-4 pt-4 pb-2 backdrop-blur-md">
        <div className="mx-auto max-w-md space-y-3">
          {/* Search input */}
          <motion.div
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="flex items-center gap-2 rounded-xl bg-card px-4 py-2.5 ring-1 ring-border focus-within:ring-primary transition-all"
          >
            <SearchIcon size={18} className="text-muted-foreground shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome ou código (ex: 201)..."
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              autoFocus
            />
            <AnimatePresence>
              {query.length > 0 && (
                <motion.button
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  onClick={() => setQuery("")}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X size={16} />
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Quick filters */}
          <motion.div
            initial={{ y: -5, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="flex gap-2 overflow-x-auto no-scrollbar"
          >
            {quickFilters.map((f) => {
              const Icon = f.icon;
              const isActive = activeFilter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setActiveFilter(isActive ? null : f.key)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "bg-card text-muted-foreground border border-border hover:border-primary/40"
                  }`}
                >
                  <Icon size={13} />
                  {f.label}
                </button>
              );
            })}

            {/* Category chips */}
            {categories.map((cat) => {
              const isActive = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(isActive ? null : cat.id)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "bg-card text-muted-foreground border border-border hover:border-primary/40"
                  }`}
                >
                  {cat.icon && <span className="text-sm">{cat.icon}</span>}
                  {cat.name}
                </button>
              );
            })}
          </motion.div>

          {/* Active filter summary */}
          <AnimatePresence>
            {hasActiveFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="flex items-center justify-between"
              >
                <p className="text-xs text-muted-foreground">
                  {filtered.length} {filtered.length === 1 ? "resultado" : "resultados"}
                </p>
                <button
                  onClick={clearAll}
                  className="text-xs text-primary font-semibold"
                >
                  Limpar filtros
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* Results */}
      <div className="mx-auto max-w-md px-4 mt-2 space-y-3">
        <AnimatePresence mode="wait">
          {hasActiveFilters && filtered.length === 0 && (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col items-center py-16"
            >
              <motion.div
                animate={{ rotate: [0, -10, 10, -10, 0] }}
                transition={{ repeat: Infinity, duration: 2, repeatDelay: 3 }}
                className="text-5xl mb-4"
              >
                🔍
              </motion.div>
              <p className="text-sm text-muted-foreground text-center">
                Nenhum resultado encontrado
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Tente buscar por outro nome ou categoria
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Show all products when no filter, or filtered results */}
        {(hasActiveFilters ? filtered : []).map((product, i) => (
          <motion.div
            key={product.id}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
          >
            <ProductCard product={product} index={i} storeIsOpen={storeIsOpen} />
          </motion.div>
        ))}

        {/* Suggestion when no search */}
        {!hasActiveFilters && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center py-16"
          >
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="text-5xl mb-4"
            >
              🍔
            </motion.div>
            <p className="text-sm text-muted-foreground text-center">
              Busque pelo nome do produto ou use os filtros acima
            </p>
          </motion.div>
        )}
      </div>

      <CartFloatingButton />
      <BottomNav />
    </div>
  );
};

export default Search;
