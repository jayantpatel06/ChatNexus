import "./landing-page.css";
import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
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
  Send,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
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

import {
  useReveal,
  useParallax,
  TiltCard,
  MagneticWrap,
  CustomCursor,
  PagePreloader,
  AmbientOrbs,
} from "@/components/effects";

/* ───────────────────── page component ──────────────────── */

export default function LandingPage() {
  const { user } = useAuth();
  const scrollY = useParallax();

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
    const sections = ["hero", "features", "about"];
    const handle = () => {
      if (!navRef.current) return;
      const cur = window.scrollY;
      if (cur > 80) {
        navRef.current.classList.add("nav-scrolled");
      } else {
        navRef.current.classList.remove("nav-scrolled");
      }
      /* scroll-spy: highlight active pill link */
      let activeId = sections[0];
      for (const id of sections) {
        const el = document.getElementById(id);
        if (el && el.offsetTop - 120 <= cur) activeId = id;
      }
      navRef.current.querySelectorAll(".nav-pill-link").forEach((a) => {
        a.classList.toggle("active", a.getAttribute("href") === `#${activeId}`);
      });
    };
    window.addEventListener("scroll", handle, { passive: true });
    handle(); // run once on mount
    return () => window.removeEventListener("scroll", handle);
  }, []);

  /* ── section reveal refs ── */
  const sectionTitleRef = useReveal(0.2);
  const aboutRef = useReveal(0.15);
  const footerRef = useReveal(0.15);

  const dest = user ? "/dashboard" : "/auth";

  return (
    <>
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
                <MessageCircle className="w-5 h-5" />
              </div>
              <span className="nav-name">ChatNexus</span>
            </div>

            <div className="nav-pill">
              <a href="#hero" className="nav-pill-link active">Home</a>
              <a href="#features" className="nav-pill-link">Features</a>
              <a href="#about" className="nav-pill-link">About</a>
            </div>

            <MagneticWrap>
              <Link href={dest}>
                <Button className="nav-cta">
                  {user ? "Dashboard" : "Get Started"}
                  <ArrowRight className="w-4 h-4 ml-1 cta-arrow" />
                </Button>
              </Link>
            </MagneticWrap>
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
            Experience the next generation of real-time communication. Engage
            with friends, share moments, and build communities — securely and
            seamlessly.
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

          <div className="features-grid">
            {FEATURES.map((f, i) => (
              <TiltCard key={f.title} delay={i * 80}>
                <div className="feature-card">
                  <div className="feature-icon-wrap">
                    <f.Icon className="w-7 h-7" />
                  </div>
                  <h3 className="feature-title">{f.title}</h3>
                  <p className="feature-desc">{f.desc}</p>
                </div>
              </TiltCard>
            ))}
          </div>
        </section>

        {/* ═══════ About ═══════ */}
        <section id="about" className="about-section">
          <div ref={aboutRef} className="reveal-item about-inner">
            <span className="section-tag">About</span>
            <h2 className="section-title">Built for People Who Love Chatting</h2>
            <p className="about-text">
              ChatNexus was born from a simple idea: real-time conversations should
              feel effortless, private, and fun. We obsess over speed, security,
              and design so you can focus on what matters — connecting with people.
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
          </div>
        </section>

        {/* ═══════ Footer ═══════ */}
        <footer ref={footerRef} className="reveal-item w-full bg-[#0a0c14] border-t border-[rgba(255,255,255,0.06)] px-8 py-16 -mx-4 md:mx-0">
          <div className="max-w-[1200px] mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
              {/* Brand Column */}
              <div className="flex flex-col gap-6 md:col-span-1">
                <h2 className="text-2xl font-bold text-[#00c6fb]">ChatNexus</h2>
                <p className="text-[#a0aec0] leading-relaxed text-[15px]">
                  The architect of future communication.<br />
                  We build tools that empower humanity to<br />
                  think faster and solve deeper.
                </p>
                <div className="flex gap-4">
                  <a href="#" className="w-10 h-10 rounded-full bg-[#181c2b] flex items-center justify-center text-white hover:bg-[#23263a] transition-colors"><Twitter className="w-[18px] h-[18px]" /></a>
                  <a href="#" className="w-10 h-10 rounded-full bg-[#181c2b] flex items-center justify-center text-white hover:bg-[#23263a] transition-colors"><Github className="w-[18px] h-[18px]" /></a>
                </div>
              </div>

              {/* Platform Column */}
              <div className="flex flex-col gap-4">
                <h3 className="text-white font-semibold mb-2">Platform</h3>
                <a href="#" className="text-[#a0aec0] hover:text-white transition-colors text-[15px]">Documentation</a>
                <a href="#" className="text-[#a0aec0] hover:text-white transition-colors text-[15px]">API Status</a>
                <a href="#" className="text-[#a0aec0] hover:text-white transition-colors text-[15px]">Enterprise Integrations</a>
                <a href="#" className="text-[#a0aec0] hover:text-white transition-colors text-[15px]">Custom Solutions</a>
              </div>

              {/* Company Column */}
              <div className="flex flex-col gap-4">
                <h3 className="text-white font-semibold mb-2">Company</h3>
                <a href="#" className="text-[#a0aec0] hover:text-white transition-colors text-[15px]">About ChatNexus</a>
                <a href="#" className="text-[#a0aec0] hover:text-white transition-colors text-[15px]">Contact Us</a>
                <a href="#" className="text-[#a0aec0] hover:text-white transition-colors text-[15px]">Privacy Policy</a>
                <a href="#" className="text-[#a0aec0] hover:text-white transition-colors text-[15px]">Terms of Service</a>
              </div>

              {/* Subscribe Column */}
              <div className="flex flex-col gap-4">
                <h3 className="text-white font-semibold mb-2">Stay Connected</h3>
                <p className="text-[#a0aec0] text-[15px]">
                  Get the latest on AI breakthroughs<br />delivered to your nexus.
                </p>
                <div className="relative mt-2">
                  <input 
                    type="email" 
                    placeholder="Email Address" 
                    className="w-full bg-[#181c2b] border border-[rgba(255,255,255,0.06)] rounded-xl py-3 px-4 text-white text-[15px] focus:outline-none focus:border-transparent focus:ring-1 focus:ring-[#00c6fb] transition-all"
                  />
                  <button className="absolute right-3 top-1/2 -translate-y-1/2 text-[#00c6fb] hover:text-white hover:scale-110 transition-all">
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom Bar */}
            
          </div>
        </footer>
      </div>
    </>
  );
}
