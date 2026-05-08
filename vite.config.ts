import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ command }) => {
  const root = fileURLToPath(new URL(".", import.meta.url));
  return {
    base: command === "build" ? "./" : "/",
    resolve: {
      alias: {
        "@": path.resolve(root, "src"),
      },
    },
    plugins: [react(), tailwindcss()],
    clearScreen: false,
    server: {
      port: 1420,
      strictPort: true,
      proxy: {
        "/api": {
          target: "http://127.0.0.1:8765",
          changeOrigin: true,
        },
      },
    },
    envPrefix: ["VITE_", "TAURI_"],
  };
});
