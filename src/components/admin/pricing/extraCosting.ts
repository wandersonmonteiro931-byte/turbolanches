import { formatCurrency, roundMoney } from "./pricingMoney";

export type ExtraCostType = "fixed" | "percentage";
export type ExtraCostDivisionMode = "none" | "daily";

export interface PricingExtraCost {
  id?: string;
  name?: string | null;
  cost_type: string;
  value: number;
  preset_key?: string | null;
  division_mode?: string | null;
  days_duration?: number | null;
  items_per_day?: number | null;
  sort_order?: number | null;
  notes?: string | null;
}

interface ExtraCostPresetDefinition {
  key: string;
  name: string;
  helper: string;
  sortOrder: number;
}

export interface ExtraCostPreview {
  normalizedType: ExtraCostType;
  divisionMode: ExtraCostDivisionMode;
  baseValue: number;
  dailyValue: number | null;
  perItemValue: number | null;
  daysDuration: number;
  itemsPerDay: number;
  isConfigured: boolean;
}

export const EXTRA_COST_PRESETS: ExtraCostPresetDefinition[] = [
  { key: "gas", name: "GÁS", helper: "Valor do botijão ÷ dias de duração ÷ lanches feitos por dia.", sortOrder: 10 },
  { key: "energia", name: "ENERGIA", helper: "Conta de energia ÷ dias considerados ÷ lanches feitos por dia.", sortOrder: 20 },
  { key: "agua", name: "ÁGUA", helper: "Conta de água ÷ dias considerados ÷ lanches feitos por dia.", sortOrder: 30 },
  { key: "gasolina", name: "GASOLINA", helper: "Gasto de gasolina ÷ dias considerados ÷ lanches feitos por dia.", sortOrder: 40 },
  { key: "equipamento", name: "EQUIPAMENTO", helper: "Rateio do equipamento ÷ dias considerados ÷ lanches feitos por dia.", sortOrder: 50 },
  { key: "oleo", name: "ÓLEO", helper: "Valor do óleo ÷ dias de duração ÷ lanches feitos por dia.", sortOrder: 60 },
];

const PRESET_NAME_MAP = new Map(EXTRA_COST_PRESETS.map((preset) => [preset.key, preset.name]));

export const normalizeExtraCostType = (value?: string | null): ExtraCostType =>
  value === "percentage" ? "percentage" : "fixed";

export const normalizeExtraCostDivisionMode = (value?: string | null): ExtraCostDivisionMode =>
  value === "daily" ? "daily" : "none";

export const formatPercent = (value?: number | null) => `${roundMoney(value ?? 0).toFixed(2).replace(".", ",")}%`;

export const getExtraCostPresetHelper = (presetKey?: string | null) => {
  if (!presetKey) return null;
  return EXTRA_COST_PRESETS.find((preset) => preset.key === presetKey)?.helper ?? null;
};

export const getExtraCostDisplayName = (extraCost: PricingExtraCost) => {
  if (extraCost.name?.trim()) return extraCost.name.trim();
  if (extraCost.preset_key) return PRESET_NAME_MAP.get(extraCost.preset_key) ?? extraCost.preset_key;
  return "Custo extra";
};

export const computeExtraCostPreview = (extraCost: PricingExtraCost): ExtraCostPreview => {
  const normalizedType = normalizeExtraCostType(extraCost.cost_type);
  const divisionMode = normalizedType === "fixed" ? normalizeExtraCostDivisionMode(extraCost.division_mode) : "none";
  const baseValue = roundMoney(Number(extraCost.value || 0));
  const daysDuration = Number(extraCost.days_duration || 0);
  const itemsPerDay = Number(extraCost.items_per_day || 0);

  if (normalizedType === "percentage") {
    return { normalizedType, divisionMode, baseValue, dailyValue: null, perItemValue: null, daysDuration, itemsPerDay, isConfigured: true };
  }

  if (divisionMode === "daily") {
    const hasDays = Number.isFinite(daysDuration) && daysDuration > 0;
    const hasItems = Number.isFinite(itemsPerDay) && itemsPerDay > 0;
    const dailyValue = hasDays ? roundMoney(baseValue / daysDuration) : null;
    const perItemValue = hasDays && hasItems && dailyValue !== null ? roundMoney(dailyValue / itemsPerDay) : 0;
    return { normalizedType, divisionMode, baseValue, dailyValue, perItemValue, daysDuration, itemsPerDay, isConfigured: hasDays && hasItems };
  }

  return { normalizedType, divisionMode, baseValue, dailyValue: null, perItemValue: baseValue, daysDuration, itemsPerDay, isConfigured: true };
};

export const computeFixedExtraCostPerItem = (extraCost: PricingExtraCost) => {
  const preview = computeExtraCostPreview(extraCost);
  return preview.normalizedType === "fixed" ? roundMoney(preview.perItemValue ?? 0) : 0;
};

export const getExtraCostValueLabel = (extraCost: PricingExtraCost) => {
  const preview = computeExtraCostPreview(extraCost);
  return preview.normalizedType === "percentage" ? formatPercent(preview.baseValue) : formatCurrency(preview.baseValue);
};

export const createMissingPresetPayloads = (existingItems: PricingExtraCost[], storeId?: string | null) => {
  if (!storeId) return [];
  const existingKeys = new Set(existingItems.map((item) => item.preset_key).filter(Boolean));
  const existingNames = new Set(existingItems.map((item) => getExtraCostDisplayName(item).toLowerCase()));

  return EXTRA_COST_PRESETS.filter(
    (preset) => !existingKeys.has(preset.key) && !existingNames.has(preset.name.toLowerCase()),
  ).map((preset) => ({
    store_id: storeId,
    preset_key: preset.key,
    sort_order: preset.sortOrder,
    name: preset.name,
    cost_type: "fixed",
    division_mode: "daily",
    value: 0,
    days_duration: null,
    items_per_day: null,
    notes: preset.helper,
  }));
};