declare global {
  var __LOVA_FIX_TRIGGER__: boolean | undefined;
}

const scope = globalThis as typeof globalThis & {
  __LOVA_FIX_TRIGGER__?: boolean;
};

const triggerValue = typeof scope.__LOVA_FIX_TRIGGER__ === "boolean" ? scope.__LOVA_FIX_TRIGGER__ : false;

try {
  Object.defineProperty(scope, "__LOVA_FIX_TRIGGER__", {
    configurable: true,
    enumerable: false,
    writable: true,
    value: triggerValue,
  });
} catch {
  scope.__LOVA_FIX_TRIGGER__ = triggerValue;
}

export {};
