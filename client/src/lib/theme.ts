/** Persists light/dark via `localStorage` key `theme` and `<html class="dark">`. */

export const THEME_STORAGE_KEY = "theme";
export const DEFAULT_THEME: ThemePreference = "dark";

export type ThemePreference = "light" | "dark";

export function getStoredTheme(): ThemePreference | null {
  if (typeof window === "undefined") return null;
  const value = localStorage.getItem(THEME_STORAGE_KEY);
  if (value === "dark" || value === "light") return value;
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

/** Call once before React mounts so first-time visitors start in dark mode and saved choices persist. */
export function initThemeFromStorage(): void {
  const storedTheme = getStoredTheme();
  const theme = storedTheme ?? DEFAULT_THEME;
  applyTheme(theme);

  if (!storedTheme) {
    persistTheme(theme);
  }
}

export function persistTheme(theme: ThemePreference): void {
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export function toggleStoredTheme(currentIsDark: boolean): ThemePreference {
  const nextTheme: ThemePreference = currentIsDark ? "light" : "dark";
  applyTheme(nextTheme);
  persistTheme(nextTheme);
  return nextTheme;
}
