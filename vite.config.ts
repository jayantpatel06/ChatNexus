import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Function to load Replit plugins safely
const loadReplitPlugins = async () => {
  // Skip Replit plugins entirely in production or when REPL_ID is not set
  if (process.env.NODE_ENV === "production" || !process.env.REPL_ID) {
    return [];
  }

  try {
    const plugins = [];
    
    const { default: runtimeErrorOverlay } = await import("@replit/vite-plugin-runtime-error-modal");
    const { cartographer } = await import("@replit/vite-plugin-cartographer");
    const { devBanner } = await import("@replit/vite-plugin-dev-banner");
    
    plugins.push(runtimeErrorOverlay());
    plugins.push(cartographer());
    plugins.push(devBanner());
    
    return plugins;
  } catch (error) {
    console.log('Replit plugins not available, continuing without them');
    return [];
  }
};

export default defineConfig(async () => {
  const replitPlugins = await loadReplitPlugins();
  
  return {
    plugins: [
      react(),
      ...replitPlugins,
    ],
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

