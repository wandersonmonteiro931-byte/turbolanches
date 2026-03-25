declare global {
  var __LOVA_FIX_TRIGGER__: boolean | undefined;
}

try {
  if (typeof globalThis.__LOVA_FIX_TRIGGER__ === "undefined") {
    (globalThis as any).__LOVA_FIX_TRIGGER__ = false;
  }
} catch {
  // silently ignore
}

export {};
