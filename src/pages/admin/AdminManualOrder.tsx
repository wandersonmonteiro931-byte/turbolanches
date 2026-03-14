import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Minus, Trash2, Search, ShoppingBag, Edit2, Package, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import NeighborhoodAutocomplete from "@/components/NeighborhoodAutocomplete";
import CustomerSearch from "@/components/admin/CustomerSearch";
import ManualOrderAddonSelector from "@/components/admin/ManualOrderAddonSelector";

interface Product {
  id: string;
  name: string;
  price: number;
  category_id: string | null;
  image_url: string | null;
  is_combo?: boolean;
  combo_item_count?: number;
}

interface Category {
  id: string;
  name: string;
  sort_order: number;
}

interface CartItemAddon {
  addon_id: string;
  name: string;
  price: number;
  quantity: number;
}

interface CartItem {
  product: Product;
  quantity: number;
  observations: string;
  customPrice: number;
  isCombo: boolean;
  addons: CartItemAddon[];
}

interface AvailableAddon {
  id: string;
  name: string;
  price: number;
  apply_to_all: boolean;
  product_id: string | null;
}

interface DeliveryZone {
  neighborhood: string;
  delivery_fee: number;
  distance_km: number | null;
  temp_free_delivery: boolean;
}

interface DeliveryConfig {
  free_delivery_min_order: number;
  free_delivery_max_km: number;
  temp_free_delivery_all: boolean;
}

const deliveryTypes = [
  { id: "mesa", label: "Mesa", icon: "🪑" },
  { id: "viagem", label: "Viagem", icon: "🛍️" },
  { id: "retirada", label: "Retirada", icon: "🏪" },
  { id: "delivery", label: "Delivery", icon: "🏍️" },
  { id: "consumo", label: "Consumo", icon: "🍽️" },
];

const paymentMethods = [
  { id: "dinheiro", label: "Dinheiro", icon: "💵" },
  { id: "pix_entrega", label: "PIX Entrega", icon: "📱" },
  { id: "pix_pago", label: "PIX Pago", icon: "✅" },
  { id: "cartao", label: "Cartão", icon: "💳" },
  { id: "fiado", label: "Fiado", icon: "📝" },
];

const normalizeNeighborhood = (value: string) => value.trim().toLowerCase();

const fadeIn = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.2 },
};

const SectionCard = ({ children, title, icon, className = "" }: { children: React.ReactNode; title: string; icon?: string; className?: string }) => (
  <motion.div {...fadeIn} className={`rounded-2xl bg-card border border-border p-4 space-y-3 shadow-sm ${className}`}>
    <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
      {icon && <span>{icon}</span>}
      {title}
    </h2>
    {children}
  </motion.div>
);

