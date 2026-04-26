import { Suspense, lazy } from "react";
import { useToast } from "@/hooks/use-toast";

const Toaster = lazy(() =>
  import("@/components/ui/toaster").then((module) => ({
    default: module.Toaster,
  })),
);

export function LazyToaster() {
  const { toasts } = useToast();

  if (toasts.length === 0) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <Toaster />
    </Suspense>
  );
}
