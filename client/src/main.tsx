import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerSW } from "virtual:pwa-register";
import { initThemeFromStorage } from "@/lib/theme";

initThemeFromStorage();

// Register Service Worker for PWA
registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(<App />);
