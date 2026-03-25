declare global {
  var __LOVA_FIX_TRIGGER__: boolean | undefined;
}

try {
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
