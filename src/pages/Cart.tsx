import { ArrowLeft, Minus, Plus, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCart } from "@/contexts/CartContext";
import { toast } from "sonner";

const Cart = () => {
  const navigate = useNavigate();
  const { items, updateQuantity, removeItem, clearCart, totalPrice } = useCart();

  const deliveryFee = totalPrice >= 60 ? 0 : 5.99;
  const grandTotal = totalPrice + deliveryFee;

  if (items.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <span className="text-6xl">🛒</span>
        <h2 className="mt-4 text-2xl text-fire-gradient">CARRINHO VAZIO</h2>
        <p className="mt-2 text-sm text-muted-foreground">Adicione itens deliciosos do cardápio!</p>
        <button
          onClick={() => navigate("/")}
          className="mt-6 rounded-xl bg-fire-gradient px-8 py-3 font-bold text-primary-foreground shadow-fire"
        >
          Ver Cardápio
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-36">
      {/* Header */}
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-background/90 px-4 py-4 backdrop-blur-md">
        <button onClick={() => navigate(-1)}>
          <ArrowLeft size={22} className="text-foreground" />
        </button>
        <h1 className="text-2xl text-fire-gradient">CARRINHO</h1>
      </header>

      <div className="mx-auto max-w-md px-4 space-y-3">
        {items.map((item, index) => {
          const addonsTotal = item.selectedAddons.reduce((s, a) => s + a.price, 0);
          const lineTotal = (item.product.price + addonsTotal) * item.quantity;
          return (
            <div key={index} className="rounded-xl bg-card p-4">
              <div className="flex gap-3">
                <img src={item.product.image} alt={item.product.name} className="h-16 w-16 rounded-lg object-cover" />
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground text-sm">{item.product.name}</h3>
                  {item.selectedAddons.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      + {item.selectedAddons.map((a) => a.name).join(", ")}
                    </p>
                  )}
                  {item.observations && (
                    <p className="text-xs text-muted-foreground italic mt-0.5">"{item.observations}"</p>
                  )}
                  <p className="mt-1 text-sm font-bold text-primary">
                    R$ {lineTotal.toFixed(2).replace(".", ",")}
                  </p>
                </div>
                <button onClick={() => removeItem(index)} className="self-start text-muted-foreground">
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="mt-3 flex items-center justify-end gap-3">
                <button
                  onClick={() => updateQuantity(index, item.quantity - 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-primary text-primary"
                >
                  <Minus size={14} />
                </button>
                <span className="min-w-[20px] text-center font-bold text-foreground">{item.quantity}</span>
                <button
                  onClick={() => updateQuantity(index, item.quantity + 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          );
        })}

        {/* Summary */}
        <div className="mt-4 rounded-xl bg-card p-4 space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Subtotal</span>
            <span>R$ {totalPrice.toFixed(2).replace(".", ",")}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Taxa de entrega</span>
            <span className={deliveryFee === 0 ? "font-semibold text-green-500" : "text-muted-foreground"}>
              {deliveryFee === 0 ? "Grátis" : `R$ ${deliveryFee.toFixed(2).replace(".", ",")}`}
            </span>
          </div>
          {deliveryFee > 0 && (
            <p className="text-xs text-primary">
              🔥 Frete grátis acima de R$ 60,00! Faltam R$ {(60 - totalPrice).toFixed(2).replace(".", ",")}
            </p>
          )}
          <div className="border-t border-border pt-2 flex justify-between text-lg font-bold">
            <span className="text-foreground">Total</span>
            <span className="text-primary">R$ {grandTotal.toFixed(2).replace(".", ",")}</span>
          </div>
        </div>
      </div>

      {/* Bottom button */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card p-4 safe-bottom">
        <div className="mx-auto max-w-md">
          <button
            onClick={() => {
              toast.success("Pedido enviado com sucesso! 🔥");
              clearCart();
              navigate("/");
            }}
            className="w-full rounded-xl bg-fire-gradient py-4 text-center font-bold text-primary-foreground shadow-fire-lg transition-all active:scale-[0.98]"
          >
            Finalizar Pedido • R$ {grandTotal.toFixed(2).replace(".", ",")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Cart;
