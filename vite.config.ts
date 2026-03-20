import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

const lovaFixBootstrap = [
  "var __LOVA_FIX_TRIGGER__ = false;",
  "try { window.__LOVA_FIX_TRIGGER__ = false; } catch (e) {}",
  "try { globalThis.__LOVA_FIX_TRIGGER__ = false; } catch (e) {}",
  "try { self.__LOVA_FIX_TRIGGER__ = false; } catch (e) {}",
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
    react(),
    {
      name: "lova-fix-trigger-bootstrap",
      transformIndexHtml() {
        return [
          {
            tag: "script",
            injectTo: "head-prepend",
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
        intro: "var __LOVA_FIX_TRIGGER__ = false;",
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
