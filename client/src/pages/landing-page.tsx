import "./landing-page.css";
import { useEffect, useRef, useState, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Seo, getSiteUrl } from "@/components/seo";
import {
  MessageCircle,
  Zap,
  Users,
  ShieldCheck,
  MessageSquare,
  Globe,
  Lock,
  Twitter,
  Linkedin,
  Github,
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Send,
  Instagram,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  applyTheme,
  getStoredTheme,
  persistTheme,
  type ThemePreference,
} from "@/lib/theme";
import {
  useReveal,
  useParallax,
  MagneticWrap,
  CustomCursor,
  PagePreloader,
  AmbientOrbs,
} from "@/components/effects";
import gsap from "gsap";

/* ───────────────────────── constants ───────────────────────── */

const FEATURES = [
  {
    Icon: Zap,
    title: "Lightning Fast",
    desc: "Real-time message delivery with zero latency. Stay connected in the exact moment.",
  },
  {
    Icon: ShieldCheck,
    title: "Secure & Private",
    desc: "End-to-end encrypted conversations. Your privacy is our number one priority.",
  },
  {
    Icon: Users,
    title: "Global Communities",
    desc: "Join chat rooms world-wide, meet people with shared interests, and grow your network.",
  },
  {
    Icon: MessageSquare,
    title: "Rich Messaging",
    desc: "Share images, files, and express yourself with a state-of-the-art rich text editor.",
  },
  {
    Icon: Globe,
    title: "Access Anywhere",
    desc: "A responsive experience that works flawlessly on desktop, tablet, and mobile.",
  },
  {
    Icon: Lock,
    title: "Complete Control",
    desc: "Manage presence, message permissions, and fully customise your notifications.",
  },
];

const SOCIALS = [
  { Icon: Twitter, href: "https://twitter.com", label: "Twitter" },
  { Icon: Github, href: "https://github.com", label: "GitHub" },
  { Icon: Linkedin, href: "https://linkedin.com", label: "LinkedIn" },
  { Icon: MessageCircle, href: "https://discord.com", label: "Discord" },
];

const FAQS = [
  {
    question: "What makes ChatNexus a strong Omegle alternative?",
    answer:
      "ChatNexus focuses on fast anonymous chat, guest access, mobile-friendly messaging, and public conversations that help new users jump into live discussions quickly.",
  },
  {
    question: "Can I talk to strangers without a long signup flow?",
    answer:
      "Yes. New users can use guest access to start chatting quickly, then create an account later if they want a more persistent profile.",
  },
  {
    question: "Does ChatNexus work on phones and desktops?",
    answer:
      "Yes. The interface is responsive, installable as a PWA, and designed for real-time chatting across desktop and mobile devices.",
  },
];

