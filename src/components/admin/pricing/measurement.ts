import { normalizeIngredientUnit, type IngredientMeasureUnit } from "./ingredientCalculation";

export const getDefaultMeasurementUnit = (unit?: string | null): IngredientMeasureUnit =>
  normalizeIngredientUnit(unit);

export const getCompatibleMeasurementUnits = (unit?: string | null): IngredientMeasureUnit[] => {
  const normalizedUnit = normalizeIngredientUnit(unit);

  if (normalizedUnit === "kg" || normalizedUnit === "g") return ["kg", "g"];
  if (normalizedUnit === "litro" || normalizedUnit === "ml") return ["litro", "ml"];

  return [normalizedUnit];
};

export const convertMeasurementQuantity = (
  value: number,
  fromUnit?: string | null,
  toUnit?: string | null,
) => {
  if (!Number.isFinite(value)) return null;

  const normalizedFrom = normalizeIngredientUnit(fromUnit);
  const normalizedTo = normalizeIngredientUnit(toUnit);

  if (normalizedFrom === normalizedTo) return value;
  if (normalizedFrom === "kg" && normalizedTo === "g") return value * 1000;
  if (normalizedFrom === "g" && normalizedTo === "kg") return value / 1000;
  if (normalizedFrom === "litro" && normalizedTo === "ml") return value * 1000;
  if (normalizedFrom === "ml" && normalizedTo === "litro") return value / 1000;

  return null;
};

export const formatMeasurementQuantityInput = (value: number) => {
  if (!Number.isFinite(value)) return "";

  const rounded = Math.round((value + Number.EPSILON) * 1000) / 1000;
  return rounded.toFixed(3).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
};