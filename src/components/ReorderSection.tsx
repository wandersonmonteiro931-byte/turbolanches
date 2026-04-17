import { useEffect, useState } from "react";
import { RefreshCw, Star } from "lucide-react";
import { useNavigate } from "react-router-dom";
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
  addons_json: unknown;
  product_id: string | null;
}

interface CurrentProductRow {
  id: string;
  name: string;
  description: string | null;
  price: number;
  original_price: number | null;
  image_url: string | null;
  category_id: string | null;
  popular: boolean;
  active: boolean;
}

interface CurrentAddonRow {
  id: string;
  name: string;
  price: number;
  active: boolean;
}

interface StoredAddon {
  id?: string;
  name?: string;
  price?: number;
  quantity?: number;
}

const isStoredAddon = (value: unknown): value is StoredAddon =>
  Boolean(value) && typeof value === "object";

const getStoredAddons = (value: unknown): StoredAddon[] =>
  Array.isArray(value) ? value.filter(isStoredAddon) : [];

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
  const { addItem, clearCart, setAppliedCoupon } = useCart();
  const navigate = useNavigate();
  const [lastOrder, setLastOrder] = useState<LastOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [hasPendingReview, setHasPendingReview] = useState(false);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      setHasPendingReview(false);
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
        setHasPendingReview(false);
        return;
      }

      const order = orders[0];
      const [{ data: items }, { data: existingReview }] = await Promise.all([
        supabase
          .from("order_items")
          .select("product_name, quantity, unit_price, observations, addons_json, product_id")
          .eq("order_id", order.id),
        supabase
          .from("reviews")
          .select("id")
          .eq("order_id", order.id)
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      setLastOrder({
        ...order,
        items: (items || []) as LastOrderItem[],
      });
      setHasPendingReview(!existingReview);
      setLoading(false);
    };

    fetchLastOrder();
  }, [user]);

  if (!user || loading || !lastOrder) return null;

  const handleReorder = async () => {
    setAdding(true);
    try {
      // Clear cart and remove any coupons/discounts — reorder is items-only
      clearCart();
      setAppliedCoupon(null);

      const productIds = lastOrder.items
        .map((i) => i.product_id)
        .filter(Boolean) as string[];

      const normalizedItems = lastOrder.items.map((item) => ({
        ...item,
        addons: getStoredAddons(item.addons_json),
      }));

      const addonIds = normalizedItems.flatMap((item) =>
        item.addons
          .map((addon) => addon.id)
          .filter((addonId): addonId is string => typeof addonId === "string" && addonId.length > 0),
      );

      const uniqueProductNames = [...new Set(normalizedItems.map((item) => item.product_name.trim()).filter(Boolean))];

      const productByIdRequest = productIds.length > 0
        ? supabase
            .from("products")
            .select("id, name, description, price, original_price, image_url, category_id, popular, active")
            .in("id", productIds)
        : Promise.resolve({ data: [] as CurrentProductRow[] });

      const productByNameRequest = uniqueProductNames.length > 0
        ? supabase
            .from("products")
            .select("id, name, description, price, original_price, image_url, category_id, popular, active")
            .in("name", uniqueProductNames)
        : Promise.resolve({ data: [] as CurrentProductRow[] });

      const addonRequest = addonIds.length > 0
        ? supabase
            .from("product_addons")
            .select("id, name, price, active")
            .in("id", addonIds)
        : Promise.resolve({ data: [] as CurrentAddonRow[] });

      const [{ data: currentProductsById }, { data: currentProductsByName }, { data: currentAddons }] = await Promise.all([
        productByIdRequest,
        productByNameRequest,
        addonRequest,
      ]);

      const productMap = new Map(
        ([...(currentProductsByName || []), ...(currentProductsById || [])] as CurrentProductRow[]).map((p) => [p.id, p])
      );

      const productNameMap = new Map(
        ([...(currentProductsByName || []), ...(currentProductsById || [])] as CurrentProductRow[]).map((p) => [p.name.trim().toLowerCase(), p])
      );

      const addonMap = new Map(
        (currentAddons || []).map((addon) => [addon.id, addon])
      );

      let addedCount = 0;
      for (const item of normalizedItems) {
        const dbProduct = item.product_id
          ? productMap.get(item.product_id)
          : productNameMap.get(item.product_name.trim().toLowerCase()) || null;

        // Use current DB price, not the historical order price
        const product: Product = dbProduct
          ? {
              id: dbProduct.id,
              name: dbProduct.name,
              description: "",
              price: dbProduct.price,
              originalPrice: dbProduct.original_price ?? undefined,
              image: dbProduct.image_url || "/placeholder.svg",
              category: dbProduct.category_id || "",
              rating: 0,
              ratingCount: 0,
              popular: dbProduct.popular,
              active: dbProduct.active,
              ingredients: [],
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
              ingredients: [],
              addons: [],
            };

        if (dbProduct && !dbProduct.active) continue;

        const addons: ProductAddon[] = item.addons.length > 0
          ? item.addons
              .filter((addon) => {
                if (!addon?.id) return true;
                const currentAddon = addonMap.get(addon.id);
                return !currentAddon || currentAddon.active !== false;
              })
              .map((addon) => {
                const currentAddon = addon?.id ? addonMap.get(addon.id) : null;

                return {
                  id: currentAddon?.id || addon.id || crypto.randomUUID(),
                   name: currentAddon?.name || addon.name || "Adicional",
                  price:
                    typeof currentAddon?.price === "number"
                      ? currentAddon.price
                      : typeof addon?.price === "number"
                        ? addon.price
                        : 0,
                  quantity: addon.quantity || 1,
                };
              })
          : [];

        addItem(product, item.quantity, addons, item.observations || "");
        addedCount++;
      }

      if (addedCount > 0) {
        toast.success(`${addedCount} item(ns) adicionado(s) ao carrinho com preços atuais! Cupons e descontos anteriores foram removidos.`);
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

  const formattedOrderNumber = String(lastOrder.order_number).padStart(5, "0");

  return (
    <div className="mt-5">
      {hasPendingReview && (
        <div className="mb-3 rounded-2xl border border-border bg-background px-3 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Star size={18} className="fill-primary text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-foreground">Avalie seu último pedido</p>
              <p className="text-xs text-muted-foreground break-words">
                O pedido #{formattedOrderNumber} ainda não foi avaliado.
              </p>
            </div>
            <button
              onClick={() => navigate(`/pedido/${lastOrder.id}`)}
              className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground active:scale-[0.98]"
            >
              Avaliar
            </button>
          </div>
        </div>
      )}

      {lastOrder.items.length > 0 && (
        <>
          <h2 className="mb-2 text-sm font-bold text-foreground">Pedir de novo</h2>
          <button
            onClick={handleReorder}
            disabled={adding}
            className="flex w-full items-center gap-3 rounded-xl border border-border bg-background p-3 text-left transition-all active:scale-[0.98] disabled:opacity-60"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <RefreshCw size={18} className="text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">
                Pedido #{formattedOrderNumber} • {formatDate(lastOrder.created_at)}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {lastOrder.items.map((i) => `${i.quantity}x ${i.product_name}`).join(", ")}
              </p>
            </div>
            <span className="shrink-0 rounded-lg bg-fire-gradient px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-sm">
              {adding ? "..." : "Repetir"}
            </span>
          </button>
        </>
      )}
    </div>
  );
}
