import "./site-nav.css";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowRight,
  ChevronDown,
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
  ThemeToggleButton2,
  useThemeToggleState,
} from "@/components/theme-toggle";

const LANDING_SECTION_IDS = ["hero", "features", "about", "faq", "support"] as const;
const NAV_LOGO_SRC = "/assets/images/logo-48.webp";

type SiteNavProps = {
  isAuthenticated?: boolean;
};

const NAV_BACKDROP_FILTER = "blur(20px) saturate(1.35)";
const NAV_GLASS_BLUR_STYLE: CSSProperties = {
  backdropFilter: NAV_BACKDROP_FILTER,
  WebkitBackdropFilter: NAV_BACKDROP_FILTER,
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

  const dest = hasSession ? "/direct" : "/auth";
  const mobileMenuItems = hasSession
    ? [{ label: "Dashboard", href: "/direct", Icon: LayoutDashboard }]
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
    if (isLanding && hash) {
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
      <div className="nav-bg" style={NAV_GLASS_BLUR_STYLE} />
      <div className="nav-inner">
        <Link href="/" className="nav-brand-link nav-brand-link--desktop">
          <div className="nav-brand">
            <div className="nav-logo">
              <img
                src={NAV_LOGO_SRC}
                alt="ChatNexus — anonymous stranger chat platform"
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
              alt="ChatNexus — anonymous stranger chat platform"
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

          <div className="nav-dropdown-wrapper">
            <Link href="/features" className={`nav-pill-link nav-dropdown-trigger ${location === "/features" ? "active" : ""}`}>
              Features <ChevronDown className="w-3 h-3 ml-0.5 inline-block" />
            </Link>
            <div className="nav-dropdown-menu">
              <Link href="/anonymous-chat" className="nav-dropdown-item">Anonymous Chat</Link>
              <Link href="/stranger-chat" className="nav-dropdown-item">Private Chat</Link>
              <Link href="/global-chat-room" className="nav-dropdown-item">Global Chat</Link>
              <Link href="/random-chat" className="nav-dropdown-item">Random Chat</Link>
            </div>
          </div>

          {renderLink("Blog", "", "/blog")}
          {renderLink("Help Center", "faq", "/help-center")}
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
              style={NAV_GLASS_BLUR_STYLE}
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
