declare global {
  var __LOVA_FIX_TRIGGER__: boolean | undefined;
}

try {
  try {
    // Ensure a real global variable binding exists for preview sentinels that
    // may reference __LOVA_FIX_TRIGGER__ directly (without globalThis/window).
    (0, eval)("if (typeof __LOVA_FIX_TRIGGER__ === 'undefined') { var __LOVA_FIX_TRIGGER__ = false; }");
  } catch {
    // ignore eval restrictions
  }

  if (typeof window !== "undefined") {
    window.addEventListener("unhandledrejection", (event) => {
      const reasonText = String((event as any).reason ?? "");
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
