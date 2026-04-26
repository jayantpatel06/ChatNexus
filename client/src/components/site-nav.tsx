import "./site-nav.css";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowRight,
  LayoutDashboard,
  LogIn,
  Menu,
  MoonStar,
  SunMedium,
  UserPlus,
  UserRound,
} from "lucide-react";
import { MagneticWrap } from "@/components/effects";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { scrollToSectionId } from "@/lib/lenis";
import { hasValidStoredAuthSession } from "@/lib/auth-storage";
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

const LANDING_SECTION_IDS = ["hero", "features", "about", "faq", "support"] as const;
const NAV_LOGO_SRC = "/assets/images/logo-48.png";

type SiteNavProps = {
  isAuthenticated?: boolean;
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

function useThemeToggleState() {
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

export const ThemeToggleButton2 = ({
  className = "",
}: {
  className?: string;
}) => {
  const { clipPathId, isDark, toggleTheme } = useThemeToggleState();

  return (
    <button
      type="button"
      className={cn(
        "landing-theme-toggle rounded-full transition-all duration-300 active:scale-95",
        className,
      )}
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
};

function ThemeToggleMenuItem() {
  const { isDark, toggleTheme } = useThemeToggleState();
  const Icon = isDark ? SunMedium : MoonStar;

  return (
    <DropdownMenuItem onSelect={() => toggleTheme()} className="nav-mobile-menu__item">
      <Icon className="h-4 w-4" />
      <span>{isDark ? "Light mode" : "Dark mode"}</span>
    </DropdownMenuItem>
  );
}

export default function SiteNav({ isAuthenticated }: SiteNavProps = {}) {
  const [location, setLocation] = useLocation();
  const isLanding = location === "/";
  const navRef = useRef<HTMLElement>(null);
  const [hasSession, setHasSession] = useState(
    () => isAuthenticated ?? hasValidStoredAuthSession(),
  );

  useEffect(() => {
    if (isAuthenticated !== undefined) {
      setHasSession(isAuthenticated);
      return;
    }

    const syncStoredSession = () => {
      setHasSession(hasValidStoredAuthSession());
    };

    window.addEventListener("storage", syncStoredSession);
    window.addEventListener("focus", syncStoredSession);
    return () => {
      window.removeEventListener("storage", syncStoredSession);
      window.removeEventListener("focus", syncStoredSession);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isLanding || !navRef.current) return;

    const navNode = navRef.current;
    const navLinks = Array.from(
      navNode.querySelectorAll<HTMLAnchorElement>(".nav-pill-link"),
    );
    const sectionOffsets = new Map<string, number>();
    let frameId: number | null = null;

    const measureSections = () => {
      for (const id of LANDING_SECTION_IDS) {
        sectionOffsets.set(
          id,
          document.getElementById(id)?.offsetTop ?? Number.POSITIVE_INFINITY,
        );
      }
    };

    const updateNav = () => {
      frameId = null;
      const currentY = window.scrollY;
      navNode.classList.toggle("nav-scrolled", currentY > 80);

      let activeId: string = LANDING_SECTION_IDS[0];
      for (const id of LANDING_SECTION_IDS) {
        if ((sectionOffsets.get(id) ?? Number.POSITIVE_INFINITY) - 120 <= currentY) {
          activeId = id;
        }
      }

      for (const link of navLinks) {
        link.classList.toggle("active", link.getAttribute("href") === `#${activeId}`);
      }
    };

    const queueNavUpdate = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(updateNav);
    };

    const refreshSections = () => {
      measureSections();
      queueNavUpdate();
    };

    window.addEventListener("scroll", queueNavUpdate, { passive: true });
    window.addEventListener("resize", refreshSections);
    window.addEventListener("hashchange", queueNavUpdate);
    window.addEventListener("load", refreshSections);
    refreshSections();
    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener("scroll", queueNavUpdate);
      window.removeEventListener("resize", refreshSections);
      window.removeEventListener("hashchange", queueNavUpdate);
      window.removeEventListener("load", refreshSections);
    };
  }, [isLanding]);

  const dest = hasSession ? "/dashboard" : "/auth";
  const mobileMenuItems = hasSession
    ? [{ label: "Dashboard", href: "/dashboard", Icon: LayoutDashboard }]
    : [
        { label: "Login", href: "/auth?mode=login", Icon: LogIn },
        { label: "Sign Up", href: "/auth?mode=register", Icon: UserPlus },
        { label: "Login as Guest", href: "/auth?mode=guest", Icon: UserRound },
      ];

  const handleLandingSectionClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>, hash: string) => {
      event.preventDefault();
      const sectionOffset = hash === "hero" ? 0 : -10;
      scrollToSectionId(hash, { offset: sectionOffset });
    },
    [],
  );

  const renderLink = (label: string, hash: string, path: string) => {
    if (isLanding) {
      return (
        <a
          href={`#${hash}`}
          className="nav-pill-link"
          onClick={(event) => handleLandingSectionClick(event, hash)}
        >
          {label}
        </a>
      );
    }
    return (
      <Link href={path} className={`nav-pill-link ${location === path ? "active" : ""}`}>
        {label}
      </Link>
    );
  };

  return (
    <nav ref={navRef} className="site-nav">
      <div className="nav-inner">
        <Link href="/" className="nav-brand-link nav-brand-link--desktop">
          <div className="nav-brand">
            <div className="nav-logo">
              <img
                src={NAV_LOGO_SRC}
                alt=""
                className="nav-logo-img"
                width="48"
                height="48"
                decoding="async"
              />
            </div>
            <span className="nav-name">ChatNexus</span>
          </div>
        </Link>

        <Link href="/" className="nav-mobile-logo-link" aria-label="ChatNexus home">
          <div className="nav-logo">
            <img
              src={NAV_LOGO_SRC}
              alt=""
              className="nav-logo-img"
              width="48"
              height="48"
              decoding="async"
            />
          </div>
        </Link>

        <Link href="/" className="nav-mobile-name-link" aria-label="ChatNexus home">
          <span className="nav-name nav-name--mobile">ChatNexus</span>
        </Link>

        <div className="nav-pill">
          {renderLink("Home", "hero", "/")}
          {renderLink("Features", "features", "/features")}
          {renderLink("About", "about", "/about")}
          {renderLink("FAQs", "faq", "/help-center")}
          {renderLink("Contact", "support", "/contact")}
        </div>

        <div className="nav-actions">
          <ThemeToggleButton2 className="nav-theme-toggle" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="landing-theme-toggle nav-mobile-menu-trigger"
                aria-label="Open account menu"
                title="Open account menu"
              >
                <Menu className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={10}
              className="nav-mobile-menu w-46 rounded-2xl p-2"
            >
              {mobileMenuItems.map(({ label, href, Icon }) => (
                <DropdownMenuItem
                  key={href}
                  onSelect={() => setLocation(href)}
                  className="nav-mobile-menu__item"
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator className="nav-mobile-menu__separator" />
              <ThemeToggleMenuItem />
            </DropdownMenuContent>
          </DropdownMenu>
          <MagneticWrap>
            <Link
              href={dest}
              className="nav-cta"
              aria-label={hasSession ? "Open dashboard" : "Get started"}
              title={hasSession ? "Open dashboard" : "Get started"}
            >
              <span className="nav-cta-label">
                {hasSession ? "Dashboard" : "Get Started"}
              </span>
              <ArrowRight className="w-4 h-4 ml-1 cta-arrow" />
            </Link>
          </MagneticWrap>
        </div>
      </div>
    </nav>
  );
}
