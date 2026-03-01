import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Minus, Trash2, Search, ShoppingBag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import NeighborhoodAutocomplete from "@/components/NeighborhoodAutocomplete";

interface Product {
  id: string;
  name: string;
  price: number;
  category_id: string | null;
  image_url: string | null;
}

interface Category {
  id: string;
  name: string;
  sort_order: number;
}

interface CartItem {
  product: Product;
  quantity: number;
  observations: string;
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
  { id: "pix", label: "📱 PIX" },
  { id: "cartao", label: "💳 Cartão" },
  { id: "credito", label: "💳 Crédito" },
  { id: "debito", label: "💳 Débito" },
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
  const [tableNumber, setTableNumber] = useState("");
  const [addressStreet, setAddressStreet] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [addressNeighborhood, setAddressNeighborhood] = useState("");
  const [addressComplement, setAddressComplement] = useState("");
  const [observations, setObservations] = useState("");
  const [changeFor, setChangeFor] = useState("");
  const [loading, setLoading] = useState(false);
  const [deliveryZones, setDeliveryZones] = useState<{ neighborhood: string; delivery_fee: number }[]>([]);

  useEffect(() => {
    const load = async () => {
      const [prodRes, catRes, zonesRes] = await Promise.all([
        supabase.from("products").select("id, name, price, category_id, image_url").eq("active", true),
        supabase.from("categories").select("id, name, sort_order").eq("active", true).order("sort_order"),
        supabase.from("delivery_zones").select("neighborhood, delivery_fee"),
      ]);
      if (prodRes.data) setProducts(prodRes.data);
      if (catRes.data) setCategories(catRes.data);
      if (zonesRes.data) setDeliveryZones(zonesRes.data);
    };
    load();
  }, []);

  const filteredProducts = products.filter((p) => {
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !selectedCategory || p.category_id === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { product, quantity: 1, observations: "" }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev.map((i) => i.product.id === productId ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i)
        .filter((i) => i.quantity > 0)
    );
  };

  const removeItem = (productId: string) => {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
  };

  const updateItemObs = (productId: string, obs: string) => {
    setCart((prev) => prev.map((i) => i.product.id === productId ? { ...i, observations: obs } : i));
  };

  const subtotal = cart.reduce((sum, i) => sum + i.product.price * i.quantity, 0);
  const matchedZone = deliveryZones.find((z) => z.neighborhood.toLowerCase() === addressNeighborhood.toLowerCase());
  const deliveryFee = deliveryType === "delivery" ? (matchedZone ? Number(matchedZone.delivery_fee) : 5.99) : 0;
  const total = subtotal + deliveryFee;

  const handleSubmit = async () => {
    if (cart.length === 0) {
      toast.error("Adicione pelo menos um item");
      return;
    }
    if (!user) {
      toast.error("Você precisa estar logado");
      return;
    }
    if (deliveryType === "delivery" && (!addressStreet || !addressNeighborhood)) {
      toast.error("Preencha o endereço para delivery");
      return;
    }

    setLoading(true);
    try {
      const isFiado = paymentMethod === "fiado";

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: user.id,
          subtotal,
          delivery_fee: deliveryFee,
          total,
          status: "preparing",
          preparing_at: new Date().toISOString(),
          delivery_type: deliveryType,
          payment_method: paymentMethod,
          payment_confirmed: isPaid || isFiado,
          address_street: deliveryType === "delivery" ? addressStreet : null,
          address_number: deliveryType === "delivery" ? addressNumber : null,
          address_complement: deliveryType === "delivery" ? addressComplement : null,
          address_neighborhood: deliveryType === "delivery" ? addressNeighborhood : null,
          observations: [
            customerName ? `Cliente: ${customerName}` : null,
            customerPhone ? `Tel: ${customerPhone}` : null,
            tableNumber ? `Mesa: ${tableNumber}` : null,
            observations || null,
          ].filter(Boolean).join(" | ") || null,
          change_for: paymentMethod === "dinheiro" && changeFor ? Number(changeFor) : null,
        })
        .select("id, order_number")
        .single();

      if (orderError) throw orderError;

      const orderItems = cart.map((item) => ({
        order_id: order.id,
        product_id: item.product.id,
        product_name: item.product.name,
        quantity: item.quantity,
        unit_price: item.product.price,
        observations: item.observations || null,
      }));

      const { error: itemsError } = await supabase.from("order_items").insert(orderItems);
      if (itemsError) throw itemsError;

      toast.success(`Pedido #${String(order.order_number).padStart(5, "0")} criado!`);

