import { useEffect } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { LazyToaster } from "@/components/lazy-toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppRouter } from "@/app/router";
import { THEME_STORAGE_KEY, applyTheme } from "@/lib/theme";
import { LenisProvider } from "@/providers/lenis-provider";

const APP_BACKGROUND_STYLE = {
  position: "fixed",
  inset: 0,
  zIndex: -1,
  backgroundColor: "var(--background)",
} as const;

function App() {
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_STORAGE_KEY || e.newValue == null) return;
      if (e.newValue === "dark" || e.newValue === "light") {
        applyTheme(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <LenisProvider>
      <TooltipProvider>
        <LazyToaster />
        <div style={APP_BACKGROUND_STYLE}></div>
        <ErrorBoundary>
          <AppRouter />
        </ErrorBoundary>
      </TooltipProvider>
    </LenisProvider>
  );
}

export default App;
