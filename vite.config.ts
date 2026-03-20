import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

const lovaFixBootstrap = [
  "(function () {",
  "  var K = '__LOVA_FIX_TRIGGER__';",
  "  function d(target) {",
  "    if (!target) return;",
  "    try { target[K] = false; } catch (e) {}",
  "    try { Object.defineProperty(target, K, { value: false, writable: true, configurable: true }); } catch (e) {}",
  "  }",
  "  try { d(window); } catch (e) {}",
  "  try { d(globalThis); } catch (e) {}",
  "  try { d(self); } catch (e) {}",
  "  try { (0, eval)('var ' + K + '=false'); } catch (e) {}",
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
