import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Product, ProductAddon } from "@/data/menu";

interface LastOrderItem {
  product_name: string;
  quantity: number;
  unit_price: number;
  observations: string | null;
  addons_json: any;
  product_id: string | null;
}

interface LastOrder {
  id: string;
  order_number: number;
  payment_method: string;
  delivery_type: string;
  created_at: string;
  items: LastOrderItem[];
}

export default function ReorderSection() {
  const { user } = useAuth();
  const { addItem } = useCart();
  const [lastOrder, setLastOrder] = useState<LastOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchLastOrder = async () => {
      const { data: orders } = await supabase
        .from("orders")
        .select("id, order_number, payment_method, delivery_type, created_at")
        .eq("user_id", user.id)
        .eq("status", "delivered")
        .order("created_at", { ascending: false })
        .limit(1);

      if (!orders || orders.length === 0) {
        setLoading(false);
        return;
      }

      const order = orders[0];
      const { data: items } = await supabase
        .from("order_items")
        .select("product_name, quantity, unit_price, observations, addons_json, product_id")
        .eq("order_id", order.id);

      setLastOrder({
        ...order,
        items: (items || []) as LastOrderItem[],
      });
      setLoading(false);
    };

    fetchLastOrder();
  }, [user]);

  if (!user || loading || !lastOrder || lastOrder.items.length === 0) return null;

  const handleReorder = async () => {
    setAdding(true);
    try {
      // Fetch current products to get up-to-date prices and images
      const productIds = lastOrder.items
        .map((i) => i.product_id)
        .filter(Boolean) as string[];

      const { data: currentProducts } = productIds.length > 0
        ? await supabase
            .from("products")
            .select("id, name, description, price, original_price, image_url, category_id, popular, active")
            .in("id", productIds)
        : { data: [] };

      const productMap = new Map(
        (currentProducts || []).map((p: any) => [p.id, p])
      );

      let addedCount = 0;
      for (const item of lastOrder.items) {
        const dbProduct = item.product_id ? productMap.get(item.product_id) : null;

        const product: Product = dbProduct
          ? {
              id: dbProduct.id,
              name: dbProduct.name,
              description: dbProduct.description || "",
              price: dbProduct.price,
              originalPrice: dbProduct.original_price ?? undefined,
              image: dbProduct.image_url || "/placeholder.svg",
              category: dbProduct.category_id || "",
              rating: 0,
              ratingCount: 0,
              popular: dbProduct.popular,
              active: dbProduct.active,
              addons: [],
            }
          : {
              id: item.product_id || crypto.randomUUID(),
              name: item.product_name,
              description: "",
              price: item.unit_price,
              image: "/placeholder.svg",
              category: "",
              rating: 0,
              ratingCount: 0,
              addons: [],
            };

        if (dbProduct && !dbProduct.active) continue;

        const addons: ProductAddon[] = Array.isArray(item.addons_json)
          ? item.addons_json.map((a: any) => ({
              id: a.id || crypto.randomUUID(),
              name: a.name,
              price: a.price || 0,
              quantity: a.quantity || 1,
            }))
          : [];

        addItem(product, item.quantity, addons, item.observations || "");
        addedCount++;
      }

      if (addedCount > 0) {
        toast.success(`${addedCount} item(ns) adicionado(s) ao carrinho! A taxa de entrega será calculada com os valores atuais.`);
      } else {
        toast.error("Nenhum item disponível para repetir.");
      }
    } catch {
      toast.error("Erro ao repetir pedido.");
    } finally {
      setAdding(false);
    }
  };

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    });

  return (
    <div className="mt-5">
      <h2 className="text-sm font-bold text-foreground mb-2">Pedir de novo</h2>
      <button
        onClick={handleReorder}
        disabled={adding}
        className="flex w-full items-center gap-3 rounded-xl border border-border bg-background p-3 text-left transition-all active:scale-[0.98] disabled:opacity-60"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <RefreshCw size={18} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">
            Pedido #{String(lastOrder.order_number).padStart(5, "0")} • {formatDate(lastOrder.created_at)}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {lastOrder.items.map((i) => `${i.quantity}x ${i.product_name}`).join(", ")}
          </p>
        </div>
        <span className="shrink-0 rounded-lg bg-fire-gradient px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-sm">
          {adding ? "..." : "Repetir"}
        </span>
      </button>
    </div>
  );
}
