import { computeFixedExtraCostPerItem, type PricingExtraCost } from "./extraCosting";
import { roundMoney } from "./pricingMoney";

export type { PricingExtraCost } from "./extraCosting";

export interface PricingCategory {
  id: string;
  name: string;
  sort_order?: number | null;
}

export interface PricingProduct {
  id: string;
  name: string;
  price: number;
  manual_cost?: number | null;
  category_id: string | null;
  active: boolean;
  is_combo?: boolean | null;
  combo_item_count?: number | null;
  sort_order?: number | null;
}

export interface PricingIngredient {
  id: string;
  cost_per_unit: number;
}

export interface PricingProductIngredient {
  id?: string;
  product_id: string;
  ingredient_id: string;
  quantity: number;
}

export interface PricingComboComponent {
  id?: string;
  product_id: string;
  component_product_id: string;
  quantity: number;
  sort_order?: number | null;
}

export interface ProductCostRow {
  id: string;
  name: string;
  categoryId: string | null;
  categoryName: string;
  categoryOrder: number;
  price: number;
  active: boolean;
  ingredientCost: number;
  comboComponentCost: number;
  manualCost: number;
  baseCost: number;
  extraCost: number;
  totalCost: number;
  profit: number;
  margin: number;
  ingredientCount: number;
  comboComponentCount: number;
  isCombo: boolean;
  comboItemCount: number;
  sortOrder: number;
}

interface BuildProductCostRowsParams {
  categories: PricingCategory[];
  products: PricingProduct[];
  ingredients: PricingIngredient[];
  productIngredients: PricingProductIngredient[];
  comboComponents?: PricingComboComponent[];
  extraCosts: PricingExtraCost[];
}

export const buildProductCostRows = ({
  categories,
  products,
  ingredients,
  productIngredients,
  comboComponents = [],
  extraCosts,
}: BuildProductCostRowsParams): ProductCostRow[] => {
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const productMap = new Map(products.map((product) => [product.id, product]));
  const ingredientCostMap = new Map(ingredients.map((ingredient) => [ingredient.id, Number(ingredient.cost_per_unit) || 0]));
  const productIngredientMap = productIngredients.reduce<Map<string, PricingProductIngredient[]>>((map, line) => {
    const current = map.get(line.product_id) || [];
    current.push(line);
    map.set(line.product_id, current);
    return map;
  }, new Map());
  const comboComponentMap = comboComponents.reduce<Map<string, PricingComboComponent[]>>((map, line) => {
    const current = map.get(line.product_id) || [];
    current.push(line);
    map.set(line.product_id, current);
    return map;
  }, new Map());

  const totalFixedExtra = roundMoney(
    extraCosts
      .filter((extra) => extra.cost_type === "fixed")
      .reduce((sum, extra) => sum + computeFixedExtraCostPerItem(extra), 0),
  );

  const totalPercentExtra = extraCosts
    .filter((extra) => extra.cost_type === "percentage")
    .reduce((sum, extra) => sum + Number(extra.value || 0), 0);

  interface ResolvedProductCost {
    ingredientCost: number;
    comboComponentCost: number;
    manualCost: number;
    baseCost: number;
    ingredientCount: number;
    comboComponentCount: number;
  }

  const resolvedCostCache = new Map<string, ResolvedProductCost>();

  const resolveProductCost = (productId: string, ancestry = new Set<string>()): ResolvedProductCost => {
    const cached = resolvedCostCache.get(productId);
    if (cached) return cached;
    if (ancestry.has(productId)) {
      return {
        ingredientCost: 0,
        comboComponentCost: 0,
        manualCost: 0,
        baseCost: 0,
        ingredientCount: 0,
        comboComponentCount: 0,
      };
    }

    const product = productMap.get(productId);
    if (!product) {
      return {
        ingredientCost: 0,
        comboComponentCost: 0,
        manualCost: 0,
        baseCost: 0,
        ingredientCount: 0,
        comboComponentCount: 0,
      };
    }

    const nextAncestry = new Set(ancestry);
    nextAncestry.add(productId);

    const directIngredientLines = productIngredientMap.get(productId) || [];
    const comboLines = comboComponentMap.get(productId) || [];

    const directIngredientCost = roundMoney(
      directIngredientLines.reduce((sum, line) => {
        const unitCost = ingredientCostMap.get(line.ingredient_id) || 0;
        return sum + Number(line.quantity || 0) * unitCost;
      }, 0),
    );

    const comboComponentCost = roundMoney(
      comboLines.reduce((sum, line) => {
        const componentCost = resolveProductCost(line.component_product_id, nextAncestry);
        return sum + componentCost.baseCost * Number(line.quantity || 0);
      }, 0),
    );

    const ingredientCost = roundMoney(directIngredientCost + comboComponentCost);
    const manualCost = roundMoney(Number(product.manual_cost || 0));
    const resolved = {
      ingredientCost,
      comboComponentCost,
      manualCost,
      baseCost: roundMoney(ingredientCost + manualCost),
      ingredientCount: directIngredientLines.length,
      comboComponentCount: comboLines.length,
    } satisfies ResolvedProductCost;

    resolvedCostCache.set(productId, resolved);
    return resolved;
  };

  return products
    .map((product) => {
      const category = product.category_id ? categoryMap.get(product.category_id) : null;
      const resolvedCost = resolveProductCost(product.id);

      const extraCost = roundMoney(totalFixedExtra + (Number(product.price || 0) * totalPercentExtra) / 100);
      const totalCost = roundMoney(resolvedCost.baseCost + extraCost);
      const profit = roundMoney(Number(product.price || 0) - totalCost);
      const margin = Number(product.price || 0) > 0 ? roundMoney((profit / Number(product.price)) * 100) : 0;

      return {
        id: product.id,
        name: product.name,
        categoryId: product.category_id,
        categoryName: category?.name || "Sem categoria",
        categoryOrder: category?.sort_order ?? Number.MAX_SAFE_INTEGER,
        price: Number(product.price || 0),
        active: Boolean(product.active),
        ingredientCost: resolvedCost.ingredientCost,
        comboComponentCost: resolvedCost.comboComponentCost,
        manualCost: resolvedCost.manualCost,
        baseCost: resolvedCost.baseCost,
        extraCost,
        totalCost,
        profit,
        margin,
        ingredientCount: resolvedCost.ingredientCount,
        comboComponentCount: resolvedCost.comboComponentCount,
        isCombo: Boolean(product.is_combo),
        comboItemCount: Number(product.combo_item_count || 1),
        sortOrder: product.sort_order ?? 0,
      } satisfies ProductCostRow;
    })
    .sort((left, right) => {
      if (left.categoryOrder !== right.categoryOrder) return left.categoryOrder - right.categoryOrder;
      if (left.categoryName !== right.categoryName) return left.categoryName.localeCompare(right.categoryName, "pt-BR");
      if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
      return left.name.localeCompare(right.name, "pt-BR");
    });
};