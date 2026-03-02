import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Product, ProductAddon, Category } from "@/data/menu";

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("categories")
        .select("id, name, icon, image_url, sort_order")
        .eq("active", true)
        .order("sort_order");
      if (data) {
        setCategories(
          data.map((c: any) => ({
            id: c.id,
            name: c.name,
            icon: c.icon || "📦",
            image: c.image_url || "/placeholder.svg",
          }))
        );
      }
      setLoading(false);
    };
    fetch();
  }, []);

  return { categories, loading };
}

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const [productsRes, addonsRes] = await Promise.all([
        supabase
          .from("products")
          .select("id, name, description, price, original_price, image_url, category_id, popular, active, sort_order")
          .eq("active", true)
          .order("sort_order")
          .order("name"),
        supabase
          .from("product_addons")
          .select("id, name, price, product_id")
          .eq("active", true),
      ]);

      const addonsMap = new Map<string, ProductAddon[]>();
      if (addonsRes.data) {
        for (const a of addonsRes.data) {
          const list = addonsMap.get(a.product_id) || [];
          list.push({ id: a.id, name: a.name, price: a.price });
          addonsMap.set(a.product_id, list);
        }
      }

      if (productsRes.data) {
        setProducts(
          productsRes.data.map((p: any) => ({
            id: p.id,
            name: p.name,
            description: p.description || "",
            price: p.price,
            originalPrice: p.original_price ?? undefined,
            image: p.image_url || "/placeholder.svg",
            category: p.category_id || "",
            rating: 0,
            ratingCount: 0,
            popular: p.popular,
            addons: addonsMap.get(p.id) || [],
          }))
        );
      }
      setLoading(false);
    };
    fetch();
  }, []);

  return { products, loading };
}
