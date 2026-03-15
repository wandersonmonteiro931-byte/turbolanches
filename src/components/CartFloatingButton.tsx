import { useNavigate } from "react-router-dom";
import { ShoppingBag } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useCart } from "@/contexts/CartContext";

const CartFloatingButton = () => {
  const { totalItems, totalPrice } = useCart();
  const navigate = useNavigate();

  return (
    <AnimatePresence>
      {totalItems > 0 && (
        <motion.button
          initial={{ y: 80, opacity: 0, scale: 0.9 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 80, opacity: 0, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => navigate("/carrinho")}
          className="fixed bottom-20 left-4 right-4 z-40 mx-auto flex max-w-md items-center justify-between rounded-xl bg-blue-600 px-5 py-3.5 shadow-lg"
        >
          <div className="flex items-center gap-2">
            <ShoppingBag size={20} className="text-primary-foreground" />
            <motion.span
              key={totalItems}
              initial={{ scale: 1.4 }}
              animate={{ scale: 1 }}
              className="rounded-md bg-primary-foreground/20 px-2 py-0.5 text-sm font-bold text-primary-foreground"
            >
              {totalItems}
            </motion.span>
          </div>
          <span className="text-sm font-bold text-primary-foreground">Ver Carrinho</span>
          <span className="text-sm font-bold text-primary-foreground">
            R$ {totalPrice.toFixed(2).replace(".", ",")}
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  );
};

export default CartFloatingButton;
