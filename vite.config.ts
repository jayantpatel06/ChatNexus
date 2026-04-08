import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

const DEFAULT_SITE_URL = "https://chatnexus.me";

function resolveSiteUrl(mode: string) {
  const env = loadEnv(mode, process.cwd(), "");
  const configuredSiteUrl =
    env.VITE_SITE_URL?.trim() || env.SITE_URL?.trim() || DEFAULT_SITE_URL;

  return configuredSiteUrl.replace(/\/+$/, "");
}

function staticSiteUrlPlugin(siteUrl: string): Plugin {
  return {
    name: "chatnexus-static-site-url",
    transformIndexHtml(html) {
      return html.replace(/%VITE_SITE_URL%/g, siteUrl);
    },
  };
}

export default defineConfig(({ mode }) => {
  const siteUrl = resolveSiteUrl(mode);

  return {
    plugins: [
      staticSiteUrlPlugin(siteUrl),
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
          navigateFallbackDenylist: [
            /^\/sitemap\.xml$/,
            /^\/robots\.txt$/,
            /^\/favicon\.ico$/,
            /^\/manifest\.json$/,
          ],
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
