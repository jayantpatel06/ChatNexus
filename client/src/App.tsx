import "@/styles/effects.css";
import { useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppRouter } from "@/app/router";
import { THEME_STORAGE_KEY, applyTheme } from "@/lib/theme";
import { AuthProvider } from "@/providers/auth-provider";
import { LenisProvider } from "@/providers/lenis-provider";
import { SocketProvider } from "@/providers/socket-provider";
import { queryClient } from "./lib/queryClient";

const APP_BACKGROUND_STYLE = {
  position: "fixed",
  inset: 0,
  zIndex: -1,
  backgroundColor: "black",
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
    <QueryClientProvider client={queryClient}>
      <LenisProvider>
        <TooltipProvider>
          <AuthProvider>
            <SocketProvider>
              <Toaster />
              <div style={APP_BACKGROUND_STYLE}></div>
              <ErrorBoundary>
                <AppRouter />
              </ErrorBoundary>
            </SocketProvider>
          </AuthProvider>
        </TooltipProvider>
      </LenisProvider>
    </QueryClientProvider>
  );
}

export default App;
