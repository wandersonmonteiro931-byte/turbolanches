import { useRef, useEffect, useState } from "react";
import { ChevronDown, Bell } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import heroBanner from "@/assets/hero-banner.jpg";
import { useCategories, useProducts } from "@/hooks/useMenu";
import { useAuth } from "@/contexts/AuthContext";
import ProductCard from "@/components/ProductCard";
import CartFloatingButton from "@/components/CartFloatingButton";
import BottomNav from "@/components/BottomNav";
import StoreHours from "@/components/StoreHours";
import { supabase } from "@/integrations/supabase/client";
import { useStoreStatus } from "@/hooks/useStoreStatus";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.4, ease: "easeOut" as const },
  }),
};

const stagger = {
  visible: { transition: { staggerChildren: 0.06 } },
};

const Index = () => {
  const menuRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const { isOpen: storeIsOpen } = useStoreStatus();
  const { categories, loading: catLoading } = useCategories();
  const { products, loading: prodLoading } = useProducts();
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
      {/* Store Status Banner */}
      {!storeIsOpen ? (
        <div className="bg-destructive px-4 py-3 text-center">
          <p className="text-sm font-bold text-destructive-foreground">🔴 ESTAMOS FECHADOS NO MOMENTO</p>
          <div className="flex items-center justify-center gap-2 mt-1">
            <StoreHours />
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 bg-card border-b border-border px-4 py-1.5">
          <span className="text-[11px] text-muted-foreground">🟢 Aberto agora</span>
          <StoreHours />
        </div>
      )}

      {/* Hero Banner */}
      <motion.div
        initial={{ opacity: 0, scale: 1.05 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative w-full"
      >
        <div className="relative h-48 w-full overflow-hidden bg-primary">
          <img
            src={heroBanner}
            alt="Promoção Turbo Lanches"
            className="h-full w-full object-cover opacity-90"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-primary/60 via-primary/30 to-transparent" />
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="absolute bottom-6 left-4 right-4"
          >
            <motion.span
              whileHover={{ scale: 1.05 }}
              className="inline-block rounded-full bg-card px-3 py-1 text-xs font-bold text-primary shadow-sm"
            >
              🔥 PROMOÇÃO DO DIA
            </motion.span>
            <p className="mt-2 text-sm font-bold text-primary-foreground drop-shadow-md">
              Turbo Smash por R$ 32,90
            </p>
          </motion.div>
        </div>
      </motion.div>

      {/* Content area */}
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.15 }}
        className="relative -mt-5 rounded-t-3xl bg-card pt-5 shadow-sm"
      >
        <div className="mx-auto max-w-md px-4">
          {/* Address + Bell */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="flex items-center justify-between"
          >
            <button className="flex items-center gap-1">
              <span className="text-sm font-semibold text-foreground">R. Example, 123</span>
              <ChevronDown size={16} className="text-muted-foreground" />
            </button>
            <motion.button
              whileTap={{ scale: 0.9 }}
              className="relative p-2"
            >
              <Bell size={22} className="text-foreground" />
              <motion.span
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground"
              >
                5
              </motion.span>
            </motion.button>
          </motion.div>

          {/* Greeting + Coupons */}
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.35, duration: 0.4 }}
            className="mt-3 flex items-center justify-between"
          >
            <p className="text-base font-bold text-foreground">
              Olá{userName ? `, ${userName}` : ""}
            </p>
            <div className="flex items-center gap-2">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5"
              >
                <span className="text-xs font-bold text-primary">💜 Cupons até R$ 10</span>
              </motion.button>
            </div>
          </motion.div>

          {/* Category Grid */}
          {!catLoading && categories.length > 0 && (
            <motion.div
              variants={stagger}
              initial="hidden"
              animate="visible"
              className="mt-5 grid grid-cols-4 gap-2.5"
            >
              {categories.map((cat, i) => (
                <motion.button
                  key={cat.id}
                  variants={fadeUp}
                  custom={i}
                  whileHover={{ scale: 1.08, y: -4 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => scrollToCategory(cat.id)}
                  className="flex flex-col items-center gap-2 rounded-2xl bg-background p-3 shadow-sm"
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
                </motion.button>
              ))}
            </motion.div>
          )}

          {/* Promo Banner */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5, duration: 0.5 }}
            whileHover={{ scale: 1.02 }}
            className="mt-5 overflow-hidden rounded-2xl shadow-sm cursor-pointer"
          >
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
          </motion.div>

          {/* Dots */}
          <div className="mt-2.5 flex items-center justify-center gap-1.5">
            <motion.div
              animate={{ width: [24, 16, 24] }}
              transition={{ duration: 3, repeat: Infinity }}
              className="h-1.5 rounded-full bg-primary"
            />
            <div className="h-1.5 w-1.5 rounded-full bg-border" />
            <div className="h-1.5 w-1.5 rounded-full bg-border" />
          </div>

          {/* Menu Sections */}
          {prodLoading ? (
            <div className="mt-7 flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : (
            <div ref={menuRef} className="mt-7 space-y-7">
              {categories.map((cat) => {
                const catProducts = products.filter((p) => p.category === cat.id);
                if (catProducts.length === 0) return null;
                return (
                  <motion.section
                    key={cat.id}
                    id={`cat-${cat.id}`}
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-50px" }}
                    transition={{ duration: 0.5 }}
                  >
                    <h2 className="text-xl font-extrabold text-foreground">
                      {cat.icon} {cat.name}
                    </h2>
                    <div className="mt-3 space-y-2.5">
                      {catProducts.map((product, i) => (
                        <ProductCard key={product.id} product={product} index={i} storeIsOpen={storeIsOpen} />
                      ))}
                    </div>
                  </motion.section>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>

      <CartFloatingButton />
      <BottomNav />
    </div>
  );
};

export default Index;
