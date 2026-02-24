import { Star } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Product } from "@/data/menu";

interface ProductCardProps {
  product: Product;
}

const ProductCard = ({ product }: ProductCardProps) => {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(`/produto/${product.id}`)}
      className="flex w-full gap-3 rounded-xl border border-border bg-card p-3 text-left shadow-sm transition-all active:scale-[0.98]"
    >
      <div className="flex flex-1 flex-col justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-foreground leading-tight">{product.name}</h3>
            {product.popular && (
              <span className="rounded-full bg-fire-gradient px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                🔥 TOP
              </span>
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
        <div className="mt-1 flex items-center gap-1">
          <Star size={12} className="fill-fire-yellow text-fire-yellow" />
          <span className="text-xs text-muted-foreground">
            {product.rating} ({product.ratingCount})
          </span>
        </div>
      </div>
      <img
        src={product.image}
        alt={product.name}
        className="h-24 w-24 flex-shrink-0 rounded-lg object-cover"
        loading="lazy"
      />
    </button>
  );
};

export default ProductCard;
