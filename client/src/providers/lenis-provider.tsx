import { useEffect, useState, type PropsWithChildren } from "react";
import Lenis from "lenis";
import { setAppLenis } from "@/lib/lenis";

export function LenisProvider({ children }: PropsWithChildren) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean | null>(
    null,
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const legacyMediaQuery = mediaQuery as MediaQueryList & {
      addListener?: (listener: (event: MediaQueryListEvent) => void) => void;
      removeListener?: (listener: (event: MediaQueryListEvent) => void) => void;
    };
    const syncPreference = () => setPrefersReducedMotion(mediaQuery.matches);

    syncPreference();

    if ("addEventListener" in mediaQuery) {
      mediaQuery.addEventListener("change", syncPreference);
      return () => mediaQuery.removeEventListener("change", syncPreference);
    }

    legacyMediaQuery.addListener?.(syncPreference);
    return () => legacyMediaQuery.removeListener?.(syncPreference);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || prefersReducedMotion === null) {
      return;
    }

    if (prefersReducedMotion) {
      setAppLenis(null);
      return;
    }

    const lenis = new Lenis({
      autoRaf: true,
      smoothWheel: true,
      syncTouch: true,
      allowNestedScroll: true,
      lerp: 0.09,
      duration: 1,
    });

    setAppLenis(lenis);

    return () => {
      setAppLenis(null);
      lenis.destroy();
    };
  }, [prefersReducedMotion]);

  return <>{children}</>;
}
