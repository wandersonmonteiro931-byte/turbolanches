import { useRef, useEffect, useState } from "react";
import { ChevronDown, Bell } from "lucide-react";
import logo from "@/assets/logo-turbo.jpeg";
import heroBanner from "@/assets/hero-banner.jpg";
import { categories, products } from "@/data/menu";
import { useAuth } from "@/contexts/AuthContext";
import ProductCard from "@/components/ProductCard";
import CartFloatingButton from "@/components/CartFloatingButton";
import BottomNav from "@/components/BottomNav";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const menuRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const [userName, setUserName] = useState("");

  useEffect(() => {
    if (user) {
      supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", user.id)
        .single()
        .then(({ data }) => {
          if (data?.full_name) setUserName(data.full_name.split(" ")[0]);
        });
    }
  }, [user]);

  const scrollToCategory = (categoryId: string) => {
    const el = document.getElementById(`cat-${categoryId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Hero Banner */}
      <div className="relative w-full">
        <div className="relative h-48 w-full overflow-hidden bg-primary">
          <img
            src={heroBanner}
            alt="Promoção Turbo Lanches"
            className="h-full w-full object-cover opacity-90"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-primary/60 via-primary/30 to-transparent" />
          <div className="absolute bottom-6 left-4 right-4">
            <span className="rounded-full bg-card px-3 py-1 text-xs font-bold text-primary shadow-sm">
              🔥 PROMOÇÃO DO DIA
            </span>
            <p className="mt-2 text-sm font-bold text-primary-foreground drop-shadow-md">
              Turbo Smash por R$ 32,90
            </p>
          </div>
        </div>
      </div>

      {/* Content area */}
      <div className="relative -mt-5 rounded-t-3xl bg-card pt-5 shadow-sm">
        <div className="mx-auto max-w-md px-4">
          {/* Address + Bell */}
          <div className="flex items-center justify-between">
            <button className="flex items-center gap-1">
              <span className="text-sm font-semibold text-foreground">R. Example, 123</span>
              <ChevronDown size={16} className="text-muted-foreground" />
            </button>
            <button className="relative p-2">
              <Bell size={22} className="text-foreground" />
              <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                5
              </span>
            </button>
          </div>

          {/* Greeting + Coupons */}
          <div className="mt-3 flex items-center justify-between">
            <p className="text-base font-bold text-foreground">
              Olá{userName ? `, ${userName}` : ""}
            </p>
            <button className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5">
              <span className="text-xs font-bold text-primary">💜 Cupons até R$ 10</span>
            </button>
          </div>

          {/* Category Grid */}
          <div className="mt-5 grid grid-cols-4 gap-2.5">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => scrollToCategory(cat.id)}
                className="flex flex-col items-center gap-2 rounded-2xl bg-background p-3 shadow-sm transition-all active:scale-95"
              >
                <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl">
                  <img
                    src={cat.image}
                    alt={cat.name}
                    className="h-full w-full object-cover"
                  />
                </div>
                <span className="text-[11px] font-semibold text-foreground leading-tight text-center">
                  {cat.name}
                </span>
              </button>
            ))}
          </div>

          {/* Promo Banner */}
          <div className="mt-5 overflow-hidden rounded-2xl shadow-sm">
            <div className="relative h-40">
              <img
                src={heroBanner}
                alt="Combo Família"
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-primary/90 via-primary/75 to-primary/50" />
              <div className="absolute inset-0 flex flex-col justify-center px-5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-primary-foreground/70">
                  Oferta especial
                </span>
                <h3 className="mt-0.5 text-xl font-extrabold text-primary-foreground">
                  COMBO FAMÍLIA
                </h3>
                <p className="mt-1 text-primary-foreground/90">
                  <span className="text-xs">a partir de </span>
                  <span className="text-xl font-extrabold text-primary-foreground">R$ 79,90</span>
                </p>
              </div>
            </div>
          </div>

          {/* Dots */}
          <div className="mt-2.5 flex items-center justify-center gap-1.5">
            <div className="h-1.5 w-6 rounded-full bg-primary" />
            <div className="h-1.5 w-1.5 rounded-full bg-border" />
            <div className="h-1.5 w-1.5 rounded-full bg-border" />
          </div>

          {/* Menu Sections */}
          <div ref={menuRef} className="mt-7 space-y-7">
            {categories.map((cat) => {
              const catProducts = products.filter((p) => p.category === cat.id);
              if (catProducts.length === 0) return null;
              return (
                <section key={cat.id} id={`cat-${cat.id}`}>
                  <h2 className="text-xl font-extrabold text-foreground">
                    {cat.icon} {cat.name}
                  </h2>
                  <div className="mt-3 space-y-2.5">
                    {catProducts.map((product) => (
                      <ProductCard key={product.id} product={product} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>

      <CartFloatingButton />
      <BottomNav />
    </div>
  );
};

export default Index;
