import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        manifest: false,
        includeAssets: [
          "assets/images/logo-32.png",
          "assets/images/logo-48.png",
          "assets/images/apple-touch-icon.png",
          "assets/images/pwa-icon-192.png",
          "assets/images/pwa-icon-512.png",
          "assets/images/pwa-icon-maskable-512.png",
        ],
        workbox: {
          cleanupOutdatedCaches: true,
        },
      }),
    ],
    envDir: process.cwd(),
    resolve: {
      alias: {
        "@": path.resolve(process.cwd(), "client", "src"),
        "@shared": path.resolve(process.cwd(), "shared"),
      },
    },
    root: path.resolve(process.cwd(), "client"),
    build: {
      outDir: path.resolve(process.cwd(), "dist/public"),
      emptyOutDir: true,
    },
    server: {
      fs: {
        strict: true,
        deny: ["**/.*"],
      },
    },
  };
});
