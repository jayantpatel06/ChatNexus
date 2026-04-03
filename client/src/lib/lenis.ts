import type Lenis from "lenis";

let appLenis: Lenis | null = null;

type ScrollToSectionOptions = {
  offset?: number;
  immediate?: boolean;
  updateHash?: boolean;
};

export function setAppLenis(instance: Lenis | null) {
  appLenis = instance;
}

export function getAppLenis() {
  return appLenis;
}

export function scrollToSectionId(
  sectionId: string,
  { offset = 0, immediate = false, updateHash = true }: ScrollToSectionOptions = {},
) {
  if (typeof window === "undefined") {
    return false;
  }

  const target = document.getElementById(sectionId);

  if (!target) {
    return false;
  }

  const nextUrl = new URL(window.location.href);
  nextUrl.hash = sectionId;

  const syncHash = () => {
    if (!updateHash) {
      return;
    }

    window.history.replaceState(null, "", nextUrl.toString());
  };

  if (appLenis) {
    appLenis.scrollTo(target, {
      offset,
      immediate,
      force: true,
      onComplete: syncHash,
    });

    if (immediate) {
      syncHash();
    }

    return true;
  }

  target.scrollIntoView({
    behavior: immediate ? "auto" : "smooth",
    block: "start",
  });
  syncHash();
  return true;
}
