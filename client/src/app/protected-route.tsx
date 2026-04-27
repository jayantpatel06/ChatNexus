import type { ComponentType } from "react";
import { AuthenticatedSocketBoundary, AuthProviders } from "@/app/auth-boundary";
import { useAuth } from "@/providers/auth-provider";
import { Loader2 } from "lucide-react";
import { Redirect, useLocation } from "wouter";

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
  const [location] = useLocation();

  if (isLoading) {
    return <ProtectedRouteLoader />;
  }

  if (!user) {
    const redirectTarget =
      typeof window !== "undefined"
        ? `${location}${window.location.search}${window.location.hash}`
        : location;
    return <Redirect to={`/auth?redirect=${encodeURIComponent(redirectTarget)}`} />;
  }

  return (
    <AuthenticatedSocketBoundary>
      <Component />
    </AuthenticatedSocketBoundary>
  );
}
