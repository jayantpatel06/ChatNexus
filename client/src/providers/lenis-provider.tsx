import { useEffect, useState, type PropsWithChildren } from "react";
import type Lenis from "lenis";
import { setAppLenis } from "@/lib/lenis";

export function LenisProvider({ children }: PropsWithChildren) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean | null>(
    null,
  );
  const [isPhoneViewport, setIsPhoneViewport] = useState<boolean | null>(null);

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
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const legacyMediaQuery = mediaQuery as MediaQueryList & {
      addListener?: (listener: (event: MediaQueryListEvent) => void) => void;
      removeListener?: (listener: (event: MediaQueryListEvent) => void) => void;
    };
    const syncViewport = () => setIsPhoneViewport(mediaQuery.matches);

    syncViewport();

    if ("addEventListener" in mediaQuery) {
      mediaQuery.addEventListener("change", syncViewport);
      return () => mediaQuery.removeEventListener("change", syncViewport);
    }

    legacyMediaQuery.addListener?.(syncViewport);
    return () => legacyMediaQuery.removeListener?.(syncViewport);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined" || isPhoneViewport === null) {
      return;
    }

    const root = document.documentElement;
    const previousScrollBehavior = root.style.scrollBehavior;

    root.style.scrollBehavior = isPhoneViewport ? "smooth" : "";

    return () => {
      root.style.scrollBehavior = previousScrollBehavior;
    };
  }, [isPhoneViewport]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      prefersReducedMotion === null ||
      isPhoneViewport === null
    ) {
      return;
    }

    if (prefersReducedMotion || isPhoneViewport) {
      setAppLenis(null);
      return;
    }

    let cancelled = false;
    let lenis: Lenis | null = null;

    void import("lenis").then(({ default: LenisConstructor }) => {
      if (cancelled) {
        return;
      }

      lenis = new LenisConstructor({
        autoRaf: true,
        smoothWheel: true,
        syncTouch: true,
        allowNestedScroll: true,
        lerp: 0.09,
        duration: 1,
        syncTouchLerp: 0.075,
        touchMultiplier: 1,
        touchInertiaExponent: 1.7,
      });

      setAppLenis(lenis);
    });

    return () => {
      cancelled = true;
      setAppLenis(null);
      lenis?.destroy();
    };
  }, [isPhoneViewport, prefersReducedMotion]);

  return <>{children}</>;
}
