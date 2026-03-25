declare global {
  var __LOVA_FIX_TRIGGER__: boolean | undefined;
}

try {
  const scope = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : (typeof self !== "undefined" ? self : ({} as any));
  if (scope.__LOVA_FIX_TRIGGER__ === undefined) {
    Object.defineProperty(scope, "__LOVA_FIX_TRIGGER__", {
      configurable: true,
      enumerable: false,
      writable: true,
      value: false,
    });
  }
} catch {
  // silently ignore
}

export {};