function FeaturesStack() {
  const [scrollProgress, setScrollProgress] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      
      // Calculate how far we've scrolled into the features section
      // 0 = just started, 1 = scrolled through the whole track
      const progress = Math.max(0, Math.min(1, -rect.top / (rect.height - windowHeight)));
      setScrollProgress(progress);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div ref={containerRef} className="features-stack-shell">
      <div className="features-stack-hint">
        <span>Scroll to discover power</span>
      </div>

      {FEATURES.map((feature, i) => {
        // cards stack one after another with 32px visible "tops"
        const cardCount = FEATURES.length;
        
        // Progress within this card's section
        // Each card takes a portion of the 1.0 scrollProgress
        const step = 1 / cardCount;
        const start = i * step;
        const end = (i + 1) * step;
        const localizedProgress = Math.max(0, Math.min(1, (scrollProgress - start) / step));
        
        // Receding factor: how much to scale down based on cards ABOVE this one
        // A card scales down as the NEXT cards scroll in.
        const nextCardsProgress = Math.max(0, (scrollProgress - (i + 1) * step) / (1 - (i + 1) * step));
        const progressScale = i === cardCount - 1 ? 1 : Math.max(0.85, 1 - nextCardsProgress * 0.15);

        return (
          <div 
            key={feature.title} 
            className="feature-stack-layer"
            style={{ 
              zIndex: i,
              height: i === cardCount - 1 ? "auto" : "70vh" // Reduced height for tighter stack
            }}
          >
            <article
              className="feature-stack-card"
              style={
                {
                  position: "sticky",
                  top: `calc(100px + ${i * 32}px)`, // Sequential offsets for "deck" look
                  transform: `scale(${progressScale})`,
                  opacity: 1,
                  "--feature-accent-rotation": `${i % 2 === 0 ? -6 : 6}deg`,
                  "--feature-index": i,
                } as React.CSSProperties
              }
            >
              <div className="feature-stack-panel">
                <div className="feature-stack-badge">{i + 1}</div>
                <div className="feature-marker-dot" />
                <div className="feature-stack-copy">
                  <div className="feature-icon-wrap feature-stack-icon mb-6">
                    <feature.Icon className="w-10 h-10" />
                  </div>
                  <div className="flex flex-col gap-4">
                    <span className="feature-kicker">{feature.title}</span>
                    <h3 className="feature-title text-3xl font-black tracking-tight">
                      {feature.title}
                    </h3>
                    <p className="feature-desc text-xl leading-relaxed text-brand-muted max-w-[480px]">
                      {feature.desc}
                    </p>
                  </div>
                </div>
              </div>
            </article>
          </div>
        );
      })}
    </div>
  );
}

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

