import { parseLocaleNumber, roundMoney } from "./pricingMoney";

export const INGREDIENT_CALCULATION_MODES = ["pacote", "kg", "fatias", "unidade", "g", "ml", "litro", "sachê"] as const;

export const INGREDIENT_UNITS = ["kg", "fatias", "unidade", "g", "ml", "litro", "sachê"] as const;

export type IngredientCalculationMode = (typeof INGREDIENT_CALCULATION_MODES)[number];
export type IngredientMeasureUnit = (typeof INGREDIENT_UNITS)[number];

export interface IngredientCalculationConfig {
  mode: IngredientCalculationMode;
  reference_price: string;
  purchase_quantity: string;
  purchase_unit: IngredientMeasureUnit;
  package_quantity: string;
  package_price: string;
  units_per_package: string;
  package_content_unit: IngredientMeasureUnit;
}

const WEIGHT_UNITS: IngredientMeasureUnit[] = ["kg", "g"];
const LIQUID_UNITS: IngredientMeasureUnit[] = ["litro", "ml"];

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

export const getPurchaseUnitOptions = (
  mode: IngredientCalculationMode,
  packageContentUnit: IngredientMeasureUnit = "unidade",
) => {
  if (mode === "pacote") return [packageContentUnit];
  if (mode === "kg") return WEIGHT_UNITS;
  if (mode === "g") return [...WEIGHT_UNITS].reverse();
  if (mode === "litro") return LIQUID_UNITS;
  if (mode === "ml") return [...LIQUID_UNITS].reverse();
  return [normalizeIngredientUnit(mode)];
};

const normalizePurchaseUnit = (
  value: string | undefined,
  mode: IngredientCalculationMode,
  packageContentUnit: IngredientMeasureUnit,
) => {
  const options = getPurchaseUnitOptions(mode, packageContentUnit);
  const normalizedValue = normalizeIngredientUnit(value);
  return options.includes(normalizedValue) ? normalizedValue : options[0];
};

const convertQuantityToMode = (
  quantity: number,
  purchaseUnit: IngredientMeasureUnit,
  mode: IngredientCalculationMode,
) => {
  if (mode === "kg" || mode === "g") {
    const quantityInGrams = purchaseUnit === "kg" ? quantity * 1000 : quantity;
    return mode === "kg" ? quantityInGrams / 1000 : quantityInGrams;
  }

  if (mode === "litro" || mode === "ml") {
    const quantityInMl = purchaseUnit === "litro" ? quantity * 1000 : quantity;
    return mode === "litro" ? quantityInMl / 1000 : quantityInMl;
  }

  return quantity;
};

export const createEmptyCalculationConfig = (): IngredientCalculationConfig => ({
  mode: "unidade",
  reference_price: "",
  purchase_quantity: "",
  purchase_unit: "unidade",
  package_quantity: "",
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
    purchase_quantity: asString(record.purchase_quantity),
    purchase_unit: normalizePurchaseUnit(asString(record.purchase_unit), mode, packageContentUnit),
    package_quantity: asString(record.package_quantity),
    package_price: asString(record.package_price),
    units_per_package: asString(record.units_per_package),
    package_content_unit: packageContentUnit,
  };
};

export const computeCalculationSummary = (config: IngredientCalculationConfig) => {
  if (config.mode === "pacote") {
    const packageQuantity = parseNumber(config.package_quantity);
    const packagePrice = parseNumber(config.package_price);
    const unitsPerPackage = parseNumber(config.units_per_package);

    const totalSpent = packageQuantity !== null && packagePrice !== null ? roundMoney(packageQuantity * packagePrice) : null;
    const totalUnits = packageQuantity !== null && unitsPerPackage !== null ? packageQuantity * unitsPerPackage : null;
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