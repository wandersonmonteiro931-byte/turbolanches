declare global {
  var __LOVA_FIX_TRIGGER__: boolean | undefined;
}

const scope = globalThis as typeof globalThis & {
  __LOVA_FIX_TRIGGER__?: boolean;
};

try {
  Object.defineProperty(scope, "__LOVA_FIX_TRIGGER__", {
    configurable: true,
    enumerable: false,
    writable: true,
    value: false,
  });
} catch {
  scope.__LOVA_FIX_TRIGGER__ = false;
}

export {};
