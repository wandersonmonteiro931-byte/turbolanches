declare global {
  var __LOVA_FIX_TRIGGER__: boolean | undefined;
}

const root = globalThis as typeof globalThis & {
  __LOVA_FIX_TRIGGER__?: boolean;
  window?: typeof window;
  self?: typeof globalThis;
};

const scopes = [root, root.window, root.self].filter(Boolean) as Array<typeof root>;
const resolvedValue = scopes.some((scope) => scope.__LOVA_FIX_TRIGGER__ === true);

for (const scope of scopes) {
  try {
    Object.defineProperty(scope, "__LOVA_FIX_TRIGGER__", {
      configurable: true,
      enumerable: false,
      writable: true,
      value: resolvedValue,
    });
  } catch {
    scope.__LOVA_FIX_TRIGGER__ = resolvedValue;
  }
}

export {};
