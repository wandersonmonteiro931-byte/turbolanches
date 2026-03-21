import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

const lovaFixBootstrap = [
  "(function () {",
  "  var K = '__LOVA_FIX_TRIGGER__';",
  "  try { Function('var __LOVA_FIX_TRIGGER__ = false;')(); } catch (e) {}",
  "  try { (0, eval)('this.__LOVA_FIX_TRIGGER__ = false; var __LOVA_FIX_TRIGGER__ = false;'); } catch (e) {}",
  "  try { if (typeof globalThis !== 'undefined' && typeof globalThis.__LOVA_FIX_TRIGGER__ === 'undefined') globalThis.__LOVA_FIX_TRIGGER__ = false; } catch (e) {}",
  "  function d(target) {",
  "    if (!target) return;",
  "    try { target[K] = false; } catch (e) {}",
  "    try { Object.defineProperty(target, K, { configurable: true, get: function(){ return false; }, set: function(){} }); } catch (e) {}",
  "  }",
  "  try { d(window); } catch (e) {}",
  "  try { d(globalThis); } catch (e) {}",
  "  try { d(self); } catch (e) {}",
  "  try { (0, eval)('this.' + K + '=false; var ' + K + '=false'); } catch (e) {}",
  "})();",
].join("\n");

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    ...react(),
    {
      name: "lova-fix-trigger-transform",
      transform(code, id) {
        if (!/\.[cm]?[jt]sx?$/.test(id)) return null;
        return {
          code: `var __LOVA_FIX_TRIGGER__ = false; try { globalThis.__LOVA_FIX_TRIGGER__ = false; } catch (e) {}\n${code}`,
          map: null,
        };
      },
    },
    {
      name: "lova-fix-trigger-bootstrap",
      transformIndexHtml() {
        return [
          {
            tag: "script",
            injectTo: "head-prepend" as const,
            children: lovaFixBootstrap,
          },
        ];
      },
    },
  ],
  define: {
    __LOVA_FIX_TRIGGER__: "false",
  },
  build: {
    rollupOptions: {
      output: {
        banner: `${lovaFixBootstrap}\nvar __LOVA_FIX_TRIGGER__ = false;`,
        intro: `${lovaFixBootstrap}\nvar __LOVA_FIX_TRIGGER__ = false;`,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
}));
