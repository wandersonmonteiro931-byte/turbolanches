export interface ThermalPrintSettings {
  paperWidthMm: number;
  fixedHeightMm: number;
  cutOffsetMm: number;
  popupWidthPx: number;
  popupHeightPx: number;
  printGapMs: number;
}

export const THERMAL_PRINT_SETTINGS_KEY = "turbo_thermal_print_settings_v1";

export const DEFAULT_THERMAL_PRINT_SETTINGS: ThermalPrintSettings = {
  paperWidthMm: 72,
  fixedHeightMm: 0,
  cutOffsetMm: 0,
  popupWidthPx: 280,
  popupHeightPx: 120,
  printGapMs: 1200,
};

const clampNumber = (value: unknown, fallback: number, min: number, max: number) => {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.min(max, Math.max(min, next));
};

export const normalizeThermalPrintSettings = (value?: Partial<ThermalPrintSettings> | null): ThermalPrintSettings => ({
  paperWidthMm: clampNumber(value?.paperWidthMm, DEFAULT_THERMAL_PRINT_SETTINGS.paperWidthMm, 40, 110),
  fixedHeightMm: clampNumber(value?.fixedHeightMm, DEFAULT_THERMAL_PRINT_SETTINGS.fixedHeightMm, 0, 500),
  cutOffsetMm: clampNumber(value?.cutOffsetMm, DEFAULT_THERMAL_PRINT_SETTINGS.cutOffsetMm, -80, 80),
  popupWidthPx: clampNumber(value?.popupWidthPx, DEFAULT_THERMAL_PRINT_SETTINGS.popupWidthPx, 180, 800),
  popupHeightPx: clampNumber(value?.popupHeightPx, DEFAULT_THERMAL_PRINT_SETTINGS.popupHeightPx, 80, 1200),
  printGapMs: clampNumber(value?.printGapMs, DEFAULT_THERMAL_PRINT_SETTINGS.printGapMs, 350, 5000),
});

export const getThermalPrintSettings = (): ThermalPrintSettings => {
  if (typeof window === "undefined") return DEFAULT_THERMAL_PRINT_SETTINGS;

  try {
    const raw = window.localStorage.getItem(THERMAL_PRINT_SETTINGS_KEY);
    return normalizeThermalPrintSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return DEFAULT_THERMAL_PRINT_SETTINGS;
  }
};

export const saveThermalPrintSettings = (settings: Partial<ThermalPrintSettings>) => {
  const normalized = normalizeThermalPrintSettings(settings);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(THERMAL_PRINT_SETTINGS_KEY, JSON.stringify(normalized));
  }
  return normalized;
};

export const buildThermalPrintFeatures = (settings = getThermalPrintSettings()) =>
  `popup=yes,width=${Math.round(settings.popupWidthPx)},height=${Math.round(settings.popupHeightPx)},left=0,top=0,scrollbars=no,resizable=yes`;