import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

function injectBingSiteVerification(verification: string | undefined): Plugin {
  return {
    name: "inject-bing-site-verification",
    transformIndexHtml(html) {
      const v = verification?.trim();
      if (!v) return html;
      return html.replace(
        "</head>",
        `    <meta name="msvalidate.01" content="${v.replace(/"/g, "&quot;")}" />\n  </head>`,
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [
      injectBingSiteVerification(env.VITE_BING_SITE_VERIFICATION),
      react(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: [
          "assets/images/logo-32.png",
          "assets/images/logo-48.png",
          "assets/images/apple-touch-icon.png",
        ],
        manifest: {
          id: "/",
          start_url: "/",
          scope: "/",
          name: "ChatNexus",
          short_name: "ChatNexus",
          description:
            "Anonymous stranger chat, random conversations, and global messaging.",
          theme_color: "#161a19",
          background_color: "#161a19",
          display: "standalone",
          orientation: "portrait",
          icons: [
            {
              src: "/assets/images/pwa-icon-192.png",
              sizes: "192x192",
              type: "image/png",
            },
            {
              src: "/assets/images/pwa-icon-512.png",
              sizes: "512x512",
              type: "image/png",
            },
            {
              src: "/assets/images/pwa-icon-maskable-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: "module",
          navigateFallback: "index.html",
        },
      }),
    ],
    envDir: process.cwd(),
    resolve: {
      alias: {
        "@": path.resolve(process.cwd(), "client", "src"),
        "@shared": path.resolve(process.cwd(), "shared"),
        "@assets": path.resolve(process.cwd(), "attached_assets"),
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
