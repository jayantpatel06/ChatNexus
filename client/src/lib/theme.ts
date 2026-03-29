/** Persists light/dark via `localStorage` key `theme` and `<html class="dark">`. */

export const THEME_STORAGE_KEY = "theme";

export type ThemePreference = "light" | "dark";

export function getStoredTheme(): ThemePreference | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(THEME_STORAGE_KEY);
  if (v === "dark" || v === "light") return v;
  return null;
}

export function applyTheme(theme: ThemePreference): void {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

/** Call once before React mounts so all routes respect saved preference (no flash). */
export function initThemeFromStorage(): void {
  const stored = getStoredTheme();
  if (stored) {
    applyTheme(stored);
  }
}

export function persistTheme(theme: ThemePreference): void {
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export function toggleStoredTheme(currentIsDark: boolean): ThemePreference {
  const next: ThemePreference = currentIsDark ? "light" : "dark";
  applyTheme(next);
  persistTheme(next);
  return next;
}
