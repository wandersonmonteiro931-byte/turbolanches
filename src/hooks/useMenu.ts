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
      const [productsRes, addonsRes, linksRes] = await Promise.all([
        supabase
          .from("products")
          .select("id, name, description, price, original_price, image_url, category_id, popular, active, sort_order")
          .order("sort_order")
          .order("name"),
        supabase
          .from("product_addons")
          .select("id, name, price, product_id, apply_to_all, sort_order")
          .eq("active", true)
          .order("sort_order"),
        supabase
          .from("addon_product_links")
          .select("addon_id, product_id"),
      ]);

      // Build a map: addon_id -> list of product_ids it's linked to
      const linksMap = new Map<string, string[]>();
      if (linksRes.data) {
        for (const link of linksRes.data) {
          const list = linksMap.get(link.addon_id) || [];
          list.push(link.product_id);
          linksMap.set(link.addon_id, list);
        }
      }

      // Build per-product addons map
      const addonsMap = new Map<string, ProductAddon[]>();
      const globalAddons: ProductAddon[] = [];

      if (addonsRes.data) {
        for (const a of addonsRes.data) {
          const addon: ProductAddon = { id: a.id, name: a.name, price: a.price };
          if (a.apply_to_all) {
            globalAddons.push(addon);
          } else if (a.product_id) {
            // Legacy: direct product_id reference
            const list = addonsMap.get(a.product_id) || [];
            list.push(addon);
            addonsMap.set(a.product_id, list);
          } else {
            // New: linked via junction table
            const linkedProducts = linksMap.get(a.id) || [];
            for (const pid of linkedProducts) {
              const list = addonsMap.get(pid) || [];
              list.push(addon);
              addonsMap.set(pid, list);
            }
          }
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
            active: p.active,
            addons: [...globalAddons, ...(addonsMap.get(p.id) || [])],
          }))
        );
      }
      setLoading(false);
    };
    fetch();
  }, []);

  return { products, loading };
}
