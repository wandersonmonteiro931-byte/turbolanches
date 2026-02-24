import { useRef, useState, useEffect } from "react";
import { ChevronDown, Bell, Heart } from "lucide-react";
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
          if (data?.full_name) {
            setUserName(data.full_name.split(" ")[0]);
          }
        });
    }
  }, [user]);

  const scrollToCategory = (categoryId: string) => {
    const el = document.getElementById(`cat-${categoryId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-background pb-36">
      {/* Hero Banner - Full width */}
      <div className="relative w-full">
        <div className="relative h-52 w-full overflow-hidden">
          <img
            src={heroBanner}
            alt="Promoção Turbo Lanches"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />
          <div className="absolute bottom-4 left-4 right-4">
            <span className="rounded-full bg-fire-gradient px-4 py-1.5 text-xs font-bold text-primary-foreground shadow-fire">
              🔥 PROMOÇÃO DO DIA
            </span>
            <p className="mt-2 text-base font-bold text-foreground drop-shadow-lg">
              Turbo Smash por R$ 32,90
            </p>
          </div>
        </div>
      </div>

      {/* Content with rounded top */}
      <div className="relative -mt-4 rounded-t-3xl bg-background pt-5">
        <div className="mx-auto max-w-md px-4">
          {/* Address bar + Notification */}
          <div className="flex items-center justify-between">
            <button className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-foreground">Rua Example, 123</span>
              <ChevronDown size={16} className="text-muted-foreground" />
            </button>
            <button className="relative rounded-full p-2">
              <Bell size={22} className="text-foreground" />
              <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                3
              </span>
            </button>
          </div>

          {/* Greeting + Coupons */}
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={logo} alt="Turbo Lanches" className="h-10 w-10 rounded-full" />
              <p className="text-base font-semibold text-foreground">
                Olá{userName ? `, ${userName}` : ""}! 👋
              </p>
            </div>
            <button className="flex items-center gap-1.5 rounded-full border border-primary/40 px-3 py-1.5 transition-colors active:bg-primary/10">
              <Heart size={14} className="fill-primary text-primary" />
              <span className="text-xs font-semibold text-primary">Cupons</span>
            </button>
          </div>

          {/* Category Grid - 2 rows x N cols, iFood style */}
          <div className="mt-6">
            <div className="grid grid-cols-4 gap-3">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => scrollToCategory(cat.id)}
                  className="flex flex-col items-center gap-2 rounded-xl bg-card p-3 transition-all active:scale-95"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-fire-gradient-soft">
                    <span className="text-2xl">{cat.icon}</span>
                  </div>
                  <span className="text-[11px] font-medium text-foreground leading-tight text-center">
                    {cat.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Promo Banner Carousel */}
          <div className="mt-6 overflow-hidden rounded-2xl">
            <div className="relative">
              <img
                src={heroBanner}
                alt="Promoção especial"
                className="h-44 w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-accent/90 to-primary/80" />
              <div className="absolute inset-0 flex flex-col items-start justify-center px-5">
                <span className="text-xs font-bold uppercase tracking-wider text-primary-foreground/80">
                  Oferta especial
                </span>
                <h3 className="mt-1 text-2xl font-bold text-primary-foreground" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                  COMBO FAMÍLIA
                </h3>
                <p className="text-sm text-primary-foreground/90">
                  a partir de{" "}
                  <span className="text-2xl font-extrabold text-primary-foreground">
                    R$ 79,90
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* Dots indicator */}
          <div className="mt-3 flex items-center justify-center gap-1.5">
            <div className="h-1.5 w-6 rounded-full bg-primary" />
            <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
            <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
          </div>

          {/* Menu sections */}
          <div ref={menuRef} className="mt-8 space-y-8">
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
      </div>

      <CartFloatingButton />
      <BottomNav />
    </div>
  );
};

export default Index;
