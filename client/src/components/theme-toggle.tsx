import "./theme-toggle.css";
import {
  useCallback,
  useEffect,
  useId,
  useState,
  type CSSProperties,
} from "react";
import { cn } from "@/lib/utils";
import {
  applyTheme,
  getStoredTheme,
  persistTheme,
  type ThemePreference,
} from "@/lib/theme";

type ThemeAnimationStart =
  | "bottom-up"
  | "top-down"
  | "left-right"
  | "right-left";

const THEME_TOGGLE_BACKDROP_FILTER = "blur(20px) saturate(1.35)";
const THEME_TOGGLE_GLASS_BLUR_STYLE: CSSProperties = {
  backdropFilter: THEME_TOGGLE_BACKDROP_FILTER,
  WebkitBackdropFilter: THEME_TOGGLE_BACKDROP_FILTER,
};

function createThemeTransitionCss(
  start: ThemeAnimationStart = "bottom-up",
  blur = false,
) {
  const getClipPath = (direction: ThemeAnimationStart) => {
    switch (direction) {
      case "top-down":
        return {
          from: "polygon(0% 0%, 100% 0%, 100% 0%, 0% 0%)",
          to: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
        };
      case "left-right":
        return {
          from: "polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%)",
          to: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
        };
      case "right-left":
        return {
          from: "polygon(100% 0%, 100% 0%, 100% 100%, 100% 100%)",
          to: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
        };
      case "bottom-up":
      default:
        return {
          from: "polygon(0% 100%, 100% 100%, 100% 100%, 0% 100%)",
          to: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
        };
    }
  };

  const clipPath = getClipPath(start);

  return `
    ::view-transition-group(root) {
      animation-duration: 0.7s;
      animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
    }

    ::view-transition-new(root) {
      animation-name: landing-theme-reveal-${start}${blur ? "-blur" : ""};
      ${blur ? "filter: blur(2px);" : ""}
    }

    ::view-transition-old(root),
    .dark::view-transition-old(root) {
      animation: none;
      z-index: -1;
    }

    .dark::view-transition-new(root) {
      animation-name: landing-theme-reveal-${start}${blur ? "-blur" : ""};
      ${blur ? "filter: blur(2px);" : ""}
    }

    @keyframes landing-theme-reveal-${start}${blur ? "-blur" : ""} {
      from {
        clip-path: ${clipPath.from};
        ${blur ? "filter: blur(8px);" : ""}
      }
      ${blur ? "50% { filter: blur(4px); }" : ""}
      to {
        clip-path: ${clipPath.to};
        ${blur ? "filter: blur(0px);" : ""}
      }
    }
  `;
}

export function useThemeToggleState() {
  const [isDark, setIsDark] = useState(() =>
    typeof window !== "undefined"
      ? (getStoredTheme() ??
          (document.documentElement.classList.contains("dark")
            ? "dark"
            : "light")) === "dark"
      : false,
  );
  const clipPathId = useId().replace(/:/g, "");

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggleTheme = useCallback(() => {
    const viewTransitionDocument = document as Document & {
      startViewTransition?: (callback: () => void) => void;
    };
    const nextTheme: ThemePreference = isDark ? "light" : "dark";
    const styleId = "landing-theme-transition-styles";
    const css = createThemeTransitionCss("bottom-up", false);

    let styleElement = document.getElementById(
      styleId,
    ) as HTMLStyleElement | null;
    if (!styleElement) {
      styleElement = document.createElement("style");
      styleElement.id = styleId;
      document.head.appendChild(styleElement);
    }
    styleElement.textContent = css;

    const switchTheme = () => {
      applyTheme(nextTheme);
      persistTheme(nextTheme);
      setIsDark(nextTheme === "dark");
      window.dispatchEvent(new Event("chatnexus-theme-change"));
    };

    if (!viewTransitionDocument.startViewTransition) {
      switchTheme();
      return;
    }

    viewTransitionDocument.startViewTransition(switchTheme);
  }, [isDark]);

  return { clipPathId, isDark, toggleTheme };
}

export function ThemeToggleButton2({ className = "" }: { className?: string }) {
  const { clipPathId, isDark, toggleTheme } = useThemeToggleState();

  return (
    <button
      type="button"
      className={cn(
        "landing-theme-toggle rounded-full transition-all duration-300 active:scale-95",
        className,
      )}
      style={THEME_TOGGLE_GLASS_BLUR_STYLE}
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={isDark}
    >
      <span className="sr-only">Toggle theme</span>
      <svg
        className="landing-theme-toggle__icon"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        fill="currentColor"
        strokeLinecap="round"
        viewBox="0 0 32 32"
      >
        <defs>
          <clipPath id={clipPathId}>
            <path
              d="M0-5h30a1 1 0 0 0 9 13v24H0Z"
              style={{
                transform: isDark ? "translate(-12px, 10px)" : "translate(0px, 0px)",
                transformOrigin: "center",
                transformBox: "fill-box",
                transition: "transform 0.35s ease-in-out",
              }}
            />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipPathId})`}>
          <circle
            cx="16"
            cy="16"
            r="8"
            style={{
              transform: isDark ? "scale(1.25)" : "scale(1)",
              transformOrigin: "center",
              transformBox: "fill-box",
              transition: "transform 0.35s ease-in-out",
            }}
          />
          <g
            stroke="currentColor"
            strokeWidth="1.5"
            style={{
              opacity: isDark ? 0 : 1,
              transform: isDark ? "rotate(-100deg) scale(0.5)" : "rotate(0deg) scale(1)",
              transformOrigin: "center",
              transformBox: "fill-box",
              transition:
                "transform 0.35s ease-in-out, opacity 0.35s ease-in-out",
            }}
          >
            <path d="M16 5.5v-4" />
            <path d="M16 30.5v-4" />
            <path d="M1.5 16h4" />
            <path d="M26.5 16h4" />
            <path d="m23.4 8.6 2.8-2.8" />
            <path d="m5.7 26.3 2.9-2.9" />
            <path d="m5.8 5.8 2.8 2.8" />
            <path d="m23.4 23.4 2.9 2.9" />
          </g>
        </g>
      </svg>
    </button>
  );
}
