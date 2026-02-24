import { useNavigate } from "react-router-dom";
import { ShoppingBag } from "lucide-react";
import { useCart } from "@/contexts/CartContext";

const CartFloatingButton = () => {
  const { totalItems, totalPrice } = useCart();
  const navigate = useNavigate();

  if (totalItems === 0) return null;

  return (
    <button
      onClick={() => navigate("/carrinho")}
      className="fixed bottom-20 left-4 right-4 z-40 mx-auto flex max-w-md items-center justify-between rounded-xl bg-fire-gradient px-5 py-3.5 shadow-fire-lg transition-all active:scale-[0.98] animate-slide-up"
    >
      <div className="flex items-center gap-2">
        <ShoppingBag size={20} className="text-primary-foreground" />
        <span className="rounded-md bg-primary-foreground/20 px-2 py-0.5 text-sm font-bold text-primary-foreground">
          {totalItems}
        </span>
      </div>
      <span className="text-sm font-bold text-primary-foreground">Ver Carrinho</span>
      <span className="text-sm font-bold text-primary-foreground">
        R$ {totalPrice.toFixed(2).replace(".", ",")}
      </span>
    </button>
  );
};

export default CartFloatingButton;
