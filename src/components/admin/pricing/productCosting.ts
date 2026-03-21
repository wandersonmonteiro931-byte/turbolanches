import { roundMoney } from "./pricingMoney";

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

export interface PricingExtraCost {
  cost_type: string;
  value: number;
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
  manualCost: number;
  extraCost: number;
  totalCost: number;
  profit: number;
  margin: number;
  ingredientCount: number;
  sortOrder: number;
}

interface BuildProductCostRowsParams {
  categories: PricingCategory[];
  products: PricingProduct[];
  ingredients: PricingIngredient[];
  productIngredients: PricingProductIngredient[];
  extraCosts: PricingExtraCost[];
}

export const buildProductCostRows = ({
  categories,
  products,
  ingredients,
  productIngredients,
  extraCosts,
}: BuildProductCostRowsParams): ProductCostRow[] => {
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const ingredientCostMap = new Map(ingredients.map((ingredient) => [ingredient.id, Number(ingredient.cost_per_unit) || 0]));

  const totalFixedExtra = roundMoney(
    extraCosts
      .filter((extra) => extra.cost_type === "fixed")
      .reduce((sum, extra) => sum + Number(extra.value || 0), 0),
  );

  const totalPercentExtra = extraCosts
    .filter((extra) => extra.cost_type === "percentage")
    .reduce((sum, extra) => sum + Number(extra.value || 0), 0);

  return products
    .map((product) => {
      const category = product.category_id ? categoryMap.get(product.category_id) : null;
      const productLines = productIngredients.filter((line) => line.product_id === product.id);

      const ingredientCost = roundMoney(
        productLines.reduce((sum, line) => {
          const unitCost = ingredientCostMap.get(line.ingredient_id) || 0;
          return sum + Number(line.quantity || 0) * unitCost;
        }, 0),
      );
      const manualCost = roundMoney(Number(product.manual_cost || 0));

      const extraCost = roundMoney(totalFixedExtra + (Number(product.price || 0) * totalPercentExtra) / 100);
      const totalCost = roundMoney(ingredientCost + manualCost + extraCost);
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
        ingredientCost,
        manualCost,
        extraCost,
        totalCost,
        profit,
        margin,
        ingredientCount: productLines.length,
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