import type { ComponentType } from "react";
import { AuthenticatedSocketBoundary, AuthProviders } from "@/app/auth-boundary";
import { useAuth } from "@/providers/auth-provider";
import { Loader2 } from "lucide-react";
import { Redirect } from "wouter";

function ProtectedRouteLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="h-8 w-8 animate-spin text-border" />
    </div>
  );
}

export function ProtectedRoute({
  component: Component,
}: {
  component: ComponentType;
}) {
  return (
    <AuthProviders>
      <ProtectedRouteContent component={Component} />
    </AuthProviders>
  );
}

function ProtectedRouteContent({
  component: Component,
}: {
  component: ComponentType;
}) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <ProtectedRouteLoader />;
  }

  if (!user) {
    return <Redirect to="/auth" />;
  }

  return (
    <AuthenticatedSocketBoundary>
      <Component />
    </AuthenticatedSocketBoundary>
  );
}
