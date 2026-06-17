import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  plugins: [preact()],
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:4319",
      "/media": "http://127.0.0.1:4319",
      "/mcp": "http://127.0.0.1:4319",
      "/ws": { target: "ws://127.0.0.1:4319", ws: true },
    },
  },
});
