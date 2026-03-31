import "./site-nav.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { MagneticWrap } from "@/components/effects";
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

function AnimatedThemeToggle({ className }: { className?: string }) {
  const [isDark, setIsDark] = useState(() =>
    typeof window !== "undefined"
      ? (getStoredTheme() ??
          (document.documentElement.classList.contains("dark")
            ? "dark"
            : "light")) === "dark"
      : false,
  );

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
    };

    if (!viewTransitionDocument.startViewTransition) {
      switchTheme();
      return;
    }

    viewTransitionDocument.startViewTransition(switchTheme);
  }, [isDark]);

  return (
    <button
      type="button"
      className={`landing-theme-toggle ${className ?? ""}`.trim()}
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <span className="sr-only">Toggle theme</span>
      <svg viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g className={`landing-theme-toggle__core${isDark ? " is-dark" : ""}`}>
          <path
            d="M120 67.5C149.25 67.5 172.5 90.75 172.5 120C172.5 149.25 149.25 172.5 120 172.5"
            fill="white"
          />
          <path
            d="M120 67.5C90.75 67.5 67.5 90.75 67.5 120C67.5 149.25 90.75 172.5 120 172.5"
            fill="black"
          />
        </g>
        <path
          className={`landing-theme-toggle__ring${isDark ? " is-dark" : ""}`}
          d="M120 3.75C55.5 3.75 3.75 55.5 3.75 120C3.75 184.5 55.5 236.25 120 236.25C184.5 236.25 236.25 184.5 236.25 120C236.25 55.5 184.5 3.75 120 3.75ZM120 214.5V172.5C90.75 172.5 67.5 149.25 67.5 120C67.5 90.75 90.75 67.5 120 67.5V25.5C172.5 25.5 214.5 67.5 214.5 120C214.5 172.5 172.5 214.5 120 214.5Z"
          fill="white"
        />
      </svg>
    </button>
  );
}

export default function SiteNav() {
  const { user } = useAuth();
  const [location] = useLocation();
  const isLanding = location === "/";
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isLanding) return;

    const sections = ["hero", "features", "about", "faq", "support"];
    const handle = () => {
      if (!navRef.current) return;
      const cur = window.scrollY;
      if (cur > 80) {
        navRef.current.classList.add("nav-scrolled");
      } else {
        navRef.current.classList.remove("nav-scrolled");
      }
      const sectionTop = (id: string) => {
        const el = document.getElementById(id);
        if (!el) return Number.POSITIVE_INFINITY;
        return el.getBoundingClientRect().top + window.scrollY;
      };
      let activeId = sections[0];
      for (const id of sections) {
        if (sectionTop(id) - 120 <= cur) activeId = id;
      }
      navRef.current.querySelectorAll(".nav-pill-link").forEach((a) => {
        a.classList.toggle("active", a.getAttribute("href") === `#${activeId}`);
      });
    };
    window.addEventListener("scroll", handle, { passive: true });
    window.addEventListener("hashchange", handle);
    handle(); 
    return () => {
      window.removeEventListener("scroll", handle);
      window.removeEventListener("hashchange", handle);
    };
  }, [isLanding]);

  const dest = user ? "/dashboard" : "/auth";

  const renderLink = (label: string, hash: string, path: string) => {
    if (isLanding) {
      return (
        <a href={`#${hash}`} className="nav-pill-link">
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
        <Link href="/">
          <div className="nav-brand">
            <div className="nav-logo">
              <img
                src="/assets/images/image.png"
                alt="ChatNexus Logo"
                className="h-10 w-auto object-contain"
              />
            </div>
            <span className="nav-name">ChatNexus</span>
          </div>
        </Link>

        <div className="nav-pill">
          {renderLink("Home", "hero", "/")}
          {renderLink("Features", "features", "/features")}
          {renderLink("About", "about", "/about")}
          {renderLink("FAQs", "faq", "/help-center")}
          {renderLink("Contact", "support", "/contact")}
        </div>

        <div className="nav-actions">
          <AnimatedThemeToggle />
          <MagneticWrap>
            <Link href={dest}>
              <Button className="nav-cta">
                <span className="nav-cta-label">
                  {user ? "Dashboard" : "Get Started"}
                </span>
                <ArrowRight className="w-4 h-4 ml-1 cta-arrow" />
              </Button>
            </Link>
          </MagneticWrap>
        </div>
      </div>
    </nav>
  );
}
