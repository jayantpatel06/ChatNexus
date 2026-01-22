import * as React from "react";

const MOBILE_BREAKPOINT = 768;

// Helper to get initial value (SSR-safe)
const getInitialIsMobile = () => {
  if (typeof window === "undefined") return false;
  return window.innerWidth < MOBILE_BREAKPOINT;
};

export function useIsMobile() {
  // Initialize with actual value to prevent flash of incorrect UI
  const [isMobile, setIsMobile] = React.useState<boolean>(getInitialIsMobile);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    // Sync state on mount in case SSR value differs
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
