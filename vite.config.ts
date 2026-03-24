import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  define: {
    __LOVA_FIX_TRIGGER__:
      "(typeof globalThis !== 'undefined' && typeof globalThis.__LOVA_FIX_TRIGGER__ === 'boolean' ? globalThis.__LOVA_FIX_TRIGGER__ : false)",
  },
  plugins: [...react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
}));