export default function LandingPage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const scrollY = useParallax();
  const siteUrl = getSiteUrl();
  const seoStructuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "ChatNexus",
      url: `${siteUrl}/`,
      description:
        "Anonymous stranger chat, random conversations, and global messaging.",
    },
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "ChatNexus",
      applicationCategory: "CommunicationApplication",
      operatingSystem: "Web",
      url: `${siteUrl}/`,
      description:
        "ChatNexus is an Omegle alternative for anonymous stranger chat, random conversations, and global messaging.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQS.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: faq.answer,
        },
      })),
    },
  ];

  /* ── preloader state ── */
  const [loaded, setLoaded] = useState(false);

  /* ── hero entrance ── */
  const heroTitle = useRef<HTMLHeadingElement>(null);
  const heroSub = useRef<HTMLParagraphElement>(null);
  const heroCta = useRef<HTMLDivElement>(null);
  const heroScroll = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loaded) return;
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    tl.fromTo(
      heroTitle.current,
      { y: 60, opacity: 0, filter: "blur(8px)" },
      { y: 0, opacity: 1, filter: "blur(0px)", duration: 1 },
    )
      .fromTo(
        heroSub.current,
        { y: 40, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.8 },
        "-=0.5",
      )
      .fromTo(
        heroCta.current,
        { y: 30, opacity: 0, scale: 0.95 },
        { y: 0, opacity: 1, scale: 1, duration: 0.7 },
        "-=0.4",
      )
      .fromTo(
        heroScroll.current,
        { opacity: 0, y: -10 },
        { opacity: 1, y: 0, duration: 0.6 },
        "-=0.2",
      );
  }, [loaded]);

  /* ── nav glass + scroll-spy ── */
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const sections = [
      "hero",
      "features",
      "about",
      "stranger-chat",
      "faq",
      "support",
    ];
    const handle = () => {
      if (!navRef.current) return;
      const cur = window.scrollY;
      if (cur > 80) {
        navRef.current.classList.add("nav-scrolled");
      } else {
        navRef.current.classList.remove("nav-scrolled");
      }
      /* scroll-spy: highlight active pill link (use layout position in document — offsetTop is wrong inside position:relative .landing-root) */
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
    handle(); // run once on mount
    return () => {
      window.removeEventListener("scroll", handle);
      window.removeEventListener("hashchange", handle);
    };
  }, []);

  /* ── section reveal refs (each .reveal-item needs a ref or it stays opacity:0) ── */
  const sectionTitleRef = useReveal(0.2);
  const aboutRef = useReveal(0.15);
  const strangerChatRef = useReveal(0.12);
  const faqRef = useReveal(0.12);
  const footerRef = useReveal(0.15);

  const dest = user ? "/dashboard" : "/auth";

  useEffect(() => {
    if (!isLoading && user) {
      setLocation("/dashboard");
    }
  }, [isLoading, user, setLocation]);

  if (!isLoading && user) {
    return null;
  }

  return (
    <>
      <Seo
        title="ChatNexus | Anonymous Stranger Chat"
        description="ChatNexus helps people talk to strangers through anonymous chat, random conversations, and real-time global messaging on desktop and mobile."
        path="/"
        keywords="Omegle alternative, stranger chat, anonymous chat, random chat, talk to strangers, global chat, guest chat, ChatNexus"
        structuredData={seoStructuredData}
      />
      <PagePreloader onComplete={() => setLoaded(true)} />

      {/* ═══════ Main Content ═══════ */}
      <div className="landing-root">
        <CustomCursor />
        <AmbientOrbs scrollY={scrollY} />

        {/* ═══════ Floating Nav ═══════ */}
        <nav ref={navRef} className="landing-nav">
          <div className="nav-inner">
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

            <div className="nav-pill">
              <a href="#hero" className="nav-pill-link active">
                Home
              </a>
              <a href="#features" className="nav-pill-link">
                Features
              </a>
              <a href="#about" className="nav-pill-link">
                About
              </a>
              <a href="#faq" className="nav-pill-link">
                FAQs
              </a>
              <Link href="/help-center" className="nav-pill-link">
                Support
              </Link>
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

        {/* ═══════ Hero ═══════ */}
        <section id="hero" className="hero">
          <div className="hero-grid" aria-hidden>
            {Array.from({ length: 400 }).map((_, i) => (
              <div key={i} className="grid-dot" />
            ))}
          </div>

          <h1 ref={heroTitle} className="hero-title" style={{ opacity: 0 }}>
            <span className="hero-line">Connect Instantly.</span>
            <span className="hero-line hero-line--accent">Chat Freely.</span>
          </h1>

          <p ref={heroSub} className="hero-sub" style={{ opacity: 0 }}>
            Chat with strangers, join live global rooms, and start anonymous
            conversations in seconds. ChatNexus is built for fast, modern,
            real-time social discovery across mobile and desktop.
          </p>

          <div ref={heroCta} className="hero-cta-row" style={{ opacity: 0 }}>
            <MagneticWrap>
              <Link href={dest}>
                <button className="hero-btn-primary">
                  <span>{user ? "Open Dashboard" : "Start Chatting Now"}</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
              </Link>
            </MagneticWrap>
            <MagneticWrap>
              <a href="#features" className="hero-btn-secondary">
                Explore Features
              </a>
            </MagneticWrap>
          </div>

          <div ref={heroScroll} className="scroll-hint" style={{ opacity: 0 }}>
            <ChevronDown className="w-5 h-5 bounce-y" />
          </div>
        </section>

        {/* ═══════ Features ═══════ */}
        <section id="features" className="features-section">
          <div ref={sectionTitleRef} className="reveal-item section-header">
            <span className="section-tag">Features</span>
            <h2 className="section-title">Why Choose ChatNexus?</h2>
            <p className="section-desc">
              Built for modern communication with top-tier performance and
              security.
            </p>
          </div>

          <FeaturesStack />
        </section>

        {/* ═══════ About ═══════ */}
        <section id="about" className="about-section">
          <div ref={aboutRef} className="reveal-item about-inner">
            <span className="section-tag">About</span>
            <h2 className="section-title">
              The Fastest Way to Talk to Strangers Online
            </h2>
            <p className="about-text">
              ChatNexus is a modern Omegle alternative designed for people who
              want to meet new friends, chat anonymously, and join global
              conversations instantly. We focus on frictionless entry,
              privacy-first flows, and a mobile-friendly experience so you can
              start chatting with strangers in seconds—no long signup required.
            </p>
            <div className="about-stats">
              <div className="about-stat">
                <span className="about-stat-num">10K+</span>
                <span className="about-stat-label">Active Users</span>
              </div>
              <div className="about-stat">
                <span className="about-stat-num">1M+</span>
                <span className="about-stat-label">Messages Sent</span>
              </div>
              <div className="about-stat">
                <span className="about-stat-num">99.9%</span>
                <span className="about-stat-label">Uptime</span>
              </div>
            </div>
            <div className="about-features-grid max-w-[1100px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 px-4 mt-10">
              <div className="feature-card">
                <h3 className="feature-title">Start Fast</h3>
                <p className="feature-desc">
                  Guest access lets you join a stranger chat session
                  immediately—no account needed.
                </p>
              </div>
              <div className="feature-card">
                <h3 className="feature-title">Stay Anonymous</h3>
                <p className="feature-desc">
                  Lightweight identity and privacy-first design keep your
                  conversations safe and anonymous.
                </p>
              </div>
              <div className="feature-card">
                <h3 className="feature-title">Chat Anywhere</h3>
                <p className="feature-desc">
                  Mobile-friendly screens and PWA support help you join random
                  conversations from any device.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════ Footer ═══════ */}

        <section id="faq" className="faq-section" aria-labelledby="faq-heading">
          <div ref={faqRef} className="reveal-item faq-inner">
            <span className="section-tag">FAQ</span>
            <h2 id="faq-heading" className="section-title">
              Questions People Ask Before Using Stranger Chat Sites
            </h2>
            <div className="faq-list">
              {FAQS.map((faq) => (
                <article key={faq.question} className="faq-card">
                  <h3 className="feature-title">{faq.question}</h3>
                  <p className="feature-desc">{faq.answer}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <footer
          id="support"
          ref={footerRef}
          className="reveal-item landing-footer w-full px-4 md:px-8 py-16"
        >
          <div className="max-w-[1200px] mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-12 ">
              {/* Brand Column */}
              <div className="flex flex-col gap-6 md:col-span-1">
                <h2 className="text-2xl font-bold text-brand-primary">
                  ChatNexus
                </h2>
                <p className="text-brand-muted leading-relaxed text-[15px]">
                  The architect of future communication.
                  <br />
                  We build tools that empower humanity to
                  <br />
                  think faster and solve deeper.
                </p>
              </div>

              {/* Platform Column */}
              <div className="flex flex-col gap-4">
                <h3 className="text-brand-text font-semibold mb-2">Platform</h3>
                <a
                  href="#"
                  className="footer-fancy-link text-brand-muted hover:text-brand-text transition-colors text-[15px]"
                >
                  <span>Documentation</span>
                  <svg
                    className="footer-fancy-link__icon"
                    fill="none"
                    viewBox="0 0 10 10"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M1.004 9.166 9.337.833m0 0v8.333m0-8.333H1.004"
                      stroke="currentColor"
                      strokeWidth="1.25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </a>
                <a
                  href="#"
                  className="footer-fancy-link text-brand-muted hover:text-brand-text transition-colors text-[15px]"
                >
                  <span>API Status</span>
                  <svg
                    className="footer-fancy-link__icon"
                    fill="none"
                    viewBox="0 0 10 10"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M1.004 9.166 9.337.833m0 0v8.333m0-8.333H1.004"
                      stroke="currentColor"
                      strokeWidth="1.25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </a>
                <a
                  href="#"
                  className="footer-fancy-link text-brand-muted hover:text-brand-text transition-colors text-[15px]"
                >
                  <span>Enterprise Integrations</span>
                  <svg
                    className="footer-fancy-link__icon"
                    fill="none"
                    viewBox="0 0 10 10"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M1.004 9.166 9.337.833m0 0v8.333m0-8.333H1.004"
                      stroke="currentColor"
                      strokeWidth="1.25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </a>
                <a
                  href="#"
                  className="footer-fancy-link text-brand-muted hover:text-brand-text transition-colors text-[15px]"
                >
                  <span>Custom Solutions</span>
                  <svg
                    className="footer-fancy-link__icon"
                    fill="none"
                    viewBox="0 0 10 10"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M1.004 9.166 9.337.833m0 0v8.333m0-8.333H1.004"
                      stroke="currentColor"
                      strokeWidth="1.25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </a>
              </div>

              {/* Company Column */}
              <div className="flex flex-col gap-4">
                <h3 className="text-white font-semibold mb-2">Company</h3>
                <a
                  href="#"
                  className="footer-fancy-link text-[#a0aec0] hover:text-white transition-colors text-[15px]"
                >
                  <span>About ChatNexus</span>
                  <svg
                    className="footer-fancy-link__icon"
                    fill="none"
                    viewBox="0 0 10 10"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M1.004 9.166 9.337.833m0 0v8.333m0-8.333H1.004"
                      stroke="currentColor"
                      strokeWidth="1.25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </a>
                <a
                  href="/help-center"
                  className="footer-fancy-link text-[#a0aec0] hover:text-white transition-colors text-[15px]"
                >
                  <span>Contact Us</span>
                  <svg
                    className="footer-fancy-link__icon"
                    fill="none"
                    viewBox="0 0 10 10"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M1.004 9.166 9.337.833m0 0v8.333m0-8.333H1.004"
                      stroke="currentColor"
                      strokeWidth="1.25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </a>
                <a
                  href="#"
                  className="footer-fancy-link text-[#a0aec0] hover:text-white transition-colors text-[15px]"
                >
                  <span>Privacy Policy</span>
                  <svg
                    className="footer-fancy-link__icon"
                    fill="none"
                    viewBox="0 0 10 10"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M1.004 9.166 9.337.833m0 0v8.333m0-8.333H1.004"
                      stroke="currentColor"
                      strokeWidth="1.25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </a>
                <a
                  href="#"
                  className="footer-fancy-link text-[#a0aec0] hover:text-white transition-colors text-[15px]"
                >
                  <span>Terms of Service</span>
                  <svg
                    className="footer-fancy-link__icon"
                    fill="none"
                    viewBox="0 0 10 10"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M1.004 9.166 9.337.833m0 0v8.333m0-8.333H1.004"
                      stroke="currentColor"
                      strokeWidth="1.25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </a>
              </div>

              {/* Subscribe Column */}
              <div className="flex flex-col gap-4">
                <h3 className="text-brand-text font-semibold mb-2">
                  Subscribe
                </h3>
                <span className="text-sm">Sign up to get feature updates.</span>
                <div className="relative">
                  <input
                    type="email"
                    placeholder="Email Address"
                    className="w-full rounded-xl border border-brand-border bg-brand-card py-3 px-4 text-brand-text text-[15px] placeholder:text-brand-muted focus:outline-none focus:ring-2 focus:ring-brand-primary/40 transition-all"
                  />
                  <button className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-primary hover:text-brand-text transition-colors">
                    <Send className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex gap-8">
                  <a
                    href="#"
                    className="w-10 h-10 rounded-full border border-brand-border bg-brand-card flex items-center justify-center text-brand-text hover:bg-brand-sidebar transition-colors"
                  >
                    <Twitter className="w-[18px] h-[18px]" />
                  </a>
                  <a
                    href="#"
                    className="w-10 h-10 rounded-full border border-brand-border bg-brand-card flex items-center justify-center text-brand-text hover:bg-brand-sidebar transition-colors"
                  >
                    <Github className="w-[18px] h-[18px]" />
                  </a>
                  <a
                    href="#"
                    className="w-10 h-10 rounded-full border border-brand-border bg-brand-card flex items-center justify-center text-brand-text hover:bg-brand-sidebar transition-colors"
                  >
                    <Instagram className="w-[18px] h-[18px]" />
                  </a>
                  <a
                    href="#"
                    className="w-10 h-10 rounded-full border border-brand-border bg-brand-card flex items-center justify-center text-brand-text hover:bg-brand-sidebar transition-colors"
                  >
                    <Linkedin className="w-[18px] h-[18px]" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
