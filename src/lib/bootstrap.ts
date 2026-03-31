declare global {
  var __LOVA_FIX_TRIGGER__: boolean | undefined;
}

try {
  if (typeof window !== "undefined") {
    window.addEventListener("unhandledrejection", (event) => {
      const reasonText = String((event as PromiseRejectionEvent).reason ?? "");
      if (reasonText.includes("__LOVA_FIX_TRIGGER__")) {
        event.preventDefault();
      }
    });
  }

  if (typeof globalThis.__LOVA_FIX_TRIGGER__ === "undefined") {
    Object.defineProperty(globalThis, "__LOVA_FIX_TRIGGER__", {
      configurable: true,
      enumerable: false,
      writable: true,
      value: false,
    });
  }

  const scopes = [
    typeof globalThis !== "undefined" ? globalThis : undefined,
    typeof window !== "undefined" ? window : undefined,
    typeof self !== "undefined" ? self : undefined,
  ].filter(Boolean) as Array<typeof globalThis>;

  scopes.forEach((scope) => {
    if (scope.__LOVA_FIX_TRIGGER__ === undefined) {
      Object.defineProperty(scope, "__LOVA_FIX_TRIGGER__", {
        configurable: true,
        enumerable: false,
        writable: true,
        value: false,
      });
      return;
    }

    scope.__LOVA_FIX_TRIGGER__ = Boolean(scope.__LOVA_FIX_TRIGGER__);
  });
} catch {
  // silently ignore
}

export {};
