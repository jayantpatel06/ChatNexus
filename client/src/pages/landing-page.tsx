import "./landing-page.css";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Seo, getSiteUrl } from "@/components/seo";
import {
  ArrowDownToLine,
  ArrowRight,
  ChevronDown,
  Fingerprint,
  Shield,
  Users,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/providers/auth-provider";
import PageFooter from "@/components/page-footer";
import SiteNav from "@/components/site-nav";
import {
  useReveal,
  useParallax,
  MagneticWrap,
  CustomCursor,
  PagePreloader,
  AmbientOrbs,
} from "@/components/effects";
import gsap from "gsap";
type FaqItem = {
  category: string;
  question: string;
  answer: string;
};

const LANDING_FAQS: readonly FaqItem[] = [
  {
    category: "Product",
    question: "What makes ChatNexus a strong Omegle alternative?",
    answer:
      "ChatNexus focuses on fast anonymous chat, guest access, mobile-friendly messaging, and public conversations that help new users jump into live discussions quickly.",
  },
  {
    category: "Access",
    question: "Can I talk to strangers without a long signup flow?",
    answer:
      "Yes. New users can use guest access to start chatting quickly, then create an account later if they want a more persistent profile.",
  },
  {
    category: "Devices",
    question: "Does ChatNexus work on phones and desktops?",
    answer:
      "Yes. The interface is responsive, installable as a PWA, and designed for real-time chatting across desktop and mobile devices.",
  },
] as const;

/* ───────────────────────── constants ───────────────────────── */

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
      mainEntity: LANDING_FAQS.map((faq) => ({
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

  /* ── section reveal refs ── */
  const sectionTitleRef = useReveal(0.2);
  const aboutRef = useReveal(0.15);
  const connectRef = useReveal(0.12);
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
      <div className="landing-root" style={{ scrollBehavior: "smooth" }}>
        <CustomCursor />
        <AmbientOrbs scrollY={scrollY} />

        {/* ═══════ Floating Nav ═══════ */}
        <SiteNav />

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

          <BentoFeatures />
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

        {/* ═══════ FAQs ═══════ */}
        <section id="faq" className="faq-section" aria-labelledby="faq-heading">
          <div ref={faqRef} className="reveal-item faq-inner">
            <span className="section-tag">FAQ</span>
            <h2 id="faq-heading" className="section-title mb-16">
              Questions People Ask Before Using Stranger Chat Sites
            </h2>
            <FaqCards items={LANDING_FAQS} />
          </div>
        </section>

        {/* ═══════ Connect ═══════ */}
        <section id="support" className="about-section" style={{ paddingTop: "40px", paddingBottom: "60px" }}>
          <div ref={connectRef} className="reveal-item about-inner">
            <span className="section-tag">Connect</span>
            <h2 className="section-title">Ready to Meet Someone New?</h2>
            <p className="about-text">
              Whether you're looking for a quick conversation with a stranger,
              want to join the global chat room, or just need a space to be
              yourself — ChatNexus has you covered. No signup walls, no ads,
              just instant, real conversations.
            </p>
            <div className="hero-cta-row">
              <MagneticWrap>
                <Link href={dest}>
                  <button className="hero-btn-primary">
                    <span>{user ? "Open Dashboard" : "Start Chatting Now"}</span>
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </Link>
              </MagneticWrap>
              <MagneticWrap>
                <Link href="/contact" className="hero-btn-secondary">
                  Contact Us
                </Link>
              </MagneticWrap>
            </div>
          </div>
        </section>

        {/* ═══════ Footer ═══════ */}
        <div ref={footerRef} className="reveal-item">
          <PageFooter />
        </div>
      </div>
    </>
  );
}

function BentoFeatures() {
  return (
    <div className="mx-auto mt-12 grid w-full max-w-[1100px] grid-cols-1 gap-6 px-4 md:grid-cols-3">
      <div className="group relative overflow-hidden rounded-3xl border border-white/5 bg-[#0a0a0a]/50 p-8 shadow-2xl backdrop-blur-md transition-colors duration-500 hover:bg-[#0a0a0a]/80 md:col-span-1">
        <div className="relative mb-4">
          <span className="bg-gradient-to-br from-white to-white/60 bg-clip-text text-4xl font-bold text-transparent lg:text-5xl">
            100%
          </span>
          <svg
            className="pointer-events-none absolute -inset-4 h-[calc(100%+2rem)] w-[calc(100%+2rem)] text-brand-primary opacity-60"
            viewBox="0 0 100 50"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="none"
          >
            <path
              d="M10,25 C10,5 90,5 90,25 C90,45 10,45 10,25"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="drop-shadow-[0_0_8px_rgba(var(--brand-primary-rgb),0.5)]"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold tracking-wide text-white">
          Anonymous
        </h3>
      </div>

      <div className="group relative flex flex-col items-center overflow-hidden rounded-3xl border border-white/5 bg-[#0a0a0a]/50 p-8 text-center shadow-xl backdrop-blur-md transition-colors duration-500 hover:bg-[#0a0a0a]/80 md:col-span-1">
        <div className="relative mb-6 rounded-full border border-white/5 bg-white/5 p-4 transition-colors group-hover:bg-white/10">
          <div className="absolute inset-0 scale-110 rounded-full border border-brand-primary/20 opacity-0 transition-opacity group-hover:opacity-100" />
          <Fingerprint className="h-8 w-8 text-white/80" strokeWidth={1.5} />
        </div>
        <h3 className="mb-3 text-lg font-semibold text-white">
          Secure by default
        </h3>
        <p className="text-sm leading-relaxed text-brand-muted">
          No signups required to chat. We don't track your identity or store
          chat logs to ensure your privacy.
        </p>
      </div>

      <div className="group relative flex flex-col items-center overflow-hidden rounded-3xl border border-white/5 bg-[#0a0a0a]/50 p-8 text-center shadow-xl backdrop-blur-md transition-colors duration-500 hover:bg-[#0a0a0a]/80 md:col-span-1">
        <div className="pointer-events-none absolute left-0 right-0 top-6 flex h-24 flex-col justify-between px-6">
          <div className="mb-2 flex w-full items-center justify-between text-[10px] text-white/30">
            <span className="flex items-center gap-1">
              <ArrowDownToLine className="h-3 w-3" />
              Connect
            </span>
            <span>&lt; 50 ms</span>
          </div>
          <svg
            className="h-full w-full opacity-40 transition-opacity group-hover:opacity-70"
            viewBox="0 0 100 30"
            preserveAspectRatio="none"
          >
            <path
              d="M0,25 Q10,10 20,20 T40,15 T60,25 T80,5 T100,20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-white"
            />
            <path
              d="M0,25 Q10,10 20,20 T40,15 T60,25 T80,5 T100,20 L100,30 L0,30 Z"
              fill="url(#spark-gradient)"
              opacity="0.1"
            />
            <defs>
              <linearGradient id="spark-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" className="text-white" />
                <stop offset="100%" stopColor="transparent" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div className="mt-auto pt-24">
          <h3 className="mb-3 text-lg font-semibold text-white">
            Ultra-low latency
          </h3>
          <p className="text-sm leading-relaxed text-brand-muted">
            Every millisecond counts. Our distributed backend brings latency
            down, feeling faster than light.
          </p>
        </div>
      </div>

      <div className="group relative flex flex-col overflow-hidden rounded-3xl border border-white/5 bg-[#0a0a0a]/50 p-8 shadow-xl backdrop-blur-md transition-colors duration-500 hover:bg-[#0a0a0a]/80 md:col-span-2 md:flex-row">
        <div className="relative z-10 flex flex-col justify-center md:w-[45%]">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full border border-white/5 bg-white/5 transition-colors group-hover:bg-white/10">
            <Shield className="h-5 w-5 text-white/80" strokeWidth={1.5} />
          </div>
          <h3 className="mb-3 text-xl font-semibold text-white">
            Global reach
          </h3>
          <p className="max-w-sm text-sm leading-relaxed text-brand-muted">
            Match with users globally in real-time. We focus on frictionless
            entry, privacy-first flows, and a mobile-friendly experience.
          </p>
        </div>

        <div className="pointer-events-none absolute bottom-0 right-0 top-0 hidden w-1/2 opacity-30 transition-opacity duration-700 group-hover:opacity-60 md:block">
          <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <circle cx="20" cy="20" r="1" fill="#fff" opacity="0.3" />
            <circle cx="30" cy="20" r="1" fill="#fff" opacity="0.3" />
            <circle cx="40" cy="20" r="1" fill="#fff" opacity="0.3" />
            <path
              d="M10,80 L15,85 L20,70 L25,75 L30,55 L35,65 L40,80 L50,60 L60,85 L70,50 L75,65 L80,50 L85,45 L90,65 L95,40"
              fill="none"
              stroke="#fff"
              strokeWidth="1"
            />
          </svg>
        </div>
      </div>

      <div className="group relative flex flex-col overflow-hidden rounded-3xl border border-white/5 bg-[#0a0a0a]/50 p-8 shadow-xl backdrop-blur-md transition-colors duration-500 hover:bg-[#0a0a0a]/80 md:col-span-1">
        <div className="z-10 mb-6 flex h-12 w-12 items-center justify-center rounded-full border border-white/5 bg-white/5 transition-colors group-hover:bg-white/10">
          <Users className="h-5 w-5 text-white/80" strokeWidth={1.5} />
        </div>
        <div className="z-10 mb-20 mt-auto">
          <h3 className="mb-3 text-lg font-semibold text-white">
            Make connections
          </h3>
          <p className="text-sm leading-relaxed text-brand-muted">
            Meet friends securely. Join a random session instantly.
          </p>
        </div>

        <div className="pointer-events-none absolute bottom-4 right-4 flex flex-col items-end gap-3 opacity-80 transition-opacity group-hover:opacity-100">
          <div className="flex translate-x-2 items-center gap-2 rounded-full border border-white/10 bg-black/40 py-1 pl-3 pr-1 transition-transform duration-500 group-hover:-translate-x-2">
            <span className="text-[10px] font-medium text-white/70">Guest_92</span>
            <Avatar className="h-6 w-6 border border-white/10">
              <AvatarFallback className="bg-gradient-to-tr from-brand-primary to-purple-500 text-[8px] text-white">
                G
              </AvatarFallback>
            </Avatar>
          </div>

          <div className="flex -translate-x-4 items-center gap-2 rounded-full border border-white/10 bg-black/40 py-1 pl-1 pr-3 transition-transform duration-700 group-hover:translate-x-2">
            <Avatar className="h-6 w-6 border border-white/10">
              <AvatarFallback className="bg-gradient-to-tr from-cyan-500 to-blue-500 text-[8px] text-white">
                X
              </AvatarFallback>
            </Avatar>
            <span className="text-[10px] font-medium text-white/70">Stranger</span>
          </div>

          <div className="flex translate-x-4 items-center gap-2 rounded-full border border-white/10 bg-black/40 py-1 pl-3 pr-1 transition-transform duration-1000 group-hover:-translate-x-4">
            <span className="text-[10px] font-medium text-white/70">Guest_14</span>
            <Avatar className="h-6 w-6 border border-white/10">
              <AvatarFallback className="bg-gradient-to-tr from-orange-500 to-amber-500 text-[8px] text-white">
                G
              </AvatarFallback>
            </Avatar>
          </div>
        </div>
      </div>
    </div>
  );
}

function FaqCards({ items }: { items: readonly FaqItem[] }) {
  const [currentFaqIndex, setCurrentFaqIndex] = useState(0);
  const currentFaq = items[currentFaqIndex] ?? items[0];

  const handlePrev = () => {
    setCurrentFaqIndex((previousIndex) =>
      previousIndex === 0 ? items.length - 1 : previousIndex - 1,
    );
  };

  const handleNext = () => {
    setCurrentFaqIndex((previousIndex) =>
      previousIndex === items.length - 1 ? 0 : previousIndex + 1,
    );
  };

  if (!currentFaq) {
    return null;
  }

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative mb-8 flex items-center justify-center">
        {Array.from({ length: 12 }).map((_, index) => (
          <div
            key={index}
            className="absolute h-96 w-80 rounded-3xl"
            style={{
              background: `hsl(${(index * 30) % 360}, 60%, 60%)`,
              transform: `rotate(${index * 15}deg) scale(1.05)`,
              zIndex: 0,
              opacity: 0.15,
            }}
          />
        ))}
        <div className="relative z-10 flex h-96 w-80 flex-col items-center justify-center rounded-3xl bg-white p-6 shadow-2xl">
          <span className="mb-4 self-start rounded-full bg-gray-200 px-4 py-1 text-sm text-gray-700">
            {currentFaq.category}
          </span>
          <h2 className="mb-4 text-left text-2xl font-semibold text-gray-900">
            {currentFaq.question}
          </h2>
          <p className="mt-auto text-left text-base text-gray-700">
            {currentFaq.answer}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-8">
        <button
          type="button"
          onClick={handlePrev}
          className="rounded-full px-4 py-2 text-2xl text-white transition hover:bg-gray-800"
          aria-label="Previous FAQ"
        >
          &#60;
        </button>
        <span className="text-lg text-white">Swipe</span>
        <button
          type="button"
          onClick={handleNext}
          className="rounded-full px-4 py-2 text-2xl text-white transition hover:bg-gray-800"
          aria-label="Next FAQ"
        >
          &#62;
        </button>
      </div>
    </div>
  );
}
