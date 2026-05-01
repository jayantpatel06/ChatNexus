/** Persists light/dark via `localStorage` key `theme` and `<html class="dark">`. */

export const THEME_STORAGE_KEY = "theme";
export const DEFAULT_THEME: ThemePreference = "dark";
const FALLBACK_DARK_THEME_COLOR = "#161a19";
const FALLBACK_LIGHT_THEME_COLOR = "#f1f5f9";

export type ThemePreference = "light" | "dark";

function updateMetaThemeColor(name: string, color: string): void {
  const metaTag = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!metaTag) return;
  metaTag.setAttribute("content", color);
}

function resolveBrowserChromeColor(theme: ThemePreference): string {
  if (typeof window === "undefined") {
    return theme === "dark" ? FALLBACK_DARK_THEME_COLOR : FALLBACK_LIGHT_THEME_COLOR;
  }

  const bodyBackground = document.body
    ? getComputedStyle(document.body).backgroundColor.trim()
    : "";

  if (bodyBackground) {
    return bodyBackground;
  }

  const rootBackground = getComputedStyle(document.documentElement)
    .getPropertyValue("--background")
    .trim();

  if (rootBackground) {
    return rootBackground;
  }

  return theme === "dark" ? FALLBACK_DARK_THEME_COLOR : FALLBACK_LIGHT_THEME_COLOR;
}

function syncBrowserChromeTheme(theme: ThemePreference): void {
  if (typeof document === "undefined") return;

  const color = resolveBrowserChromeColor(theme);
  document.documentElement.style.colorScheme = theme;
  updateMetaThemeColor("theme-color", color);
  updateMetaThemeColor("msapplication-TileColor", color);
}

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

  syncBrowserChromeTheme(theme);
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
