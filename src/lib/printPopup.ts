const DEFAULT_PRINT_FEATURES = "width=320,height=640";

const buildStampedPrintUrl = (url: string) => {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}t=${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

const schedulePopupActivation = (popup: Window | null) => {
  if (!popup || popup.closed || typeof window === "undefined") return;

  [500, 1200, 2200, 3600, 5200].forEach((delay) => {
    window.setTimeout(() => {
      if (!popup || popup.closed) return;

      try {
        popup.focus();
      } catch {}

      try {
        popup.postMessage({ type: "turbo-print-now" }, window.location.origin);
      } catch {}
    }, delay);
  });
};

export const openPreparedPrintPopup = (features = DEFAULT_PRINT_FEATURES) => {
  const popup = window.open("", `_print_prepare_${Date.now()}`, features);
  if (!popup || popup.closed) return null;

  try {
    popup.document.open();
    popup.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8" /><title>Preparando impressão...</title><style>body{margin:0;font-family:Arial,Helvetica,sans-serif;display:grid;place-items:center;min-height:100vh;background:#fff;color:#000;font-weight:700}div{padding:16px;text-align:center}</style></head><body><div>Preparando impressão...</div></body></html>`);
    popup.document.close();
  } catch {}

  return popup;
};

export const routePreparedPrintPopup = (popup: Window | null, url: string, features = DEFAULT_PRINT_FEATURES) => {
  const stampedUrl = buildStampedPrintUrl(url);

  if (!popup || popup.closed) {
    const nextPopup = window.open(stampedUrl, `_print_${Date.now()}`, features);
    schedulePopupActivation(nextPopup);
    return nextPopup;
  }

  try {
    popup.location.replace(stampedUrl);
    popup.focus();
    schedulePopupActivation(popup);
    return popup;
  } catch {
    const nextPopup = window.open(stampedUrl, `_print_${Date.now()}`, features);
    schedulePopupActivation(nextPopup);
    return nextPopup;
  }
};

export const openPrintUrl = (url: string, namePrefix = "print", features = DEFAULT_PRINT_FEATURES) => {
  const stampedUrl = buildStampedPrintUrl(url);
  const popup = window.open(stampedUrl, `_${namePrefix}_${Date.now()}`, features);
  schedulePopupActivation(popup);
  return popup;
};