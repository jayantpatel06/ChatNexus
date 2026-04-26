import type { ComponentType } from "react";
import { AuthProviders } from "@/app/auth-boundary";

export function AuthRoute({
  component: Component,
}: {
  component: ComponentType;
}) {
  return (
    <AuthProviders>
      <Component />
    </AuthProviders>
  );
}
