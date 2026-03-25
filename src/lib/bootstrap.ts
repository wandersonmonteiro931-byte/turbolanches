declare global {
  var __LOVA_FIX_TRIGGER__: boolean | undefined;
}

try {
  new Function(`
    var currentValue = typeof globalThis !== "undefined" && typeof globalThis.__LOVA_FIX_TRIGGER__ !== "undefined"
      ? globalThis.__LOVA_FIX_TRIGGER__
      : false;

    if (typeof __LOVA_FIX_TRIGGER__ === "undefined") {
      var __LOVA_FIX_TRIGGER__ = currentValue;
    } else {
      __LOVA_FIX_TRIGGER__ = currentValue;
    }

    if (typeof globalThis !== "undefined") {
      globalThis.__LOVA_FIX_TRIGGER__ = __LOVA_FIX_TRIGGER__;
    }
  `)();
} catch {}

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