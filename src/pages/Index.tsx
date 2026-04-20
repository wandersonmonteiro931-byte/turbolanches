import { useRef, useEffect, useState } from "react";
import { ChevronDown, MapPin } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useCategories, useProducts } from "@/hooks/useMenu";
import { useBanners } from "@/hooks/useBanners";
import { useSiteContent } from "@/hooks/useSiteContent";
import { useAuth } from "@/contexts/AuthContext";
import ProductCard from "@/components/ProductCard";
import ReorderSection from "@/components/ReorderSection";
import CartFloatingButton from "@/components/CartFloatingButton";
import BottomNav from "@/components/BottomNav";
import StoreHours from "@/components/StoreHours";
import FlashPhrases from "@/components/FlashPhrases";
import AddressSelector from "@/components/AddressSelector";
import StoreReviews from "@/components/StoreReviews";
import { supabase } from "@/integrations/supabase/client";
import { useStoreStatus } from "@/hooks/useStoreStatus";
import { useAddresses } from "@/hooks/useAddresses";
import { useStoreLogo } from "@/hooks/useStoreLogo";
import { useStoreName } from "@/hooks/useStoreName";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import footerLogo from "@/assets/footer-logo-footer.png";

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
  useScrollRestoration("home");
  const menuRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const { isOpen: storeIsOpen, nextOpeningText } = useStoreStatus();
  const { categories, loading: catLoading } = useCategories();
  const { products, loading: prodLoading } = useProducts();
  const { banners } = useBanners();
  const { content } = useSiteContent();
  const [userName, setUserName] = useState("");
  const { defaultAddress, loading: addrLoading } = useAddresses();
  const [addrSelectorOpen, setAddrSelectorOpen] = useState(false);
  const storeLogo = useStoreLogo();
  const [geoAddress, setGeoAddress] = useState("");
  const [activeBanner, setActiveBanner] = useState(0);

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

  // Geolocation fallback when no saved address
  useEffect(() => {
    if (!addrLoading && !defaultAddress && !geoAddress && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&addressdetails=1`
            );
            const data = await res.json();
            const addr = data.address;
            const parts = [addr.road, addr.house_number].filter(Boolean);
            setGeoAddress(parts.join(", ") || "Sua localização");
          } catch {
            setGeoAddress("Sua localização");
          }
        },
        () => {}
      );
    }
  }, [addrLoading, defaultAddress, geoAddress]);

  // Auto-rotate banners
  useEffect(() => {
    if (banners.length <= 1) return;
    const interval = setInterval(() => {
      setActiveBanner((prev) => (prev + 1) % banners.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [banners.length]);

  const scrollToCategory = (categoryId: string) => {
    const el = document.getElementById(`cat-${categoryId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const whatsappNumber = content.whatsapp_number || "5562994753582";
  const whatsappMessage = content.whatsapp_message || "Olá! Gostaria de fazer um pedido.";
  const instagramHandle = content.instagram_handle || "@turboolanches";
  const instagramUser = instagramHandle.replace(/^@/, "");
  const currentYear = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Store Status Banner */}
      {!storeIsOpen ? (
        <div className="bg-destructive px-4 py-3 text-center">
          <p className="text-sm font-bold text-destructive-foreground">ESTAMOS FECHADOS NO MOMENTO</p>
          {nextOpeningText && (
            <p className="mt-1 text-xs font-medium text-destructive-foreground/90">{nextOpeningText}</p>
          )}
          <div className="mt-1 flex items-center justify-center gap-2">
            <StoreHours />
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 bg-card border-b border-border px-4 py-1.5">
          <span className="text-[11px] text-muted-foreground">Aberto agora</span>
          <StoreHours />
        </div>
      )}

      {/* Hero Banner - dynamic from DB or fallback */}
      <motion.div
        initial={{ opacity: 0, scale: 1.05 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative w-full"
      >
      <div className="relative w-full overflow-hidden aspect-[1600/525] bg-primary">
          {banners.length > 0 ? (
            <AnimatePresence mode="wait">
              <motion.img
                key={activeBanner}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                src={banners[activeBanner]?.image_url || "/placeholder.svg"}
                alt={banners[activeBanner]?.title}
                className="absolute inset-0 h-full w-full"
                style={{ objectFit: "fill" }}
              />
            </AnimatePresence>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-b from-primary/60 via-primary/30 to-transparent" />
          )}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="absolute bottom-4 left-4 right-4"
          >
            <span className="inline-block rounded-full bg-card/90 backdrop-blur-sm px-3 py-1 text-xs font-bold text-primary shadow-sm">
              {content.home_promo_badge || "🔥 PROMOÇÃO DO DIA"}
            </span>
            <p className="mt-1.5 text-sm font-bold text-white drop-shadow-lg">
              {content.home_promo_text || "Turbo Smash por R$ 32,90"}
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
          {/* Address */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="flex items-center justify-between"
          >
            <button onClick={() => setAddrSelectorOpen(true)} className="flex items-center gap-1.5 min-w-0">
              <MapPin size={14} className="text-primary shrink-0" />
              <span className="text-sm font-semibold text-foreground truncate max-w-[200px]">
                {defaultAddress
                  ? `${defaultAddress.street}${defaultAddress.number ? `, ${defaultAddress.number}` : ""}`
                  : geoAddress || "Adicionar endereço"}
              </span>
              <ChevronDown size={16} className="text-muted-foreground shrink-0" />
            </button>
          </motion.div>

          {/* Greeting + WhatsApp + Instagram */}
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.35, duration: 0.4 }}
            className="mt-3 space-y-2"
          >
            <p className="text-base font-bold text-foreground">
              {content.home_greeting_prefix || "Olá"}{userName ? `, ${userName}` : ""}
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  window.open(
                    `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`,
                    "_blank"
                  );
                }}
                className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5"
              >
                <motion.svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-4 w-4 text-primary"
                  animate={{ rotateY: 360 }}
                  transition={{ repeat: Infinity, duration: 2.4, ease: "linear" }}
                  style={{ perspective: 100 }}
                >
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </motion.svg>
                <span className="text-xs font-bold text-primary">WhatsApp</span>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  window.open(`https://instagram.com/${instagramUser}`, "_blank");
                }}
                className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5"
              >
                <motion.svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-4 w-4 text-primary"
                  animate={{ rotateY: 360 }}
                  transition={{ repeat: Infinity, duration: 2.4, ease: "linear" }}
                  style={{ perspective: 100 }}
                >
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                </motion.svg>
                <span className="text-xs font-bold text-primary">Siga nosso Instagram: {instagramHandle}</span>
              </motion.button>
            </div>

            {/* Flash Phrases */}
            <FlashPhrases />
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

          {/* Banner carousel dots */}
          {banners.length > 1 && (
            <div className="mt-5 flex items-center justify-center gap-1.5">
              {banners.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveBanner(i)}
                  className={`h-1.5 rounded-full transition-all ${i === activeBanner ? "w-6 bg-primary" : "w-1.5 bg-border"}`}
                />
              ))}
            </div>
          )}

          {/* Reorder Section */}
          <ReorderSection />

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
                      {cat.icon ? `${cat.icon} ` : ""}{cat.name}
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

          {/* Customer Reviews Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.5 }}
            className="mt-8 rounded-[calc(var(--radius)+0.75rem)] border border-border bg-card px-4 pb-6 pt-1"
          >
            <h2 className="text-xl font-extrabold text-foreground">⭐ Avaliações dos Clientes</h2>
            <StoreReviews compact />
          </motion.div>
          <div className="h-6" />
        </div>
      </motion.div>

      <footer className="mx-auto mt-10 max-w-md border-t border-border px-4 pb-24 pt-6 text-center">
        <img
          src={storeLogo || footerLogo}
          alt="Novo logotipo Turbo Lanches"
          className="mx-auto h-auto w-full max-w-[280px] object-contain"
          loading="lazy"
        />
        <p className="mt-3 text-sm font-semibold text-muted-foreground">© {currentYear} Turbo Lanches — Todos os direitos reservados.</p>
      </footer>

      <AddressSelector open={addrSelectorOpen} onClose={() => setAddrSelectorOpen(false)} />
      <CartFloatingButton />
      <BottomNav />
    </div>
  );
};

export default Index;
