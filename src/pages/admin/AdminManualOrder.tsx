import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Minus, Trash2, Search, ShoppingBag, Edit2, Package } from "lucide-react";
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

const deliveryTypes = [
  { id: "mesa", label: "🪑 Mesa", description: "Consumo no local" },
  { id: "viagem", label: "🛍️ Viagem", description: "Para levar" },
  { id: "retirada", label: "🏪 Retirada", description: "Retira no balcão" },
  { id: "delivery", label: "🏍️ Delivery", description: "Entrega no endereço" },
  { id: "consumo", label: "🍽️ Consumo", description: "Consumo interno" },
];

const paymentMethods = [
  { id: "dinheiro", label: "💵 Dinheiro" },
  { id: "pix_entrega", label: "📱 PIX Entrega" },
  { id: "pix_pago", label: "📱 PIX Pago" },
  { id: "cartao", label: "💳 Cartão" },
  { id: "fiado", label: "📝 Fiado" },
];

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
  const [deliveryZones, setDeliveryZones] = useState<{ neighborhood: string; delivery_fee: number }[]>([]);
  const [customDeliveryFee, setCustomDeliveryFee] = useState<string>("");
  const [deliveryFeeOverridden, setDeliveryFeeOverridden] = useState(false);
  const [discount, setDiscount] = useState<string>("");
  const [availableAddons, setAvailableAddons] = useState<AvailableAddon[]>([]);
  const [addonProductLinks, setAddonProductLinks] = useState<{ addon_id: string; product_id: string }[]>([]);
  const [selectedCartItemIds, setSelectedCartItemIds] = useState<string[]>([]);
  const comboSelectionInitializedRef = useRef(false);

  useEffect(() => {
    const cartIds = cart.map((item) => item.product.id);

    setSelectedCartItemIds((prev) => {
      const validPrev = prev.filter((id) => cartIds.includes(id));

      if (validPrev.length === 0 && cartIds.length > 0 && !comboSelectionInitializedRef.current) {
        comboSelectionInitializedRef.current = true;
        return cartIds;
      }

      if (validPrev.length === prev.length && validPrev.every((id, idx) => id === prev[idx])) {
        return prev;
      }

      return validPrev;
    });

    if (cartIds.length === 0) {
      comboSelectionInitializedRef.current = false;
    }
  }, [cart]);

  useEffect(() => {
    const load = async () => {
      const [prodRes, catRes, zonesRes, addonsRes, linksRes] = await Promise.all([
        supabase.from("products").select("id, name, price, category_id, image_url, is_combo").eq("active", true),
        supabase.from("categories").select("id, name, sort_order").eq("active", true).order("sort_order"),
        supabase.from("delivery_zones").select("neighborhood, delivery_fee"),
        supabase.from("product_addons").select("id, name, price, apply_to_all, product_id").eq("active", true).order("sort_order"),
        supabase.from("addon_product_links").select("addon_id, product_id"),
      ]);
      if (prodRes.data) setProducts(prodRes.data);
      if (catRes.data) setCategories(catRes.data);
      if (zonesRes.data) setDeliveryZones(zonesRes.data);
      if (addonsRes.data) setAvailableAddons(addonsRes.data);
      if (linksRes.data) setAddonProductLinks(linksRes.data);
    };
    load();
  }, []);

  useEffect(() => {
    if (!deliveryFeeOverridden && deliveryType === "delivery") {
      const matched = deliveryZones.find((z) => z.neighborhood.toLowerCase() === addressNeighborhood.toLowerCase());
      setCustomDeliveryFee(matched ? String(matched.delivery_fee) : "5.99");
    }
  }, [addressNeighborhood, deliveryZones, deliveryType, deliveryFeeOverridden]);

  // Get addons available for a specific product
  const getAddonsForProduct = (productId: string) => {
    return availableAddons.filter((addon) => {
      if (addon.apply_to_all) return true;
      if (addon.product_id === productId) return true;
      return addonProductLinks.some((l) => l.addon_id === addon.id && l.product_id === productId);
    });
  };

  // Get all unique addons for selected cart items
  const getAddonsForSelectedItems = () => {
    const addonMap = new Map<string, AvailableAddon>();

    selectedCartItemIds.forEach((pid) => {
      getAddonsForProduct(pid).forEach((a) => addonMap.set(a.id, a));
    });

    return Array.from(addonMap.values());
  };

  const isProductCombo = (product: Product) => {
    const category = categories.find((c) => c.id === product.category_id);
    const categorySuggestsCombo = category?.name?.toLowerCase().includes("combo") || false;
    const nameSuggestsCombo = product.name.toLowerCase().includes("combo");
    return Boolean(product.is_combo) || categorySuggestsCombo || nameSuggestsCombo;
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
          // If combo, scale addon quantities proportionally
          const updatedAddons = i.isCombo
            ? i.addons.map((a) => ({ ...a, quantity: Math.round((a.quantity / i.quantity) * newQty) }))
            : i.addons;
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
        // If combo, scale addon quantities
        const updatedAddons = i.isCombo
          ? i.addons.map((a) => ({ ...a, quantity: Math.round((a.quantity / i.quantity) * newQty) }))
          : i.addons;
        return { ...i, quantity: newQty, addons: updatedAddons };
      }).filter((i) => i.quantity > 0)
    );
  };

  const removeItem = (productId: string) => {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
    setSelectedCartItemIds((prev) => prev.filter((id) => id !== productId));
  };

  const updateItemObs = (productId: string, obs: string) => {
    setCart((prev) => prev.map((i) => i.product.id === productId ? { ...i, observations: obs } : i));
  };

  const updateItemPrice = (productId: string, newPrice: string) => {
    const val = parseFloat(newPrice.replace(",", "."));
    if (!isNaN(val) && val >= 0) {
      setCart((prev) => prev.map((i) => i.product.id === productId ? { ...i, customPrice: val } : i));
    }
  };

  const toggleCombo = (productId: string) => {
    setCart((prev) => prev.map((i) => {
      if (i.product.id !== productId) return i;
      const newIsCombo = !i.isCombo;

      const updatedAddons = newIsCombo
        ? i.addons.map((a) => ({
            ...a,
            quantity: a.quantity > 0 ? a.quantity * i.quantity : 0,
          }))
        : i.addons;

      return { ...i, isCombo: newIsCombo, addons: updatedAddons };
    }));
  };

  const handleSetAddon = (productIds: string[], addonId: string, addon: { id: string; name: string; price: number }, quantity: number) => {
    setCart((prev) => prev.map((item) => {
      if (!productIds.includes(item.product.id)) return item;
      const existingIdx = item.addons.findIndex((a) => a.addon_id === addonId);
      let newAddons = [...item.addons];
      if (quantity <= 0) {
        newAddons = newAddons.filter((a) => a.addon_id !== addonId);
      } else if (existingIdx >= 0) {
        newAddons[existingIdx] = { ...newAddons[existingIdx], quantity };
      } else {
        newAddons.push({ addon_id: addonId, name: addon.name, price: addon.price, quantity });
      }
      return { ...item, addons: newAddons };
    }));
  };

  const toggleSelectItem = (productId: string) => {
    setSelectedCartItemIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  };

  const selectAllItems = () => setSelectedCartItemIds(cart.map((i) => i.product.id));
  const clearSelection = () => setSelectedCartItemIds([]);

  const addonsTotal = cart.reduce((sum, i) => sum + i.addons.reduce((s, a) => s + a.price * a.quantity, 0), 0);
  const subtotal = cart.reduce((sum, i) => sum + i.customPrice * i.quantity, 0) + addonsTotal;
  const deliveryFee = deliveryType === "delivery" ? (parseFloat(customDeliveryFee.replace(",", ".")) || 0) : 0;
  const discountValue = parseFloat(discount.replace(",", ".")) || 0;
  const total = Math.max(0, subtotal + deliveryFee - discountValue);

  const handleSubmit = async () => {
    if (cart.length === 0) { toast.error("Adicione pelo menos um item"); return; }
    if (!user) { toast.error("Você precisa estar logado"); return; }
    if (!customerPhone) { toast.error("WhatsApp do cliente é obrigatório"); return; }
    if (deliveryType === "delivery" && (!addressStreet || !addressNeighborhood || !addressComplement)) {
      toast.error("Preencha rua, bairro e complemento para delivery"); return;
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

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-background/95 px-4 py-3 backdrop-blur-md border-b border-border">
        <button onClick={() => navigate("/admin")}><ArrowLeft size={20} className="text-foreground" /></button>
        <h1 className="text-lg font-bold text-foreground">Novo Pedido Manual</h1>
        {cartItemCount > 0 && (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">
            <ShoppingBag size={14} /> {cartItemCount}
          </span>
        )}
      </header>

      <div className="mx-auto max-w-2xl px-4 pb-32 space-y-4 pt-4">
        {/* Delivery Type */}
        <div>
          <h2 className="text-sm font-bold text-foreground mb-2">Tipo do Pedido</h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {deliveryTypes.map((dt) => (
              <button key={dt.id} onClick={() => setDeliveryType(dt.id)}
                className={`rounded-xl px-3 py-3 text-center text-xs font-bold transition-all ${
                  deliveryType === dt.id ? "bg-primary text-primary-foreground ring-2 ring-primary/30" : "bg-card border border-border text-foreground hover:bg-muted"
                }`}>
                <div className="text-lg">{dt.label.split(" ")[0]}</div>
                <div className="mt-0.5">{dt.label.split(" ").slice(1).join(" ")}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Customer Info */}
        <div className="rounded-xl bg-card border border-border p-4 space-y-3">
          <h2 className="text-sm font-bold text-foreground">Informações do Cliente</h2>
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
                setAddressComplement([profile.complement, profile.quadra ? `Qd ${profile.quadra}` : "", profile.lote ? `Lt ${profile.lote}` : ""].filter(Boolean).join(" "));
              }
            }}
            onClear={() => { setSelectedCustomerId(null); setSelectedCustomerCode(""); }}
          />
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Nome do cliente" value={customerName} onChange={(e) => setCustomerName(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground" />
            <input placeholder="Telefone" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground" />
          </div>
          {(deliveryType === "mesa" || deliveryType === "consumo") && (
            <input placeholder="Número da mesa" value={tableNumber} onChange={(e) => setTableNumber(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground" />
          )}
          {deliveryType === "delivery" && (
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="Rua" value={addressStreet} onChange={(e) => setAddressStreet(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground" />
              <input placeholder="Número" value={addressNumber} onChange={(e) => setAddressNumber(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground" />
              <NeighborhoodAutocomplete value={addressNeighborhood}
                onChange={(val) => { setAddressNeighborhood(val); setDeliveryFeeOverridden(false); }}
                placeholder="Bairro" allowInactive={true} className="col-span-2" />
              <input placeholder="Complemento / Quadra / Lote" value={addressComplement} onChange={(e) => setAddressComplement(e.target.value)}
                className="col-span-2 rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground" />
            </div>
          )}
          <textarea placeholder="Observações do pedido" value={observations} onChange={(e) => setObservations(e.target.value)} rows={2}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none" />
        </div>

        {/* Product Search */}
        <div>
          <h2 className="text-sm font-bold text-foreground mb-2">Adicionar Itens</h2>
          <div className="flex items-center gap-2 rounded-xl bg-card border border-border px-3 py-2.5">
            <Search size={16} className="text-muted-foreground" />
            <input placeholder="Buscar produto..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none" />
          </div>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide mt-2 pb-1">
            <button onClick={() => setSelectedCategory(null)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                !selectedCategory ? "bg-primary text-primary-foreground" : "bg-card border border-border text-foreground"
              }`}>Todos</button>
            {categories.map((cat) => (
              <button key={cat.id} onClick={() => setSelectedCategory(cat.id)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  selectedCategory === cat.id ? "bg-primary text-primary-foreground" : "bg-card border border-border text-foreground"
                }`}>{cat.name}</button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {filteredProducts.map((product) => {
              const inCart = cart.find((i) => i.product.id === product.id);
              return (
                <button key={product.id} onClick={() => addToCart(product)}
                  className={`relative rounded-xl border p-3 text-left transition-all ${
                    inCart ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted"
                  }`}>
                  <p className="text-xs font-bold text-foreground line-clamp-2">{product.name}</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <p className="text-xs font-semibold text-primary">R$ {product.price.toFixed(2).replace(".", ",")}</p>
                    {isProductCombo(product) && (
                      <span className="rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-bold text-accent-foreground">
                        COMBO
                      </span>
                    )}
                  </div>
                  {inCart && (
                    <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                      {inCart.quantity}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Cart Items */}
        {cart.length > 0 && (
          <div className="rounded-xl bg-card border border-border p-4 space-y-3">
            <h2 className="text-sm font-bold text-foreground">Itens do Pedido</h2>
            {cart.map((item) => {
              const itemAddonsTotal = item.addons.reduce((s, a) => s + a.price * a.quantity, 0);
              return (
                <div key={item.product.id} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">{item.product.name}</span>
                    <span className="text-sm font-bold text-foreground">
                      R$ {(item.customPrice * item.quantity + itemAddonsTotal).toFixed(2).replace(".", ",")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => updateQuantity(item.product.id, -1)}
                      className="rounded-lg border border-border p-1.5 text-foreground hover:bg-muted"><Minus size={14} /></button>
                    <span className="min-w-[20px] text-center text-sm font-bold text-foreground">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.product.id, 1)}
                      className="rounded-lg border border-border p-1.5 text-foreground hover:bg-muted"><Plus size={14} /></button>
                    <button
                      onClick={() => toggleCombo(item.product.id)}
                      className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-bold transition-all ${
                        item.isCombo
                          ? "bg-accent text-accent-foreground ring-1 ring-accent"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <Package size={12} />
                      Combo
                    </button>
                    <div className="flex items-center gap-1">
                      <Edit2 size={12} className="text-muted-foreground" />
                      <input type="number" step="0.01" value={item.customPrice}
                        onChange={(e) => updateItemPrice(item.product.id, e.target.value)}
                        className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-bold text-foreground text-center" />
                    </div>
                    <input placeholder="Obs" value={item.observations}
                      onChange={(e) => updateItemObs(item.product.id, e.target.value)}
                      className="flex-1 min-w-[80px] rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground" />
                    <button onClick={() => removeItem(item.product.id)}
                      className="rounded-lg p-1.5 text-destructive hover:bg-destructive/10"><Trash2 size={14} /></button>
                  </div>
                  {item.addons.length > 0 && (
                    <div className="ml-2 flex flex-wrap gap-1">
                      {item.addons.map((a) => (
                        <span key={a.addon_id} className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          {a.quantity}x {a.name} (+R$ {(a.price * a.quantity).toFixed(2).replace(".", ",")})
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Addon Selector */}
        {cart.length > 0 && (
          <div className="rounded-xl bg-card border border-border p-4">
            <h2 className="text-sm font-bold text-foreground mb-3">🧩 Adicionais / Combo</h2>
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
          </div>
        )}

        {/* Payment */}
        <div className="rounded-xl bg-card border border-border p-4 space-y-3">
          <h2 className="text-sm font-bold text-foreground">Pagamento</h2>
          <div className="grid grid-cols-3 gap-2">
            {paymentMethods.map((pm) => (
              <button key={pm.id} onClick={() => {
                setPaymentMethod(pm.id);
                if (pm.id === "pix_pago") setIsPaid(true);
                if (pm.id === "pix_entrega") setIsPaid(false);
              }}
                className={`rounded-xl px-3 py-2.5 text-xs font-bold transition-all ${
                  paymentMethod === pm.id ? "bg-primary text-primary-foreground" : "bg-background border border-border text-foreground hover:bg-muted"
                }`}>{pm.label}</button>
            ))}
          </div>
          {(paymentMethod === "pix_entrega" || paymentMethod === "pix_pago") ? (
            <div className="rounded-xl border border-border bg-background px-4 py-3 text-sm font-bold text-foreground">
              {paymentMethod === "pix_pago"
                ? "✅ PIX PAGO: valor já recebido online (total a receber = R$ 0,00)."
                : "💵 PIX ENTREGA: valor será recebido na entrega (total a receber = total do pedido)."}
            </div>
          ) : (
            <label className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 cursor-pointer">
              <input type="checkbox" checked={isPaid} onChange={(e) => setIsPaid(e.target.checked)}
                className="h-5 w-5 rounded border-border accent-primary" />
              <div>
                <span className="text-sm font-bold text-foreground">💰 Já está pago</span>
                <p className="text-xs text-muted-foreground">Nenhum valor a receber na entrega/retirada</p>
              </div>
            </label>
          )}
          {paymentMethod === "dinheiro" && !isPaid && (
            <input type="number" placeholder="Troco para quanto? (R$)" value={changeFor}
              onChange={(e) => setChangeFor(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Bottom Fixed Bar */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur-md px-4 py-3">
          <div className="mx-auto max-w-2xl space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Subtotal (itens + extras)</span>
              <span>R$ {subtotal.toFixed(2).replace(".", ",")}</span>
            </div>
            {deliveryType === "delivery" && (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Entrega</span>
                <div className="flex items-center gap-1">
                  <span>R$</span>
                  <input type="number" step="0.01" value={customDeliveryFee}
                    onChange={(e) => { setCustomDeliveryFee(e.target.value); setDeliveryFeeOverridden(true); }}
                    className="w-20 rounded border border-border bg-background px-2 py-1 text-xs font-bold text-foreground text-right" />
                </div>
              </div>
            )}
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Desconto</span>
              <div className="flex items-center gap-1">
                <span>- R$</span>
                <input type="number" step="0.01" placeholder="0,00" value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className="w-20 rounded border border-border bg-background px-2 py-1 text-xs font-bold text-destructive text-right" />
              </div>
            </div>
            <div className="flex justify-between text-base font-bold text-foreground">
              <span>Total</span>
              <span className="text-primary">R$ {total.toFixed(2).replace(".", ",")}</span>
            </div>
            <button onClick={handleSubmit} disabled={loading || cart.length === 0}
              className="w-full rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground shadow-lg transition-all active:scale-[0.98] disabled:opacity-50">
              {loading ? "Criando..." : `Criar Pedido · R$ ${total.toFixed(2).replace(".", ",")}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminManualOrder;
