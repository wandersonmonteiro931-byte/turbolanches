import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Minus, Plus } from "lucide-react";
import { useProducts } from "@/hooks/useMenu";
import type { ProductAddon } from "@/data/menu";
import { useCart } from "@/contexts/CartContext";
import { useStoreStatus } from "@/hooks/useStoreStatus";
import { toast } from "sonner";

const ProductDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addItem } = useCart();
  const { products, loading } = useProducts();
  const { isOpen: storeIsOpen } = useStoreStatus();
  const product = products.find((p) => p.id === id);

  const [quantity, setQuantity] = useState(1);
  const [addonQuantities, setAddonQuantities] = useState<Record<string, number>>({});
  const [observations, setObservations] = useState("");

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Produto não encontrado</p>
      </div>
    );
  }

  const setAddonQty = (addonId: string, qty: number) => {
    setAddonQuantities((prev) => {
      if (qty <= 0) {
        const { [addonId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [addonId]: qty };
    });
  };

  const selectedAddons: ProductAddon[] = product.addons
    .filter((a) => (addonQuantities[a.id] || 0) > 0)
    .map((a) => ({ ...a, quantity: addonQuantities[a.id] }));

  const addonsTotal = selectedAddons.reduce((s, a) => s + a.price * (a.quantity || 1), 0);
  const itemTotal = (product.price + addonsTotal) * quantity;

  const handleAdd = () => {
    if (!storeIsOpen) {
      toast.error("Loja fechada no momento. Não é possível fazer pedidos.");
      return;
    }
    addItem(product, quantity, selectedAddons, observations);
    toast.success(`${product.name} adicionado ao carrinho!`);
    navigate(-1);
  };

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Store closed banner */}
      {!storeIsOpen && (
        <div className="bg-destructive px-4 py-2 text-center">
          <p className="text-xs font-bold text-destructive-foreground">🔴 ESTAMOS FECHADOS NO MOMENTO</p>
        </div>
      )}

      {/* Image */}
      <div className="relative">
        <img src={product.image} alt={product.name} className="h-64 w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/30" />
        <button
          onClick={() => navigate(-1)}
          className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-card/80 backdrop-blur-sm"
        >
          <ArrowLeft size={20} className="text-foreground" />
        </button>
      </div>

      <div className="mx-auto max-w-md px-4 -mt-8 relative z-10">
        {/* Info */}
        <div>
          <h1 className="text-2xl text-fire-gradient break-words">{product.name.toUpperCase()}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{product.description}</p>
          <div className="mt-3 flex items-center gap-3">
            <span className="text-xl font-bold text-primary">
              R$ {product.price.toFixed(2).replace(".", ",")}
            </span>
            {product.originalPrice && (
              <span className="text-sm text-muted-foreground line-through">
                R$ {product.originalPrice.toFixed(2).replace(".", ",")}
              </span>
            )}
          </div>
        </div>

        {/* Addons */}
        {product.addons.length > 0 && (
          <div className="mt-6">
            <h2 className="text-xl text-fire-gradient">ADICIONAIS</h2>
            <p className="text-xs text-muted-foreground">Escolha quantos quiser</p>
            <div className="mt-3 space-y-2">
              {product.addons.map((addon) => {
                const qty = addonQuantities[addon.id] || 0;
                const isSelected = qty > 0;
                return (
                  <div
                    key={addon.id}
                    className={`flex w-full items-center justify-between rounded-lg p-3 transition-all ${
                      isSelected ? "bg-fire-gradient-soft border border-primary/30" : "bg-card"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-foreground">{addon.name}</span>
                      <p className="text-xs font-semibold text-primary">
                        {addon.price > 0 ? `+ R$ ${addon.price.toFixed(2).replace(".", ",")}` : "Grátis"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isSelected && (
                        <button
                          onClick={() => setAddonQty(addon.id, qty - 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-primary text-primary"
                        >
                          <Minus size={14} />
                        </button>
                      )}
                      {isSelected && (
                        <span className="min-w-[20px] text-center text-sm font-bold text-foreground">{qty}</span>
                      )}
                      <button
                        onClick={() => setAddonQty(addon.id, qty + 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Observations */}
        <div className="mt-6">
          <h2 className="text-xl text-fire-gradient">OBSERVAÇÕES</h2>
          <textarea
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            placeholder="Ex: tirar cebola, sem salada..."
            maxLength={140}
            className="mt-2 w-full rounded-lg bg-card p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            rows={3}
          />
          <p className="mt-1 text-right text-xs text-muted-foreground">{observations.length}/140</p>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card p-4 safe-bottom">
        <div className="mx-auto flex max-w-md items-center gap-4">
          <div className="flex items-center gap-3 rounded-lg bg-secondary px-3 py-2">
            <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="text-primary">
              <Minus size={18} />
            </button>
            <span className="min-w-[20px] text-center font-bold text-foreground">{quantity}</span>
            <button onClick={() => setQuantity(quantity + 1)} className="text-primary">
              <Plus size={18} />
            </button>
          </div>
          <button
            onClick={handleAdd}
            disabled={!storeIsOpen}
            className={`flex-1 rounded-xl py-3 text-center font-bold shadow-fire transition-all active:scale-[0.98] ${
              storeIsOpen
                ? "bg-fire-gradient text-primary-foreground"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            }`}
          >
            {storeIsOpen
              ? `Adicionar R$ ${itemTotal.toFixed(2).replace(".", ",")}`
              : "🔴 Loja Fechada"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductDetail;
