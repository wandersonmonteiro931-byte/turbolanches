import { useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useProducts } from "@/hooks/useMenu";
import { useStoreStatus } from "@/hooks/useStoreStatus";
import ProductCard from "@/components/ProductCard";
import BottomNav from "@/components/BottomNav";
import CartFloatingButton from "@/components/CartFloatingButton";

const Search = () => {
  const [query, setQuery] = useState("");
  const { products } = useProducts();
  const { isOpen: storeIsOpen } = useStoreStatus();

  const filtered = query.length >= 2
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(query.toLowerCase()) ||
          p.description.toLowerCase().includes(query.toLowerCase())
      )
    : [];

  return (
    <div className="min-h-screen bg-background pb-36">
      <header className="sticky top-0 z-30 bg-background/90 px-4 py-4 backdrop-blur-md">
        <div className="mx-auto max-w-md">
          <motion.div
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="flex items-center gap-2 rounded-xl bg-card px-4 py-2.5"
          >
            <SearchIcon size={18} className="text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar no cardápio..."
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              autoFocus
            />
          </motion.div>
        </div>
      </header>

      <div className="mx-auto max-w-md px-4 mt-4 space-y-3">
        <AnimatePresence mode="wait">
          {query.length >= 2 && filtered.length === 0 && (
            <motion.p
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center text-sm text-muted-foreground py-12"
            >
              Nenhum resultado para "{query}"
            </motion.p>
          )}
        </AnimatePresence>
        {filtered.map((product, i) => (
          <ProductCard key={product.id} product={product} index={i} storeIsOpen={storeIsOpen} />
        ))}
      </div>

      <CartFloatingButton />
      <BottomNav />
    </div>
  );
};

export default Search;
