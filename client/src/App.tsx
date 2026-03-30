import "@/styles/effects.css";
import { useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import { SocketProvider } from "@/hooks/use-socket";
import { ProtectedRoute } from "./lib/protected-route";
import ChatDashboard from "@/pages/chat-dashboard";
import GlobalChat from "@/pages/global-chat";
import AuthPage from "@/pages/auth-page";
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/landing-page";
import HelpCenterPage from "@/pages/help-center";
import { ChatThemeProvider } from "@/hooks/use-chat-theme";
import { THEME_STORAGE_KEY, applyTheme } from "@/lib/theme";

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <ProtectedRoute path="/dashboard" component={ChatDashboard} />
      <ProtectedRoute path="/global-chat" component={GlobalChat} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/help-center" component={HelpCenterPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

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
      <TooltipProvider>
        <AuthProvider>
          <SocketProvider>
            <Toaster />
            <ChatThemeProvider>
              <div
                style={{
                  position: "fixed",
                  inset: 0,
                  zIndex: -1,
                  backgroundColor: "black",
                }}
              >
              </div>
              <Router />
            </ChatThemeProvider>
          </SocketProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
