export interface ThermalPrintSettings {
  paperWidthMm: number;
  fixedHeightMm: number;
  cutOffsetMm: number;
  popupWidthPx: number;
  popupHeightPx: number;
  printGapMs: number;
  /** Quando true, o sistema tenta imprimir via QZ Tray (ESC/POS) antes de cair no popup HTML. */
  qzEnabled: boolean;
  /** Nome exato da impressora térmica registrada no Windows/macOS para envio raw. */
  qzPrinterName: string;
  /** Largura útil em colunas (caracteres) — 32 para 58mm, 42 para POS-80 com margem segura; 48 para 80mm/72mm quando não cortar. */
  qzColumns: number;
  /** Quantidade de linhas em branco antes do corte (alimentação). */
  qzFeedLines: number;
  /** Codepage ESC/POS (16 = WPC1252, 17 = PC852, etc). */
  qzCodepage: number;

  /** Destaques automáticos aplicados somente na comanda de PEDIDO via QZ Tray. */
  pedidoHighlightOrderNumber: boolean;
  pedidoHighlightPriorityDeliveries: boolean;
  pedidoHighlightOrderPriority: boolean;
  pedidoHighlightDeliveryEstimate: boolean;
  pedidoHighlightItemQuantity: boolean;
  pedidoHighlightComplements: boolean;
  pedidoHighlightObservations: boolean;
}

export const THERMAL_PRINT_SETTINGS_KEY = "turbo_thermal_print_settings_v1";

export const DEFAULT_THERMAL_PRINT_SETTINGS: ThermalPrintSettings = {
  paperWidthMm: 72,
  fixedHeightMm: 0,
  cutOffsetMm: 0,
  popupWidthPx: 280,
  popupHeightPx: 120,
  printGapMs: 1200,
  qzEnabled: false,
  qzPrinterName: "",
  qzColumns: 42,
  qzFeedLines: 3,
  qzCodepage: 16,
  pedidoHighlightOrderNumber: true,
  pedidoHighlightPriorityDeliveries: false,
  pedidoHighlightOrderPriority: false,
  pedidoHighlightDeliveryEstimate: false,
  pedidoHighlightItemQuantity: true,
  pedidoHighlightComplements: true,
  pedidoHighlightObservations: true,
};

const clampNumber = (value: unknown, fallback: number, min: number, max: number) => {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.min(max, Math.max(min, next));
};

export const normalizeThermalPrintSettings = (value?: Partial<ThermalPrintSettings> | null): ThermalPrintSettings => ({
  paperWidthMm: clampNumber(value?.paperWidthMm, DEFAULT_THERMAL_PRINT_SETTINGS.paperWidthMm, 40, 110),
  fixedHeightMm: clampNumber(value?.fixedHeightMm, DEFAULT_THERMAL_PRINT_SETTINGS.fixedHeightMm, 0, 500),
  cutOffsetMm: clampNumber(value?.cutOffsetMm, DEFAULT_THERMAL_PRINT_SETTINGS.cutOffsetMm, 0, 80),
  popupWidthPx: clampNumber(value?.popupWidthPx, DEFAULT_THERMAL_PRINT_SETTINGS.popupWidthPx, 180, 800),
  popupHeightPx: clampNumber(value?.popupHeightPx, DEFAULT_THERMAL_PRINT_SETTINGS.popupHeightPx, 80, 1200),
  printGapMs: clampNumber(value?.printGapMs, DEFAULT_THERMAL_PRINT_SETTINGS.printGapMs, 350, 5000),
  qzEnabled: Boolean(value?.qzEnabled ?? DEFAULT_THERMAL_PRINT_SETTINGS.qzEnabled),
  qzPrinterName:
    typeof value?.qzPrinterName === "string" ? value!.qzPrinterName : DEFAULT_THERMAL_PRINT_SETTINGS.qzPrinterName,
  qzColumns: clampNumber(value?.qzColumns, DEFAULT_THERMAL_PRINT_SETTINGS.qzColumns, 24, 64),
  qzFeedLines: clampNumber(value?.qzFeedLines, DEFAULT_THERMAL_PRINT_SETTINGS.qzFeedLines, 0, 10),
  qzCodepage: clampNumber(value?.qzCodepage, DEFAULT_THERMAL_PRINT_SETTINGS.qzCodepage, 0, 255),
  pedidoHighlightOrderNumber: Boolean(
    value?.pedidoHighlightOrderNumber ?? DEFAULT_THERMAL_PRINT_SETTINGS.pedidoHighlightOrderNumber,
  ),
  pedidoHighlightPriorityDeliveries: Boolean(
    value?.pedidoHighlightPriorityDeliveries ?? DEFAULT_THERMAL_PRINT_SETTINGS.pedidoHighlightPriorityDeliveries,
  ),
  pedidoHighlightOrderPriority: Boolean(
    value?.pedidoHighlightOrderPriority ?? DEFAULT_THERMAL_PRINT_SETTINGS.pedidoHighlightOrderPriority,
  ),
  pedidoHighlightDeliveryEstimate: Boolean(
    value?.pedidoHighlightDeliveryEstimate ?? DEFAULT_THERMAL_PRINT_SETTINGS.pedidoHighlightDeliveryEstimate,
  ),
  pedidoHighlightItemQuantity: Boolean(
    value?.pedidoHighlightItemQuantity ?? DEFAULT_THERMAL_PRINT_SETTINGS.pedidoHighlightItemQuantity,
  ),
  pedidoHighlightComplements: Boolean(
    value?.pedidoHighlightComplements ?? DEFAULT_THERMAL_PRINT_SETTINGS.pedidoHighlightComplements,
  ),
  pedidoHighlightObservations: Boolean(
    value?.pedidoHighlightObservations ?? DEFAULT_THERMAL_PRINT_SETTINGS.pedidoHighlightObservations,
  ),
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
