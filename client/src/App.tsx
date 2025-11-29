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
import { ChatThemeProvider } from "@/hooks/use-chat-theme";
import DotGrid from "./DotGrid";

function Router() {
  return (
    <Switch>
      <ProtectedRoute path="/" component={ChatDashboard} />
      <ProtectedRoute path="/global-chat" component={GlobalChat} />
      <Route path="/auth" component={AuthPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
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
                <DotGrid
                  dotSize={6}
                  gap={15}
                  baseColor="#393055"
                  activeColor="#8239FF"
                  proximity={100}
                  shockRadius={220}
                  shockStrength={5}
                  resistance={550}
                  returnDuration={1}
                />
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
