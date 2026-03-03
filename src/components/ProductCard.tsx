import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import type { Product } from "@/data/menu";

interface ProductCardProps {
  product: Product;
  index?: number;
  storeIsOpen?: boolean;
}

const ProductCard = ({ product, index = 0, storeIsOpen = true }: ProductCardProps) => {
  const navigate = useNavigate();

  const isSoldOut = product.active === false;

  const handleClick = () => {
    if (isSoldOut) {
      toast.error("Este produto está esgotado no momento.");
      return;
    }
    if (!storeIsOpen) {
      toast.error("Loja fechada no momento. Não é possível fazer pedidos.");
      return;
    }
    navigate(`/produto/${product.id}`);
  };

  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: "easeOut" }}
      whileHover={{ scale: 1.02, boxShadow: "0 8px 24px -8px hsl(355 85% 52% / 0.18)" }}
      whileTap={{ scale: 0.97 }}
      onClick={handleClick}
      className={`flex w-full gap-3 rounded-xl border border-border bg-card p-3 text-left shadow-sm transition-colors ${isSoldOut || !storeIsOpen ? "opacity-60" : ""}`}
    >
      <div className="flex flex-1 flex-col justify-between min-w-0">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-foreground leading-tight line-clamp-2">{product.name}</h3>
            {isSoldOut && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                ESGOTADO
              </span>
            )}
            {product.popular && (
              <motion.span
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="rounded-full bg-fire-gradient px-2 py-0.5 text-[10px] font-bold text-primary-foreground"
              >
                🔥 TOP
              </motion.span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{product.description}</p>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-sm font-bold text-primary">
            R$ {product.price.toFixed(2).replace(".", ",")}
          </span>
          {product.originalPrice && (
            <span className="text-xs text-muted-foreground line-through">
              R$ {product.originalPrice.toFixed(2).replace(".", ",")}
            </span>
          )}
        </div>
      </div>
      <div className="relative h-24 w-24 flex-shrink-0">
        <motion.img
          whileHover={{ scale: 1.08 }}
          transition={{ duration: 0.3 }}
          src={product.image}
          alt={product.name}
          className={`h-full w-full rounded-lg object-cover ${isSoldOut ? "grayscale" : ""}`}
          loading="lazy"
        />
        {isSoldOut && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/60">
            <span className="text-xs font-bold text-muted-foreground">Esgotado</span>
          </div>
        )}
      </div>
    </motion.button>
  );
};

export default ProductCard;
