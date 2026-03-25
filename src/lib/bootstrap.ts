declare global {
  var __LOVA_FIX_TRIGGER__: boolean | undefined;
}

const scope = globalThis as typeof globalThis & {
  __LOVA_FIX_TRIGGER__?: boolean;
};

try {
  if (!Object.prototype.hasOwnProperty.call(scope, "__LOVA_FIX_TRIGGER__")) {
    Object.defineProperty(scope, "__LOVA_FIX_TRIGGER__", {
      configurable: true,
      enumerable: false,
      writable: true,
      value: false,
    });
  } else if (typeof scope.__LOVA_FIX_TRIGGER__ === "undefined") {
    scope.__LOVA_FIX_TRIGGER__ = false;
  }
} catch {
  scope.__LOVA_FIX_TRIGGER__ = false;
}

export {};