import { useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import { products } from "@/data/menu";
import ProductCard from "@/components/ProductCard";
import BottomNav from "@/components/BottomNav";
import CartFloatingButton from "@/components/CartFloatingButton";

const Search = () => {
  const [query, setQuery] = useState("");

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
          <div className="flex items-center gap-2 rounded-xl bg-card px-4 py-2.5">
            <SearchIcon size={18} className="text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar no cardápio..."
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              autoFocus
            />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-md px-4 mt-4 space-y-3">
        {query.length >= 2 && filtered.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-12">Nenhum resultado para "{query}"</p>
        )}
        {filtered.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>

      <CartFloatingButton />
      <BottomNav />
    </div>
  );
};

export default Search;
