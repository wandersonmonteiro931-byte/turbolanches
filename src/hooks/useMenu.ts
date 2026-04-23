import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/contexts/StoreContext";
import type { Product, ProductAddon, Category } from "@/data/menu";
import { sanitizeCustomerDescription } from "@/lib/menuSanitizer";

const MENU_CACHE_VERSION = "2026-04-23-store-only-products";

const categoriesCache = new Map<string, Category[]>();
const productsCache = new Map<string, Product[]>();

const cacheKey = (storeId: string | null | undefined) => `${MENU_CACHE_VERSION}:${storeId ?? "__default__"}`;

export function useCategories() {
  const { storeId } = useStore();
  const key = cacheKey(storeId);
  const [categories, setCategories] = useState<Category[]>(() => categoriesCache.get(key) ?? []);
  const [loading, setLoading] = useState(() => !categoriesCache.has(key));

  const fetchCategories = useCallback(async () => {
    let query = supabase
      .from("categories")
      .select("id, name, icon, image_url, sort_order")
      .eq("active", true)
      .order("sort_order");

    if (storeId) query = query.eq("store_id", storeId);

    const { data } = await query;
    if (data) {
      const mapped = data.map((c: any) => ({
        id: c.id,
        name: c.name,
        icon: c.icon || "",
        image: c.image_url || "/placeholder.svg",
      }));
      categoriesCache.set(key, mapped);
      setCategories(mapped);
    }
    setLoading(false);
  }, [storeId, key]);

  useEffect(() => {
    fetchCategories();
    const channel = supabase
      .channel("categories-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "categories" },
        () => fetchCategories()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCategories]);

  return { categories, loading };
}

export function useProducts() {
  const { storeId } = useStore();
  const key = cacheKey(storeId);
  const [products, setProducts] = useState<Product[]>(() => productsCache.get(key) ?? []);
  const [loading, setLoading] = useState(() => !productsCache.has(key));

  const fetchProducts = useCallback(async () => {
    let productsQuery = supabase
      .from("products")
      .select("id, name, description, price, original_price, image_url, category_id, popular, active, sort_order, is_combo, combo_item_count, product_code")
      .eq("store_only", false)
      .order("sort_order")
      .order("name");

    let addonsQuery = supabase
      .from("product_addons")
      .select("id, name, price, product_id, apply_to_all, sort_order, is_internal")
      .eq("active", true)
      .eq("is_internal", false)
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
        ? supabase.from("ingredients").select("id, name, is_internal").eq("store_id", storeId)
        : supabase.from("ingredients").select("id, name, is_internal"),
    ]);

    const ingNameMap = new Map<string, string>(
      (ingRes.data ?? [])
        .filter((i: any) => !i.is_internal)
        .map((i: any) => [i.id, i.name])
    );
    const ingredientsByProduct = new Map<string, string[]>();
    (prodIngRes.data ?? []).forEach((pi: any) => {
      const name = ingNameMap.get(pi.ingredient_id);
      if (!name) return;
      const existing = ingredientsByProduct.get(pi.product_id) || [];
      if (existing.includes(name)) return;
      ingredientsByProduct.set(pi.product_id, [...existing, name]);
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

    const appendAddon = (productId: string, addon: ProductAddon) => {
      const current = addonsMap.get(productId) || [];
      if (current.some((item) => item.id === addon.id)) return;
      addonsMap.set(productId, [...current, addon]);
    };

    if (addonsRes.data) {
      for (const a of addonsRes.data) {
        const addon: ProductAddon = { id: a.id, name: a.name, price: a.price };
        if (a.apply_to_all) {
          if (!globalAddons.some((item) => item.id === addon.id)) {
            globalAddons.push(addon);
          }
        } else if (a.product_id) {
          appendAddon(a.product_id, addon);
        } else {
          const linkedProducts = linksMap.get(a.id) || [];
          for (const pid of linkedProducts) {
            appendAddon(pid, addon);
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
      const mapped = productsRes.data.map((p: any) => ({
        id: p.id,
        code: p.product_code,
        name: p.name,
        description: sanitizeCustomerDescription(p.description),
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
      }));
      productsCache.set(key, mapped);
      setProducts(mapped);
    }
    setLoading(false);
  }, [storeId, key]);

  useEffect(() => {
    fetchProducts();
    const channel = supabase
      .channel("products-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => fetchProducts())
      .on("postgres_changes", { event: "*", schema: "public", table: "product_addons" }, () => fetchProducts())
      .on("postgres_changes", { event: "*", schema: "public", table: "product_ingredients" }, () => fetchProducts())
      .on("postgres_changes", { event: "*", schema: "public", table: "ingredients" }, () => fetchProducts())
      .on("postgres_changes", { event: "*", schema: "public", table: "addon_product_links" }, () => fetchProducts())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchProducts]);

  return { products, loading };
}
