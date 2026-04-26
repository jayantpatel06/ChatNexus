import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/theme.css";
import "./index.css";
import "lenis/dist/lenis.css";
import { initThemeFromStorage } from "@/lib/theme";

initThemeFromStorage();

function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) {
    return;
  }

  const register = () => {
    void import("virtual:pwa-register").then(({ registerSW }) => {
      registerSW({ immediate: true });
    });
  };

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(register, { timeout: 3000 });
    return;
  }

  globalThis.setTimeout(register, 0);
}

registerServiceWorker();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