      // Impressão automática da comanda de cozinha
      const printUrl = `/admin/imprimir/${order.id}?tipo=cozinha`;
      window.open(printUrl, "_blank", "width=300,height=600");

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
      {/* Header */}
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-background/95 px-4 py-3 backdrop-blur-md border-b border-border">
        <button onClick={() => navigate("/admin")}>
          <ArrowLeft size={20} className="text-foreground" />
        </button>
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
              <button
                key={dt.id}
                onClick={() => setDeliveryType(dt.id)}
                className={`rounded-xl px-3 py-3 text-center text-xs font-bold transition-all ${
                  deliveryType === dt.id
                    ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                    : "bg-card border border-border text-foreground hover:bg-muted"
                }`}
              >
                <div className="text-lg">{dt.label.split(" ")[0]}</div>
                <div className="mt-0.5">{dt.label.split(" ").slice(1).join(" ")}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Customer Info */}
        <div className="rounded-xl bg-card border border-border p-4 space-y-3">
          <h2 className="text-sm font-bold text-foreground">Informações</h2>
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="Nome do cliente"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground"
            />
            <input
              placeholder="Telefone"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>
          {(deliveryType === "mesa" || deliveryType === "consumo") && (
            <input
              placeholder="Número da mesa"
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground"
            />
          )}
          {deliveryType === "delivery" && (
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="Rua" value={addressStreet} onChange={(e) => setAddressStreet(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground" />
              <input placeholder="Número" value={addressNumber} onChange={(e) => setAddressNumber(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground" />
              <NeighborhoodAutocomplete
                value={addressNeighborhood}
                onChange={(val, fee) => {
                  setAddressNeighborhood(val);
                }}
                placeholder="Bairro"
                allowInactive={true}
                className="col-span-2"
              />
              <input placeholder="Complemento / Quadra / Lote" value={addressComplement} onChange={(e) => setAddressComplement(e.target.value)}
                className="col-span-2 rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground" />
            </div>
          )}
          <textarea
            placeholder="Observações do pedido"
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none"
          />
        </div>

        {/* Product Search */}
        <div>
          <h2 className="text-sm font-bold text-foreground mb-2">Adicionar Itens</h2>
          <div className="flex items-center gap-2 rounded-xl bg-card border border-border px-3 py-2.5">
            <Search size={16} className="text-muted-foreground" />
            <input
              placeholder="Buscar produto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>

          {/* Category Filter */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide mt-2 pb-1">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                !selectedCategory ? "bg-primary text-primary-foreground" : "bg-card border border-border text-foreground"
              }`}
            >
              Todos
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  selectedCategory === cat.id ? "bg-primary text-primary-foreground" : "bg-card border border-border text-foreground"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Product Grid */}
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {filteredProducts.map((product) => {
              const inCart = cart.find((i) => i.product.id === product.id);
              return (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className={`relative rounded-xl border p-3 text-left transition-all ${
                    inCart ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted"
                  }`}
                >
                  <p className="text-xs font-bold text-foreground line-clamp-2">{product.name}</p>
                  <p className="mt-1 text-xs font-semibold text-primary">
                    R$ {product.price.toFixed(2).replace(".", ",")}
                  </p>
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
            {cart.map((item) => (
              <div key={item.product.id} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{item.product.name}</span>
                  <span className="text-sm font-bold text-foreground">
                    R$ {(item.product.price * item.quantity).toFixed(2).replace(".", ",")}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => updateQuantity(item.product.id, -1)}
                    className="rounded-lg border border-border p-1.5 text-foreground hover:bg-muted">
                    <Minus size={14} />
                  </button>
                  <span className="min-w-[20px] text-center text-sm font-bold text-foreground">{item.quantity}</span>
                  <button onClick={() => updateQuantity(item.product.id, 1)}
                    className="rounded-lg border border-border p-1.5 text-foreground hover:bg-muted">
                    <Plus size={14} />
                  </button>
                  <input
                    placeholder="Obs do item"
                    value={item.observations}
                    onChange={(e) => updateItemObs(item.product.id, e.target.value)}
                    className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground"
                  />
                  <button onClick={() => removeItem(item.product.id)}
                    className="rounded-lg p-1.5 text-destructive hover:bg-destructive/10">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Payment */}
        <div className="rounded-xl bg-card border border-border p-4 space-y-3">
          <h2 className="text-sm font-bold text-foreground">Pagamento</h2>
          <div className="grid grid-cols-3 gap-2">
            {paymentMethods.map((pm) => (
              <button
                key={pm.id}
                onClick={() => setPaymentMethod(pm.id)}
                className={`rounded-xl px-3 py-2.5 text-xs font-bold transition-all ${
                  paymentMethod === pm.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-background border border-border text-foreground hover:bg-muted"
                }`}
              >
                {pm.label}
              </button>
            ))}
          </div>
          {/* Paid checkbox */}
          <label className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isPaid}
              onChange={(e) => setIsPaid(e.target.checked)}
              className="h-5 w-5 rounded border-border accent-primary"
            />
            <div>
              <span className="text-sm font-bold text-foreground">💰 Já está pago</span>
              <p className="text-xs text-muted-foreground">Nenhum valor a receber na entrega/retirada</p>
            </div>
          </label>
          {paymentMethod === "dinheiro" && !isPaid && (
            <input
              type="number"
              placeholder="Troco para quanto? (R$)"
              value={changeFor}
              onChange={(e) => setChangeFor(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground"
            />
          )}
        </div>
      </div>

      {/* Bottom Fixed Bar */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur-md px-4 py-3">
          <div className="mx-auto max-w-2xl space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Subtotal</span>
              <span>R$ {subtotal.toFixed(2).replace(".", ",")}</span>
            </div>
            {deliveryFee > 0 && (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Entrega</span>
                <span>R$ {deliveryFee.toFixed(2).replace(".", ",")}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-foreground">
              <span>Total</span>
              <span className="text-primary">R$ {total.toFixed(2).replace(".", ",")}</span>
            </div>
            <button
              onClick={handleSubmit}
              disabled={loading || cart.length === 0}
              className="w-full rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground shadow-lg transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? "Criando..." : `Criar Pedido · R$ ${total.toFixed(2).replace(".", ",")}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminManualOrder;
