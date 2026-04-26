import { buildThermalPrintFeatures, getThermalPrintSettings } from "./thermalPrintSettings";

const DEFAULT_PRINT_FEATURES = "popup=yes,width=280,height=120,left=0,top=0,scrollbars=no,resizable=yes";
const buildStampedPrintUrl = (url: string) => {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}t=${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

// Default policy for ALL admin print popups (kiosk mode):
// - Print 1 copy unless caller explicitly set ?copies=N
// - Always engage kiosk_timer so we don't depend on flaky `afterprint` events
// - Default 1200ms gap between copies (thermal printer friendly)
const DEFAULT_COPIES = 1;
const DEFAULT_PRINT_GAP_MS = 1200;
const normalizePrintFeatures = (features = DEFAULT_PRINT_FEATURES) => {
  const required = ["popup=yes", "scrollbars=no", "resizable=yes", "left=0", "top=0"];
  const featureList = features
    .split(",")
    .map((feature) => feature.trim())
    .filter(Boolean);
  const keys = new Set(featureList.map((feature) => feature.split("=")[0]?.toLowerCase()));

  required.forEach((feature) => {
    const key = feature.split("=")[0].toLowerCase();
    if (!keys.has(key)) featureList.push(feature);
  });

  return featureList.join(",");
};

const addKioskPrintParams = (url: string) => {
  const parsedUrl = new URL(url, window.location.origin);
  const settings = getThermalPrintSettings();

  if (!parsedUrl.searchParams.get("copies")) {
    parsedUrl.searchParams.set("copies", String(DEFAULT_COPIES));
  }

  const copies = Math.max(1, Math.min(20, Number(parsedUrl.searchParams.get("copies")) || 1));
  parsedUrl.searchParams.set("copies", String(copies));

  // Always force timer mode in kiosk: afterprint is unreliable with --kiosk-printing
  parsedUrl.searchParams.set("kiosk_timer", "1");
  if (!parsedUrl.searchParams.get("print_gap_ms")) parsedUrl.searchParams.set("print_gap_ms", String(settings.printGapMs || DEFAULT_PRINT_GAP_MS));
  if (!parsedUrl.searchParams.get("thermal_width_mm")) parsedUrl.searchParams.set("thermal_width_mm", String(settings.paperWidthMm));
  if (!parsedUrl.searchParams.get("thermal_height_mm")) parsedUrl.searchParams.set("thermal_height_mm", String(settings.fixedHeightMm));
  if (!parsedUrl.searchParams.get("thermal_cut_offset_mm")) parsedUrl.searchParams.set("thermal_cut_offset_mm", String(settings.cutOffsetMm));

  return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
};

const schedulePopupActivation = (popup: Window | null) => {
  if (!popup || popup.closed || typeof window === "undefined") return;

  let printed = false;

  const tryPrintWhenReady = () => {
    if (!popup || popup.closed || printed) return true;

    try {
      const popupDocument = popup.document;
      const body = popupDocument?.body;
      const isReady = body?.dataset?.printDocument === "ready";

      if (!isReady) return false;

      printed = true;
      try {
        popup.focus();
      } catch {}

      // Notify the popup it can start printing. The popup's internal
      // bootstrap script is responsible for calling window.print() the
      // correct number of times. Do NOT call popup.print() from here:
      // doing so adds an extra job and triggers an early afterprint that
      // makes the popup close after the first copy.
      try {
        popup.postMessage({ type: "turbo-print-now" }, window.location.origin);
      } catch {}

      return true;
    } catch {
      return false;
    }
  };

  const pollUntilReady = (maxAttempts = 80, intervalMs = 100) => {
    let attempts = 0;

    const tick = () => {
      if (!popup || popup.closed || printed) return;
      attempts += 1;

      const done = tryPrintWhenReady();
      if (!done && attempts < maxAttempts) {
        window.setTimeout(tick, intervalMs);
      }
    };

    window.setTimeout(tick, 40);
  };

  [500, 1200, 2200, 3600, 5200].forEach((delay) => {
    window.setTimeout(() => {
      if (!popup || popup.closed) return;

      if (tryPrintWhenReady()) return;

      try {
        popup.focus();
      } catch {}

      try {
        popup.postMessage({ type: "turbo-print-now" }, window.location.origin);
      } catch {}
    }, delay);
  });

  pollUntilReady();
};

export const openPreparedPrintPopup = (features = DEFAULT_PRINT_FEATURES) => {
  const popup = window.open("", `_print_prepare_${Date.now()}`, normalizePrintFeatures(features));
  if (!popup || popup.closed) return null;

  try {
    popup.document.open();
    popup.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8" /><title>Preparando impressão...</title><style>body{margin:0;font-family:Arial,Helvetica,sans-serif;display:grid;place-items:center;min-height:100vh;background:#fff;color:#000;font-weight:700}div{padding:16px;text-align:center}</style></head><body><div>Preparando impressão...</div></body></html>`);
    popup.document.close();
  } catch {}

  return popup;
};

export const routePreparedPrintPopup = (popup: Window | null, url: string, features = DEFAULT_PRINT_FEATURES) => {
  const stampedUrl = buildStampedPrintUrl(addKioskPrintParams(url));

  if (!popup || popup.closed) {
    const nextPopup = window.open(stampedUrl, `_print_${Date.now()}`, normalizePrintFeatures(features));
    schedulePopupActivation(nextPopup);
    return nextPopup;
  }

  try {
    popup.location.replace(stampedUrl);
    popup.focus();
    schedulePopupActivation(popup);
    return popup;
  } catch {
    const nextPopup = window.open(stampedUrl, `_print_${Date.now()}`, normalizePrintFeatures(features));
    schedulePopupActivation(nextPopup);
    return nextPopup;
  }
};

export const openPrintUrl = (url: string, namePrefix = "print", features = DEFAULT_PRINT_FEATURES) => {
  const stampedUrl = buildStampedPrintUrl(addKioskPrintParams(url));
  const resolvedFeatures = features === DEFAULT_PRINT_FEATURES ? buildThermalPrintFeatures() : features;
  const popup = window.open(stampedUrl, `_${namePrefix}_${Date.now()}`, normalizePrintFeatures(resolvedFeatures));
  schedulePopupActivation(popup);
  return popup;
};