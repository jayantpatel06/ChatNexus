import { Suspense, lazy, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { PageLoader } from "@/components/page-loader";
import { queryClient } from "@/lib/queryClient";
import { AuthProvider, useAuth } from "@/providers/auth-provider";

const SocketProvider = lazy(() =>
  import("@/providers/socket-provider").then((module) => ({
    default: module.SocketProvider,
  })),
);

export function AuthProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

export function AuthenticatedSocketBoundary({
  children,
}: {
  children: ReactNode;
}) {
  const { user } = useAuth();

  if (!user) {
    return <>{children}</>;
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <SocketProvider>{children}</SocketProvider>
    </Suspense>
  );
}
