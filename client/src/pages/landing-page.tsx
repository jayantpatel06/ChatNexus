import "./landing-page.css";
import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Seo } from "@/components/seo";
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
  Instagram,
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
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const scrollY = useParallax();
  const seoStructuredData = [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "ChatNexus",
      applicationCategory: "CommunicationApplication",
      operatingSystem: "Web",
      url: "https://chatnexus-8vh2.onrender.com/",
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
            <h2 className="section-title">Built for People Who Want to Talk to Strangers</h2>
            <p className="about-text">
              ChatNexus was built for people searching for an Omegle alternative
              that feels faster, cleaner, and more reliable. We focus on
              anonymous chat, real-time messaging, and frictionless entry so you
              can meet new people without fighting the interface.
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
        <section className="features-section" aria-labelledby="stranger-chat-heading">
          <div className="reveal-item section-header">
            <span className="section-tag">Stranger Chat</span>
            <h2 id="stranger-chat-heading" className="section-title">
              Anonymous Chat Without the Usual Friction
            </h2>
            <p className="section-desc">
              If users are searching for random chat, anonymous chat, or sites
              where they can talk to strangers online, ChatNexus gives them a
              faster route into live conversation with guest access, responsive
              messaging, and global community chat.
            </p>
          </div>

          <div className="max-w-[1100px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 px-4">
            <div className="feature-card">
              <h3 className="feature-title">Start Fast</h3>
              <p className="feature-desc">
                Guest access lowers friction for users who want to start a
                stranger chat session immediately.
              </p>
            </div>
            <div className="feature-card">
              <h3 className="feature-title">Stay Anonymous</h3>
              <p className="feature-desc">
                ChatNexus supports lightweight identity and privacy-first flows
                that fit anonymous conversation use cases.
              </p>
            </div>
            <div className="feature-card">
              <h3 className="feature-title">Chat Anywhere</h3>
              <p className="feature-desc">
                Mobile-friendly screens and PWA support help users join random
                conversations from any device.
              </p>
            </div>
          </div>
        </section>

        <section className="faq-section" aria-labelledby="faq-heading">
          <div className="reveal-item faq-inner">
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

        <footer ref={footerRef} className="reveal-item w-full bg-[#0a0c14] border-t border-[rgba(255,255,255,0.06)] px-8 py-16 -mx-4 md:mx-0">
          <div className="max-w-[1200px] mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-12 ">
              {/* Brand Column */}
              <div className="flex flex-col gap-6 md:col-span-1">
                <h2 className="text-2xl font-bold text-[#00c6fb]">ChatNexus</h2>
                <p className="text-[#a0aec0] leading-relaxed text-[15px]">
                  The architect of future communication.<br />
                  We build tools that empower humanity to<br />
                  think faster and solve deeper.
                </p>
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
              <div className="flex flex-col gap-8">
                <h3 className="text-white font-semibold mb-2">Stay Connected</h3>
                <div className="relative">
                  <input 
                    type="email" 
                    placeholder="Email Address" 
                    className="w-full bg-[#181c2b] border border-[rgba(255,255,255,0.06)] rounded-xl py-3 px-4 text-white text-[15px] focus:outline-none focus:border-transparent focus:ring-1 focus:ring-[#00c6fb] transition-all"
                  />
                  <button className="absolute right-4 top-1/2 -translate-y-1/2 text-[#00c6fb] hover:text-white hover:scale-110 transition-all">
                    <Send className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex gap-8">
                  <a href="#" className="w-10 h-10 rounded-full bg-[#181c2b] flex items-center justify-center text-white hover:bg-[#23263a] transition-colors"><Twitter className="w-[18px] h-[18px]" /></a>
                  <a href="#" className="w-10 h-10 rounded-full bg-[#181c2b] flex items-center justify-center text-white hover:bg-[#23263a] transition-colors"><Github className="w-[18px] h-[18px]" /></a>
                  <a href="#" className="w-10 h-10 rounded-full bg-[#181c2b] flex items-center justify-center text-white hover:bg-[#23263a] transition-colors"><Instagram className="w-[18px] h-[18px]" /></a>
                  <a href="#" className="w-10 h-10 rounded-full bg-[#181c2b] flex items-center justify-center text-white hover:bg-[#23263a] transition-colors"><Linkedin className="w-[18px] h-[18px]" /></a>                  
                </div>
              </div>
            </div>            
          </div>
        </footer>
      </div>
    </>
  );
}
