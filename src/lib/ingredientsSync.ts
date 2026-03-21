import { supabase } from "@/integrations/supabase/client";

interface ProductRow {
  id: string;
  description: string | null;
}

interface IngredientRow {
  id: string;
  name: string;
}

const BEVERAGE_KEYWORDS = [
  "refrigerante",
  "coca cola",
  "coca-cola",
  "guarana",
  "guaraná",
  "sukita",
  "mineiro",
  "suco",
  "la fruit",
  "lata",
  "pet",
  "gelado",
  "gelada",
];

const NON_INGREDIENT_PATTERNS = [/^\d+\s*x\s*/i, /^x[-\s]/i, /^combo\b/i, /^tambem\b/i, /^também\b/i];

export const normalizeIngredientName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const cleanCandidate = (value: string) =>
  value
    .replace(/^\s*(de|da|do|das|dos|com|uma|um)\s+/i, "")
    .replace(/^\s*\d+\s*x\s*/i, "")
    .replace(/\b(tambem|também)\b/gi, "")
    .replace(/[.]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const isLikelyIngredient = (value: string) => {
  const normalized = normalizeIngredientName(value);
  if (!normalized || normalized.length < 3) return false;
  if (NON_INGREDIENT_PATTERNS.some((pattern) => pattern.test(value))) return false;
  if (["media", "média", "grande", "pequena", "pequeno"].includes(normalized)) return false;
  if (BEVERAGE_KEYWORDS.some((keyword) => normalized.includes(normalizeIngredientName(keyword)))) return false;
  return true;
};

export const extractIngredientsFromDescription = (description?: string | null) => {
  if (!description) return [];

  let working = description.replace(/[.;]/g, ",").replace(/\s+/g, " ").trim();
  const explicitListMatch = working.match(/\b(?:com|acompanha|cont[eé]m)\b(.+)/i);
  if (explicitListMatch?.[1]) {
    working = explicitListMatch[1];
  }

  working = working
    .replace(/\be também\b/gi, ",")
    .replace(/\btambém\b/gi, ",")
    .replace(/\s+e\s+/gi, ",")
    .replace(/\s+\+\s+/g, ",");

  const parts = working
    .split(",")
    .flatMap((part) => part.split(" - "))
    .map(cleanCandidate)
    .filter(isLikelyIngredient);

  return Array.from(new Set(parts));
};

export async function syncIngredientsFromProductDescriptions(storeId?: string | null) {
  let productsQuery = supabase.from("products").select("id, description");
  let ingredientsQuery = supabase.from("ingredients").select("id, name").order("name");

  if (storeId) {
    productsQuery = productsQuery.eq("store_id", storeId);
    ingredientsQuery = ingredientsQuery.eq("store_id", storeId);
  }

  const [productsRes, ingredientsRes] = await Promise.all([productsQuery, ingredientsQuery]);

  const products = (productsRes.data || []) as ProductRow[];
  const existingIngredients = (ingredientsRes.data || []) as IngredientRow[];

  const existingNames = new Set(existingIngredients.map((ingredient) => normalizeIngredientName(ingredient.name)));
  const detectedNames = new Set<string>();

  products.forEach((product) => {
    extractIngredientsFromDescription(product.description).forEach((ingredient) => {
      detectedNames.add(ingredient);
    });
  });

  const missingIngredients = Array.from(detectedNames).filter(
    (ingredient) => !existingNames.has(normalizeIngredientName(ingredient)),
  );

  if (missingIngredients.length > 0) {
    const payload = missingIngredients.map((name) => ({
      name,
      unit: "unidade",
      cost_per_unit: 0,
      store_id: storeId ?? null,
    }));

    await supabase.from("ingredients").insert(payload);
  }

  return {
    createdIngredients: missingIngredients.length,
    detectedIngredients: detectedNames.size,
  };
}
