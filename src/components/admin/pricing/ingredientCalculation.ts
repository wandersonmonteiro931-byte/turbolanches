import { parseLocaleNumber, roundMoney } from "./pricingMoney";

export const INGREDIENT_CALCULATION_MODES = ["pacote", "kg", "fatias", "unidade", "g", "ml", "litro", "sachê"] as const;

export const INGREDIENT_UNITS = ["kg", "fatias", "unidade", "g", "ml", "litro", "sachê"] as const;

export type IngredientCalculationMode = (typeof INGREDIENT_CALCULATION_MODES)[number];
export type IngredientMeasureUnit = (typeof INGREDIENT_UNITS)[number];

export interface IngredientCalculationConfig {
  mode: IngredientCalculationMode;
  reference_price: string;
  package_price: string;
  units_per_package: string;
  package_content_unit: IngredientMeasureUnit;
}

const isCalculationMode = (value: string): value is IngredientCalculationMode =>
  INGREDIENT_CALCULATION_MODES.includes(value as IngredientCalculationMode);

const isIngredientUnit = (value: string): value is IngredientMeasureUnit =>
  INGREDIENT_UNITS.includes(value as IngredientMeasureUnit);

const asString = (value: unknown) => (typeof value === "string" ? value : "");

const parseNumber = (value: string) => parseLocaleNumber(value);

export const normalizeIngredientUnit = (value?: string | null): IngredientMeasureUnit => {
  if (value === "fatia") return "fatias";
  return value && isIngredientUnit(value) ? value : "unidade";
};

export const normalizeCalculationMode = (value?: string | null): IngredientCalculationMode => {
  if (value === "fatia") return "fatias";
  return value && isCalculationMode(value) ? value : "unidade";
};

export const createEmptyCalculationConfig = (): IngredientCalculationConfig => ({
  mode: "unidade",
  reference_price: "",
  package_price: "",
  units_per_package: "",
  package_content_unit: "unidade",
});

export const buildCalculationConfig = (
  raw: unknown,
  fallbackMode?: string | null,
  fallbackUnit?: string | null,
  fallbackCost?: number | null,
): IngredientCalculationConfig => {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const mode = normalizeCalculationMode(asString(record.mode) || fallbackMode);
  const packageContentUnit = normalizeIngredientUnit(asString(record.package_content_unit) || fallbackUnit);
  const fallbackReferencePrice =
    typeof fallbackCost === "number" && Number.isFinite(fallbackCost) && mode !== "pacote"
      ? String(fallbackCost)
      : "";

  return {
    mode,
    reference_price: asString(record.reference_price) || fallbackReferencePrice,
    package_price: asString(record.package_price),
    units_per_package: asString(record.units_per_package),
    package_content_unit: packageContentUnit,
  };
};

export const computeCalculationSummary = (config: IngredientCalculationConfig) => {
  if (config.mode === "pacote") {
    const packagePrice = parseNumber(config.package_price);
    const unitsPerPackage = parseNumber(config.units_per_package);

    const totalSpent = packagePrice !== null ? roundMoney(packagePrice) : null;
    const totalUnits = unitsPerPackage !== null ? unitsPerPackage : null;
    const resolvedCostPerUnit = totalSpent !== null && totalUnits !== null && totalUnits > 0 ? roundMoney(totalSpent / totalUnits) : null;

    return {
      convertedPurchaseQuantity: totalUnits,
      totalSpent,
      totalUnits,
      resolvedCostPerUnit,
    };
  }

  const referencePrice = parseNumber(config.reference_price);

  return {
    convertedPurchaseQuantity: null,
    totalSpent: referencePrice !== null ? roundMoney(referencePrice) : null,
    totalUnits: null,
    resolvedCostPerUnit: referencePrice !== null ? roundMoney(referencePrice) : null,
  };
};