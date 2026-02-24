import { useRef } from "react";
import { MapPin, ChevronRight } from "lucide-react";
import logo from "@/assets/logo-turbo.jpeg";
import heroBanner from "@/assets/hero-banner.jpg";
import { categories, products } from "@/data/menu";
import ProductCard from "@/components/ProductCard";
import CartFloatingButton from "@/components/CartFloatingButton";
import BottomNav from "@/components/BottomNav";

const Index = () => {
  const menuRef = useRef<HTMLDivElement>(null);

  const scrollToCategory = (categoryId: string) => {
    const el = document.getElementById(`cat-${categoryId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-background pb-36">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md px-4 py-3">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-primary" />
            <span className="text-xs text-muted-foreground">Entregar em</span>
            <span className="text-xs font-semibold text-foreground">Rua Example, 123</span>
            <ChevronRight size={14} className="text-muted-foreground" />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-md px-4">
        {/* Logo */}
        <div className="flex justify-center py-2">
          <img src={logo} alt="Turbo Lanches" className="h-20 w-auto rounded-xl" />
        </div>

        {/* Hero Banner */}
        <div className="relative mt-2 overflow-hidden rounded-xl">
          <img
            src={heroBanner}
            alt="Promoção do dia"
            className="h-40 w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background/90 to-transparent" />
          <div className="absolute bottom-3 left-4">
            <span className="rounded-full bg-fire-gradient px-3 py-1 text-xs font-bold text-primary-foreground shadow-fire">
              🔥 PROMOÇÃO DO DIA
            </span>
            <p className="mt-1 text-sm font-bold text-foreground">
              Turbo Smash por R$ 32,90
            </p>
          </div>
        </div>

        {/* Categories */}
        <div className="mt-5">
          <h2 className="text-2xl text-fire-gradient">CATEGORIAS</h2>
          <div className="mt-3 flex gap-3 overflow-x-auto scrollbar-hide pb-2">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => scrollToCategory(cat.id)}
                className="flex flex-shrink-0 flex-col items-center gap-1.5 transition-transform active:scale-95"
              >
                <div className="h-16 w-16 overflow-hidden rounded-full border-2 border-primary/30">
                  <img src={cat.image} alt={cat.name} className="h-full w-full object-cover" />
                </div>
                <span className="text-xs font-medium text-foreground">{cat.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Menu sections */}
        <div ref={menuRef} className="mt-6 space-y-6">
          {categories.map((cat) => {
            const catProducts = products.filter((p) => p.category === cat.id);
            if (catProducts.length === 0) return null;
            return (
              <section key={cat.id} id={`cat-${cat.id}`}>
                <h2 className="text-2xl text-fire-gradient">
                  {cat.icon} {cat.name.toUpperCase()}
                </h2>
                <div className="mt-3 space-y-3">
                  {catProducts.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <CartFloatingButton />
      <BottomNav />
    </div>
  );
};

export default Index;