const AdminManualOrder = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [deliveryType, setDeliveryType] = useState("mesa");
  const [paymentMethod, setPaymentMethod] = useState("dinheiro");
  const [isPaid, setIsPaid] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedCustomerCode, setSelectedCustomerCode] = useState<string>("");
  const [tableNumber, setTableNumber] = useState("");
  const [addressStreet, setAddressStreet] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [addressNeighborhood, setAddressNeighborhood] = useState("");
  const [addressComplement, setAddressComplement] = useState("");
  const [observations, setObservations] = useState("");
  const [changeFor, setChangeFor] = useState("");
  const [loading, setLoading] = useState(false);
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>([]);
  const [deliveryConfig, setDeliveryConfig] = useState<DeliveryConfig>({
    free_delivery_min_order: 0,
    free_delivery_max_km: 0,
    temp_free_delivery_all: false,
  });
  const [customDeliveryFee, setCustomDeliveryFee] = useState<string>("");
  const [deliveryFeeOverridden, setDeliveryFeeOverridden] = useState(false);
  const [discount, setDiscount] = useState<string>("");
  const [availableAddons, setAvailableAddons] = useState<AvailableAddon[]>([]);
  const [addonProductLinks, setAddonProductLinks] = useState<{ addon_id: string; product_id: string }[]>([]);
  const [selectedCartItemIds, setSelectedCartItemIds] = useState<string[]>([]);
  const [showProducts, setShowProducts] = useState(true);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  const comboSelectionInitializedRef = useRef(false);

  useEffect(() => {
    const cartIds = cart.map((item) => item.product.id);
    setSelectedCartItemIds((prev) => {
      const validPrev = prev.filter((id) => cartIds.includes(id));
      if (validPrev.length === 0 && cartIds.length > 0 && !comboSelectionInitializedRef.current) {
        comboSelectionInitializedRef.current = true;
        return cartIds;
      }
      if (validPrev.length === prev.length && validPrev.every((id, idx) => id === prev[idx])) return prev;
      return validPrev;
    });
    if (cartIds.length === 0) comboSelectionInitializedRef.current = false;
  }, [cart]);

  const loadLatestData = useCallback(async () => {
    const [prodRes, catRes, zonesRes, addonsRes, linksRes, settingsRes] = await Promise.all([
      supabase.from("products").select("id, name, price, category_id, image_url, is_combo, combo_item_count").eq("active", true).order("sort_order").order("name"),
      supabase.from("categories").select("id, name, sort_order").eq("active", true).order("sort_order"),
      supabase.from("delivery_zones").select("neighborhood, delivery_fee, distance_km, temp_free_delivery"),
      supabase.from("product_addons").select("id, name, price, apply_to_all, product_id").eq("active", true).order("sort_order"),
      supabase.from("addon_product_links").select("addon_id, product_id"),
      supabase.from("store_settings").select("free_delivery_min_order, free_delivery_max_km, temp_free_delivery_all").limit(1).single(),
    ]);

    if (prodRes.data) setProducts(prodRes.data);
    if (catRes.data) setCategories(catRes.data);
    if (zonesRes.data) setDeliveryZones(zonesRes.data as DeliveryZone[]);
    if (addonsRes.data) setAvailableAddons(addonsRes.data);
    if (linksRes.data) setAddonProductLinks(linksRes.data);
    if (settingsRes.data) {
      const config = settingsRes.data as DeliveryConfig;
      setDeliveryConfig({
        free_delivery_min_order: Number(config.free_delivery_min_order) || 0,
        free_delivery_max_km: Number(config.free_delivery_max_km) || 0,
        temp_free_delivery_all: Boolean(config.temp_free_delivery_all),
      });
    }
    setDataRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => { void loadLatestData(); }, [loadLatestData]);

  useEffect(() => {
    const handleFocus = () => void loadLatestData();
    const handleVisibility = () => { if (document.visibilityState === "visible") void loadLatestData(); };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => { window.removeEventListener("focus", handleFocus); document.removeEventListener("visibilitychange", handleVisibility); };
  }, [loadLatestData]);

  const getAddonsForProduct = (productId: string) =>
    availableAddons.filter((addon) => addon.apply_to_all || addon.product_id === productId || addonProductLinks.some((l) => l.addon_id === addon.id && l.product_id === productId));

  const getAddonsForSelectedItems = () => {
    const addonMap = new Map<string, AvailableAddon>();
    selectedCartItemIds.forEach((pid) => getAddonsForProduct(pid).forEach((a) => addonMap.set(a.id, a)));
    return Array.from(addonMap.values());
  };

  const isProductCombo = (product: Product) => {
    const category = categories.find((c) => c.id === product.category_id);
    return Boolean(product.is_combo) || category?.name?.toLowerCase().includes("combo") || product.name.toLowerCase().includes("combo");
  };

  const filteredProducts = products.filter((p) => {
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !selectedCategory || p.category_id === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        const newQty = existing.quantity + 1;
        return prev.map((i) => {
          if (i.product.id !== product.id) return i;
          const updatedAddons = i.isCombo ? i.addons.map((a) => ({ ...a, quantity: Math.round((a.quantity / i.quantity) * newQty) })) : i.addons;
          return { ...i, quantity: newQty, addons: updatedAddons };
        });
      }
      return [...prev, { product, quantity: 1, observations: "", customPrice: product.price, isCombo: isProductCombo(product), addons: [] }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev.map((i) => {
        if (i.product.id !== productId) return i;
        const newQty = Math.max(0, i.quantity + delta);
        if (newQty === 0) return { ...i, quantity: 0 };
        const updatedAddons = i.isCombo ? i.addons.map((a) => ({ ...a, quantity: Math.round((a.quantity / i.quantity) * newQty) })) : i.addons;
        return { ...i, quantity: newQty, addons: updatedAddons };
      }).filter((i) => i.quantity > 0)
    );
  };

  const removeItem = (productId: string) => {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
    setSelectedCartItemIds((prev) => prev.filter((id) => id !== productId));
  };

  const updateItemObs = (productId: string, obs: string) => {
    setCart((prev) => prev.map((i) => (i.product.id === productId ? { ...i, observations: obs } : i)));
  };

  const updateItemPrice = (productId: string, newPrice: string) => {
    const val = parseFloat(newPrice.replace(",", "."));
    if (!isNaN(val) && val >= 0) setCart((prev) => prev.map((i) => (i.product.id === productId ? { ...i, customPrice: val } : i)));
  };

  const toggleCombo = (productId: string) => {
    setCart((prev) =>
      prev.map((i) => {
        if (i.product.id !== productId) return i;
        const newIsCombo = !i.isCombo;
        const updatedAddons = newIsCombo ? i.addons.map((a) => ({ ...a, quantity: a.quantity > 0 ? a.quantity * i.quantity : 0 })) : i.addons;
        return { ...i, isCombo: newIsCombo, addons: updatedAddons };
      })
    );
  };

  const handleSetAddon = (productIds: string[], addonId: string, addon: { id: string; name: string; price: number }, quantity: number) => {
    setCart((prev) =>
      prev.map((item) => {
        if (!productIds.includes(item.product.id)) return item;
        let newAddons = [...item.addons];
        if (quantity <= 0) {
          newAddons = newAddons.filter((a) => a.addon_id !== addonId);
        } else {
          const existingIdx = newAddons.findIndex((a) => a.addon_id === addonId);
          if (existingIdx >= 0) newAddons[existingIdx] = { ...newAddons[existingIdx], quantity };
          else newAddons.push({ addon_id: addonId, name: addon.name, price: addon.price, quantity });
        }
        return { ...item, addons: newAddons };
      })
    );
  };

  const toggleSelectItem = (productId: string) => {
    setSelectedCartItemIds((prev) => (prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]));
  };
  const selectAllItems = () => setSelectedCartItemIds(cart.map((i) => i.product.id));
  const clearSelection = () => setSelectedCartItemIds([]);

  const addonsTotal = cart.reduce((sum, i) => sum + i.addons.reduce((s, a) => s + a.price * a.quantity, 0), 0);
  const subtotal = cart.reduce((sum, i) => sum + i.customPrice * i.quantity, 0) + addonsTotal;

  const matchedZone = deliveryZones.find((zone) => normalizeNeighborhood(zone.neighborhood) === normalizeNeighborhood(addressNeighborhood));
  const rawDeliveryFee = matchedZone ? Number(matchedZone.delivery_fee) : 5.99;

  const isTempFree = Boolean(matchedZone?.temp_free_delivery || deliveryConfig.temp_free_delivery_all);
  const isKmFree = Boolean(deliveryConfig.free_delivery_max_km > 0 && matchedZone?.distance_km != null && matchedZone.distance_km >= 0 && matchedZone.distance_km <= deliveryConfig.free_delivery_max_km);
  const isMinOrderFree = Boolean(deliveryConfig.free_delivery_min_order > 0 && subtotal >= deliveryConfig.free_delivery_min_order);

  const autoDeliveryFee = isTempFree || isKmFree || isMinOrderFree ? 0 : rawDeliveryFee;
  const autoDeliveryReason = isTempFree
    ? "🎉 Frete grátis (promoção)"
    : isKmFree
      ? `🎉 Frete grátis (até ${deliveryConfig.free_delivery_max_km} km)`
      : isMinOrderFree
        ? `🎉 Frete grátis (pedido ≥ R$ ${deliveryConfig.free_delivery_min_order.toFixed(2).replace(".", ",")})`
        : null;

  useEffect(() => {
    if (deliveryType !== "delivery" || deliveryFeeOverridden) return;
    setCustomDeliveryFee(autoDeliveryFee.toFixed(2));
  }, [deliveryType, deliveryFeeOverridden, autoDeliveryFee]);

  const deliveryFee = deliveryType === "delivery" ? (deliveryFeeOverridden ? parseFloat(customDeliveryFee.replace(",", ".")) || 0 : autoDeliveryFee) : 0;
  const discountValue = parseFloat(discount.replace(",", ".")) || 0;
  const total = Math.max(0, subtotal + deliveryFee - discountValue);

  const handleSubmit = async () => {
    if (cart.length === 0) { toast.error("Adicione pelo menos um item"); return; }
    if (!user) { toast.error("Você precisa estar logado"); return; }
    if (deliveryType === "delivery") {
      if (!addressStreet) { toast.error("Preencha a rua para delivery"); return; }
      if (!addressNeighborhood) { toast.error("Preencha o bairro para delivery"); return; }
      if (!addressComplement) { toast.error("Preencha o complemento para delivery"); return; }
    }

    setLoading(true);
    try {
      const isPixEntrega = paymentMethod === "pix_entrega";
      const isPixPago = paymentMethod === "pix_pago";
      const actualPaymentMethod = isPixEntrega || isPixPago ? "pix" : paymentMethod;
      const actualPaid = isPixPago || isPaid;

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: user.id,
          subtotal,
          delivery_fee: deliveryFee,
          discount: discountValue,
          total,
          status: "preparing",
          preparing_at: new Date().toISOString(),
          delivery_type: deliveryType,
          payment_method: actualPaymentMethod,
          payment_confirmed: actualPaid,
          address_street: deliveryType === "delivery" ? addressStreet : null,
          address_number: deliveryType === "delivery" ? addressNumber : null,
          address_complement: deliveryType === "delivery" ? addressComplement : null,
          address_neighborhood: deliveryType === "delivery" ? addressNeighborhood : null,
          observations: [
            "[PDV]",
            customerName ? `Cliente: ${customerName}` : null,
            customerPhone ? `Tel: ${customerPhone}` : null,
            selectedCustomerCode ? `Código: ${selectedCustomerCode}` : null,
            tableNumber ? `Mesa: ${tableNumber}` : null,
            observations || null,
          ].filter(Boolean).join(" | ") || "[PDV]",
          change_for: actualPaymentMethod === "dinheiro" && changeFor ? Number(changeFor) : null,
        })
        .select("id, order_number")
        .single();

      if (orderError) throw orderError;

      const orderItems = cart.map((item) => ({
        order_id: order.id,
        product_id: item.product.id,
        product_name: item.product.name,
        quantity: item.quantity,
        unit_price: item.customPrice,
        observations: item.observations || null,
        addons_json: item.addons.length > 0 ? JSON.parse(JSON.stringify(item.addons)) : null,
      }));

      const { error: itemsError } = await supabase.from("order_items").insert(orderItems);
      if (itemsError) throw itemsError;

      toast.success(`Pedido #${String(order.order_number).padStart(5, "0")} criado!`);
      window.open(`/admin/imprimir/${order.id}?tipo=pedido`, "_blank", "width=300,height=600");
      navigate("/admin");
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar pedido");
    } finally {
      setLoading(false);
    }
  };

  const cartItemCount = cart.reduce((s, i) => s + i.quantity, 0);
  const fmt = (v: number) => v.toFixed(2).replace(".", ",");
  const hasCart = cart.length > 0;

  return (
    <div className="flex min-h-full flex-col bg-background">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.18),_transparent_55%)]" />

      <header className="sticky top-0 z-40 border-b border-border bg-card/95 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-3">
          <button onClick={() => navigate("/admin")} className="rounded-xl p-2 transition-colors hover:bg-muted">
            <ArrowLeft size={20} className="text-foreground" />
          </button>
          <div>
            <h1 className="text-xl font-black tracking-tight text-foreground">Novo Pedido Manual</h1>
            <p className="text-xs text-muted-foreground">Tela redesenhada com atualização dinâmica de produtos, frete e adicionais.</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => void loadLatestData()}
              className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-bold text-foreground transition-colors hover:bg-muted"
            >
              Atualizar dados
            </button>
            <AnimatePresence>
              {cartItemCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-md"
                >
                  <ShoppingBag size={13} /> {cartItemCount}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl gap-4 px-4 pb-12 pt-5 xl:grid-cols-[1.25fr_0.95fr]">
        <section className="space-y-4">
          <SectionCard title="1. Contexto do Pedido" icon="🧭" className="animate-enter">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {deliveryTypes.map((dt) => (
                <motion.button
                  key={dt.id}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setDeliveryType(dt.id)}
                  className={`rounded-2xl border px-2 py-3 text-center transition-all ${
                    deliveryType === dt.id
                      ? "border-primary bg-primary text-primary-foreground shadow-lg"
                      : "border-border bg-background text-foreground hover:bg-muted"
                  }`}
                >
                  <div className="text-xl">{dt.icon}</div>
                  <div className="mt-1 text-[10px] font-extrabold uppercase tracking-wide">{dt.label}</div>
                </motion.button>
              ))}
            </div>

            <div className="rounded-2xl border border-border bg-background/70 p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Cliente</p>
              <CustomerSearch
                onSelect={(profile) => {
                  setCustomerName(profile.full_name);
                  setCustomerPhone(profile.phone);
                  setSelectedCustomerId(profile.user_id);
                  setSelectedCustomerCode(`T${String(profile.customer_code).padStart(5, "0")}`);
                  if (deliveryType === "delivery") {
                    setAddressStreet(profile.street || "");
                    setAddressNumber(profile.number || "");
                    setAddressNeighborhood(profile.neighborhood || "");
                    setAddressComplement(
                      [profile.complement, profile.quadra ? `Qd ${profile.quadra}` : "", profile.lote ? `Lt ${profile.lote}` : ""]
                        .filter(Boolean)
                        .join(" "),
                    );
                  }
                }}
                onClear={() => {
                  setSelectedCustomerId(null);
                  setSelectedCustomerCode("");
                }}
              />

              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  placeholder="Nome do cliente"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <div className="space-y-1">
                  <input
                    placeholder="WhatsApp (opcional)"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <p className="text-[11px] text-muted-foreground">Você pode criar pedido sem telefone.</p>
                </div>
              </div>

              {(deliveryType === "mesa" || deliveryType === "consumo") && (
                <motion.div {...fadeIn} className="mt-2">
                  <input
                    placeholder="Número da mesa"
                    value={tableNumber}
                    onChange={(e) => setTableNumber(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </motion.div>
              )}
            </div>

            <AnimatePresence>
              {deliveryType === "delivery" && (
                <motion.div {...fadeIn} className="space-y-2 rounded-2xl border border-border bg-background/70 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Endereço de entrega</p>
                    <span className="text-[11px] font-medium text-muted-foreground">Obrigatório: rua + complemento + bairro</span>
                  </div>

                  <input
                    placeholder="Rua *"
                    value={addressStreet}
                    onChange={(e) => setAddressStreet(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input
                      placeholder="Número"
                      value={addressNumber}
                      onChange={(e) => setAddressNumber(e.target.value)}
                      className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <input
                      placeholder="Complemento *"
                      value={addressComplement}
                      onChange={(e) => setAddressComplement(e.target.value)}
                      className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  <NeighborhoodAutocomplete
                    value={addressNeighborhood}
                    onChange={(val, fee) => {
                      setAddressNeighborhood(val);
                      setDeliveryFeeOverridden(false);
                      if (typeof fee === "number") setCustomDeliveryFee(fee.toFixed(2));
                    }}
                    placeholder="Bairro *"
                    allowInactive
                    refreshKey={dataRefreshKey}
                  />

                  {matchedZone && (
                    <motion.div {...fadeIn} className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-3 py-2">
                      <span className="text-xs font-bold text-primary">Taxa atual: R$ {fmt(autoDeliveryFee)}</span>
                      {autoDeliveryReason && <span className="text-[11px] font-semibold text-primary/80">{autoDeliveryReason}</span>}
                      {!autoDeliveryReason && matchedZone.temp_free_delivery && (
                        <span className="text-[11px] font-semibold text-primary/80">Frete promocional aplicado</span>
                      )}
                    </motion.div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <textarea
              placeholder="Observações do pedido"
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-2xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </SectionCard>

          <SectionCard title="2. Catálogo Atualizado" icon="🛒" className="animate-enter">
            <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/60 px-3 py-2">
              <div className="text-xs font-bold text-foreground">Produtos e preços sincronizados no acesso da tela</div>
              <button
                onClick={() => setShowProducts((prev) => !prev)}
                className="flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-bold text-foreground transition-colors hover:bg-muted"
              >
                {showProducts ? "Ocultar" : "Mostrar"}
                {showProducts ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>

            <AnimatePresence>
              {showProducts && (
                <motion.div {...fadeIn} className="space-y-3">
                  <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5">
                    <Search size={16} className="text-muted-foreground" />
                    <input
                      placeholder="Buscar item, combo ou produto..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                    />
                  </div>

                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    <button
                      onClick={() => setSelectedCategory(null)}
                      className={`whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                        !selectedCategory ? "bg-primary text-primary-foreground" : "border border-border bg-background text-foreground"
                      }`}
                    >
                      Todos
                    </button>
                    {categories.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => setSelectedCategory(cat.id)}
                        className={`whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                          selectedCategory === cat.id ? "bg-primary text-primary-foreground" : "border border-border bg-background text-foreground"
                        }`}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                    {filteredProducts.map((product) => {
                      const inCart = cart.find((i) => i.product.id === product.id);
                      return (
                        <motion.button
                          key={product.id}
                          whileHover={{ y: -3 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => addToCart(product)}
                          className={`relative rounded-2xl border p-3 text-left transition-all ${
                            inCart ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-background hover:bg-muted"
                          }`}
                        >
                          <p className="line-clamp-2 text-sm font-bold text-foreground">{product.name}</p>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <p className="text-sm font-black text-primary">R$ {fmt(product.price)}</p>
                            {isProductCombo(product) && (
                              <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-extrabold text-accent-foreground">COMBO</span>
                            )}
                          </div>

                          <AnimatePresence>
                            {inCart && (
                              <motion.span
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                exit={{ scale: 0 }}
                                className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground"
                              >
                                {inCart.quantity}
                              </motion.span>
                            )}
                          </AnimatePresence>
                        </motion.button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </SectionCard>
        </section>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <SectionCard title={`Itens no Carrinho (${cartItemCount})`} icon="📦" className="animate-enter">
            {!hasCart ? (
              <div className="rounded-xl border border-dashed border-border bg-background/70 px-4 py-6 text-center text-sm text-muted-foreground">
                Adicione itens no catálogo para começar.
              </div>
            ) : (
              <div className="max-h-[40vh] space-y-3 overflow-y-auto pr-1">
                {cart.map((item) => {
                  const itemAddonsTotal = item.addons.reduce((s, a) => s + a.price * a.quantity, 0);
                  return (
                    <motion.div key={item.product.id} layout {...fadeIn} className="rounded-xl border border-border bg-background p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-bold text-foreground">{item.product.name}</p>
                        <button
                          onClick={() => removeItem(item.product.id)}
                          className="rounded-lg p-1.5 text-destructive transition-colors hover:bg-destructive/10"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1 rounded-xl bg-muted p-0.5">
                          <button onClick={() => updateQuantity(item.product.id, -1)} className="rounded-lg p-1.5 transition-colors hover:bg-background">
                            <Minus size={13} />
                          </button>
                          <span className="min-w-[24px] text-center text-sm font-bold text-foreground">{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.product.id, 1)} className="rounded-lg p-1.5 transition-colors hover:bg-background">
                            <Plus size={13} />
                          </button>
                        </div>

                        <button
                          onClick={() => toggleCombo(item.product.id)}
                          className={`flex items-center gap-1 rounded-xl px-2.5 py-1 text-[11px] font-bold ${
                            item.isCombo ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
                          }`}
                        >
                          <Package size={12} /> Combo
                        </button>

                        <div className="flex items-center gap-1 rounded-xl bg-muted px-2 py-1">
                          <Edit2 size={11} className="text-muted-foreground" />
                          <input
                            type="number"
                            step="0.01"
                            value={item.customPrice}
                            onChange={(e) => updateItemPrice(item.product.id, e.target.value)}
                            className="w-14 bg-transparent text-center text-xs font-bold text-foreground focus:outline-none"
                          />
                        </div>
                      </div>

                      <input
                        placeholder="Observação do item"
                        value={item.observations}
                        onChange={(e) => updateItemObs(item.product.id, e.target.value)}
                        className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />

                      {item.addons.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {item.addons.map((a) => (
                            <span key={a.addon_id} className="rounded-lg bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">
                              {a.quantity}x {a.name} (+R$ {fmt(a.price * a.quantity)})
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="mt-2 text-right text-xs font-black text-primary">R$ {fmt(item.customPrice * item.quantity + itemAddonsTotal)}</div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </SectionCard>

          <AnimatePresence>
            {hasCart && (
              <SectionCard title="Adicionais / Combo" icon="🧩" className="animate-enter">
                <ManualOrderAddonSelector
                  items={cart.map((i) => ({
                    productId: i.product.id,
                    productName: i.product.name,
                    quantity: i.quantity,
                    isCombo: i.isCombo,
                    addons: i.addons,
                  }))}
                  availableAddons={getAddonsForSelectedItems().map((a) => ({ id: a.id, name: a.name, price: a.price }))}
                  selectedItemIds={selectedCartItemIds}
                  onToggleCombo={toggleCombo}
                  onToggleSelectItem={toggleSelectItem}
                  onSelectAll={selectAllItems}
                  onClearSelection={clearSelection}
                  onSetAddon={handleSetAddon}
                />
              </SectionCard>
            )}
          </AnimatePresence>

          <SectionCard title="3. Pagamento" icon="💳" className="animate-enter">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {paymentMethods.map((pm) => (
                <motion.button
                  key={pm.id}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setPaymentMethod(pm.id);
                    if (pm.id === "pix_pago") setIsPaid(true);
                    if (pm.id === "pix_entrega") setIsPaid(false);
                  }}
                  className={`rounded-2xl border px-2 py-3 text-center transition-all ${
                    paymentMethod === pm.id
                      ? "border-primary bg-primary text-primary-foreground shadow-md"
                      : "border-border bg-background text-foreground hover:bg-muted"
                  }`}
                >
                  <div className="text-lg">{pm.icon}</div>
                  <div className="mt-1 text-[10px] font-extrabold leading-tight">{pm.label}</div>
                </motion.button>
              ))}
            </div>

            {paymentMethod === "pix_entrega" || paymentMethod === "pix_pago" ? (
              <motion.div
                {...fadeIn}
                className={`rounded-xl border px-4 py-3 text-sm font-bold ${
                  paymentMethod === "pix_pago"
                    ? "border-accent/40 bg-accent/15 text-accent-foreground"
                    : "border-primary/20 bg-primary/10 text-foreground"
                }`}
              >
                {paymentMethod === "pix_pago" ? "✅ PIX PAGO — valor já recebido." : "📱 PIX ENTREGA — cobrar na entrega."}
              </motion.div>
            ) : (
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 transition-colors hover:bg-muted">
                <input
                  type="checkbox"
                  checked={isPaid}
                  onChange={(e) => setIsPaid(e.target.checked)}
                  className="h-5 w-5 rounded border-border accent-primary"
                />
                <div>
                  <span className="text-sm font-bold text-foreground">Já está pago</span>
                  <p className="text-[11px] text-muted-foreground">Nenhum valor a receber.</p>
                </div>
              </label>
            )}

            {paymentMethod === "dinheiro" && !isPaid && (
              <motion.div {...fadeIn}>
                <input
                  type="number"
                  placeholder="Troco para quanto? (R$)"
                  value={changeFor}
                  onChange={(e) => setChangeFor(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </motion.div>
            )}
          </SectionCard>

          <SectionCard title="4. Resumo e Criação" icon="🧾" className="animate-enter">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Subtotal</span>
                <span>R$ {fmt(subtotal)}</span>
              </div>

              {deliveryType === "delivery" && (
                <div className="space-y-1 rounded-xl border border-border bg-background px-3 py-2">
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>Entrega</span>
                    <div className="flex items-center gap-1">
                      <span>R$</span>
                      <input
                        type="number"
                        step="0.01"
                        value={customDeliveryFee}
                        onChange={(e) => {
                          setCustomDeliveryFee(e.target.value);
                          setDeliveryFeeOverridden(true);
                        }}
                        className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-right text-xs font-bold text-foreground focus:outline-none"
                      />
                    </div>
                  </div>
                  {!deliveryFeeOverridden && autoDeliveryReason && (
                    <p className="text-[11px] font-medium text-primary">{autoDeliveryReason}</p>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Desconto</span>
                <div className="flex items-center gap-1">
                  <span>R$</span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-right text-xs font-bold text-foreground focus:outline-none"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-primary/20 bg-primary/10 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-foreground">Total do Pedido</span>
                  <span className="text-xl font-black text-primary">R$ {fmt(total)}</span>
                </div>
              </div>

            </div>
          </SectionCard>
        </aside>
      </main>

      {/* Fixed bottom bar */}
      <div className="sticky bottom-0 z-30 border-t border-border bg-card px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={handleSubmit}
          disabled={loading || !hasCart}
          className="mx-auto block w-full max-w-2xl rounded-2xl bg-primary py-3.5 text-sm font-black text-primary-foreground shadow-lg transition-all disabled:opacity-50"
        >
          {loading ? "Criando pedido..." : `Criar Pedido · R$ ${fmt(total)}`}
        </motion.button>
      </div>
    </div>
  );
};

export default AdminManualOrder;
