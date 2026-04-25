const DEFAULT_PRINT_FEATURES = "width=320,height=640";

const buildStampedPrintUrl = (url: string) => {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}t=${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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