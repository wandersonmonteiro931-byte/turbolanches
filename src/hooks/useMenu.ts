import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/contexts/StoreContext";
import type { Product, ProductAddon, Category } from "@/data/menu";

export function useCategories() {
  const { storeId } = useStore();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      let query = supabase
        .from("categories")
        .select("id, name, icon, image_url, sort_order")
        .eq("active", true)
        .order("sort_order");

      if (storeId) query = query.eq("store_id", storeId);

      const { data } = await query;
      if (data) {
        setCategories(
          data.map((c: any) => ({
            id: c.id,
            name: c.name,
            icon: c.icon || "",
            image: c.image_url || "/placeholder.svg",
          }))
        );
      }
      setLoading(false);
    };
    fetch();
  }, [storeId]);

  return { categories, loading };
}

export function useProducts() {
  const { storeId } = useStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      let productsQuery = supabase
        .from("products")
        .select("id, name, description, price, original_price, image_url, category_id, popular, active, sort_order, is_combo, combo_item_count")
        .order("sort_order")
        .order("name");

      let addonsQuery = supabase
        .from("product_addons")
        .select("id, name, price, product_id, apply_to_all, sort_order")
        .eq("active", true)
        .order("sort_order");

      let categoriesQuery = supabase
        .from("categories")
        .select("id, name")
        .eq("active", true);

      if (storeId) {
        productsQuery = productsQuery.eq("store_id", storeId);
        addonsQuery = addonsQuery.eq("store_id", storeId);
        categoriesQuery = categoriesQuery.eq("store_id", storeId);
      }

      const [productsRes, addonsRes, linksRes, categoriesRes, prodIngRes, ingRes] = await Promise.all([
        productsQuery,
        addonsQuery,
        supabase.from("addon_product_links").select("addon_id, product_id"),
        categoriesQuery,
        storeId
          ? supabase.from("product_ingredients").select("product_id, ingredient_id").eq("store_id", storeId)
          : supabase.from("product_ingredients").select("product_id, ingredient_id"),
        storeId
          ? supabase.from("ingredients").select("id, name").eq("store_id", storeId)
          : supabase.from("ingredients").select("id, name"),
      ]);

      const ingNameMap = new Map<string, string>((ingRes.data ?? []).map((i: any) => [i.id, i.name]));
      const ingredientsByProduct = new Map<string, string[]>();
      (prodIngRes.data ?? []).forEach((pi: any) => {
        const name = ingNameMap.get(pi.ingredient_id);
        if (!name) return;
        const list = ingredientsByProduct.get(pi.product_id) || [];
        list.push(name);
        ingredientsByProduct.set(pi.product_id, list);
      });

      const linksMap = new Map<string, string[]>();
      if (linksRes.data) {
        for (const link of linksRes.data) {
          const list = linksMap.get(link.addon_id) || [];
          list.push(link.product_id);
          linksMap.set(link.addon_id, list);
        }
      }

      const addonsMap = new Map<string, ProductAddon[]>();
      const globalAddons: ProductAddon[] = [];

      if (addonsRes.data) {
        for (const a of addonsRes.data) {
          const addon: ProductAddon = { id: a.id, name: a.name, price: a.price };
          if (a.apply_to_all) {
            globalAddons.push(addon);
          } else if (a.product_id) {
            const list = addonsMap.get(a.product_id) || [];
            list.push(addon);
            addonsMap.set(a.product_id, list);
          } else {
            const linkedProducts = linksMap.get(a.id) || [];
            for (const pid of linkedProducts) {
              const list = addonsMap.get(pid) || [];
              list.push(addon);
              addonsMap.set(pid, list);
            }
          }
        }
      }

      const comboCategoryIds = new Set(
        (categoriesRes.data || [])
          .filter((c: any) => c.name?.toLowerCase().includes("combo"))
          .map((c: any) => c.id)
      );

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
            isCombo: Boolean(p.is_combo) || comboCategoryIds.has(p.category_id),
            comboItemCount: p.combo_item_count || 1,
            addons: [...globalAddons, ...(addonsMap.get(p.id) || [])],
            ingredients: ingredientsByProduct.get(p.id) || [],
          }))
        );
      }
      setLoading(false);
    };
    fetch();
  }, [storeId]);

  return { products, loading };
}
