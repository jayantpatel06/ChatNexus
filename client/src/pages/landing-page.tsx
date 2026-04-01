import "./landing-page.css";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Seo, getSiteUrl } from "@/components/seo";
import {
  ArrowRight,
  ChevronDown,
  Fingerprint,
  Gauge,
  Globe,
  Shield,
  Users,
  VenetianMask,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useAuth } from "@/providers/auth-provider";
import PageFooter from "@/components/page-footer";
import SiteNav from "@/components/site-nav";
import {
  useReveal,
  MagneticWrap,
  CustomCursor,
  PagePreloader,
  AmbientOrbs,
} from "@/components/effects";
import gsap from "gsap";
import { Global } from "recharts";
import GlobalChat from "./global-chat-page";
type FaqItem = {
  category: string;
  question: string;
  answer: string;
};

const LANDING_FAQS: readonly FaqItem[] = [
  {
    category: "Getting Started",
    question: "How do I start chatting on ChatNexus?",
    answer:
      "Open ChatNexus, enter as a guest or sign in, and jump straight into a conversation. You can explore live rooms or start a private random chat in just a few taps.",
  },
  {
    category: "Access",
    question: "Can I use ChatNexus without creating an account?",
    answer:
      "Yes. Guest access is built in, so you can start talking to strangers first and decide later if you want a more permanent profile.",
  },
  {
    category: "Privacy",
    question: "Are my chats private and anonymous?",
    answer:
      "ChatNexus is designed around anonymous entry and privacy-first flows, so you can meet new people without sharing more information than you want to.",
  },
  {
    category: "Devices",
    question: "Does ChatNexus work on mobile and desktop?",
    answer:
      "Yes. The interface is responsive, installable as a PWA, and built to feel fast on phones, tablets, and desktop browsers.",
  },
  {
    category: "Features",
    question: "What can I do besides one-to-one stranger chat?",
    answer:
      "You can join global rooms, move between live conversations quickly, and use ChatNexus for both casual discovery and more active community chat.",
  },
] as const;

/* ───────────────────────── constants ───────────────────────── */

export default function LandingPage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
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
      <PagePreloader
        ready={!isLoading}
        onComplete={() => setLoaded(true)}
      />

      {/* ═══════ Main Content ═══════ */}
      <div className="landing-root" style={{ scrollBehavior: "smooth" }}>
        <CustomCursor />

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
          <div ref={aboutRef} className="reveal-item about-bento-shell">
            <div className="about-bento-head">
              <span className="section-tag">About</span>
              <h2 className="section-title about-bento-section-title">
                The Fastest Way to Talk to Strangers Online
              </h2>
              <p className="about-bento-lead">
                  A modern Omegle alternative designed for people
                  who want to meet new friends and join
                  global conversations instantly.
                </p>
            </div>
            <div className="about-bento-grid">
              <article className="about-bento-card about-bento-card--top-left">
                <h3 className="about-bento-title">Start Fast</h3>
                <p className="about-bento-text">
                  Guest access lets you jump into a stranger chat session
                  immediately, so the first conversation starts in seconds
                  instead of after a long signup flow.
                </p>
              </article>
              <article className="about-bento-card about-bento-card--top-right">
                <h3 className="about-bento-title">Built for Real Time</h3>
                <p className="about-bento-text">
                  Frictionless entry, modern messaging, and fast live updates
                  make every chat feel responsive, lightweight, and easy to
                  continue.
                </p>
              </article>
              <article className="about-bento-card about-bento-card--middle-left">
                <h3 className="about-bento-title">Join Global Conversations</h3>
                <p className="about-bento-text">
                  ChatNexus is built for people who want to meet new friends,
                  discover live rooms, and move between random conversations
                  with a real-time interface that feels immediate and social.
                </p>
              </article>
              <article className="about-bento-card about-bento-card--middle-right">
                <h3 className="about-bento-title">Chat Anywhere</h3>
                <p className="about-bento-text">
                  Mobile-friendly layouts and PWA support help you move between
                  desktop and phone without losing the speed, simplicity, or
                  comfort of the experience.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* ═══════ FAQs ═══════ */}
        <section id="faq" className="faq-section" aria-labelledby="faq-heading">
          <div ref={faqRef} className="reveal-item faq-inner">
            <div className="faq-head">
              <span className="section-tag">FAQ</span>
              <h2 id="faq-heading" className="section-title faq-title">
                Common Questions & Answers
              </h2>
            </div>
            <FaqAccordion items={LANDING_FAQS} />
          </div>
        </section>

        {/* ═══════ Connect ═══════ */}
        <section id="support" className="about-section" style={{ paddingTop: "20px", paddingBottom: "44px" }}>
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
      <div className="bento-feature-card group relative flex flex-col items-center overflow-hidden rounded-3xl p-8 text-center md:col-span-1">
        <div className="bento-feature-icon-shell relative mb-6 rounded-full p-4">
          <div className="absolute inset-0 scale-110 rounded-full border border-brand-primary/20 opacity-0 transition-opacity group-hover:opacity-100" />
          <VenetianMask className="bento-feature-icon h-8 w-8" strokeWidth={1.5} />
        </div>
        <h3 className="bento-feature-title mb-3 text-lg font-semibold tracking-wide">
          Anonymous
        </h3>
        <p className="text-sm leading-relaxed text-brand-muted">
          Start conversations instantly without exposing your identity or
          getting blocked by a long signup flow.
        </p>
      </div>

      <div className="bento-feature-card group relative flex flex-col items-center overflow-hidden rounded-3xl p-8 text-center md:col-span-1">
        <div className="bento-feature-icon-shell relative mb-6 rounded-full p-4">
          <div className="absolute inset-0 scale-110 rounded-full border border-brand-primary/20 opacity-0 transition-opacity group-hover:opacity-100" />
          <Fingerprint className="bento-feature-icon h-8 w-8" strokeWidth={1.5} />
        </div>
        <h3 className="bento-feature-title mb-3 text-lg font-semibold">
          Secure by default
        </h3>
        <p className="text-sm leading-relaxed text-brand-muted">
          No signups required to chat. We don't track your identity or store
          chat logs to ensure your privacy.
        </p>
      </div>

      <div className="bento-feature-card group relative flex flex-col items-center overflow-hidden rounded-3xl p-8 text-center md:col-span-1">
        <div className="bento-feature-icon-shell relative mb-6 rounded-full p-4">
          <div className="absolute inset-0 scale-110 rounded-full border border-brand-primary/20 opacity-0 transition-opacity group-hover:opacity-100" />
          <Gauge className="bento-feature-icon h-8 w-8" strokeWidth={1.5} />
        </div>
        <h3 className="bento-feature-title mb-3 text-lg font-semibold">
          Ultra-low latency
        </h3>
        <p className="text-sm leading-relaxed text-brand-muted">
          Every millisecond counts. Our distributed backend brings latency
          down, feeling faster than light.
        </p>
      </div>

      <div className="bento-feature-card group relative flex flex-col overflow-hidden rounded-3xl p-8 md:col-span-2 md:flex-row">
        <div className="relative z-10 flex flex-col justify-center md:w-[45%]">
          <div className="bento-feature-icon-shell mb-6 flex h-12 w-12 items-center justify-center rounded-full">
            <Globe className="bento-feature-icon h-5 w-5" strokeWidth={1.5} />
          </div>
          <h3 className="bento-feature-title mb-3 text-xl font-semibold">
            Global reach
          </h3>
          <p className="max-w-sm text-sm leading-relaxed text-brand-muted">
            Match with users globally in real-time. We focus on frictionless
            entry, privacy-first flows, and a mobile-friendly experience.
          </p>
        </div>

        <div className="pointer-events-none absolute bottom-0 right-0 top-0 hidden w-1/2 opacity-30 transition-opacity duration-700 group-hover:opacity-60 md:block">
          <svg
            className="bento-feature-map h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <circle cx="20" cy="20" r="1" fill="currentColor" opacity="0.3" />
            <circle cx="30" cy="20" r="1" fill="currentColor" opacity="0.3" />
            <circle cx="40" cy="20" r="1" fill="currentColor" opacity="0.3" />
            <path
              d="M10,80 L15,85 L20,70 L25,75 L30,55 L35,65 L40,80 L50,60 L60,85 L70,50 L75,65 L80,50 L85,45 L90,65 L95,40"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
            />
          </svg>
        </div>
      </div>

      <div className="bento-feature-card group relative flex flex-col items-center overflow-hidden rounded-3xl p-8 text-center md:col-span-1">
        <div className="bento-feature-icon-shell relative z-10 mb-6 flex h-12 w-12 items-center justify-center rounded-full">
          <div className="absolute inset-0 scale-110 rounded-full border border-brand-primary/20 opacity-0 transition-opacity group-hover:opacity-100" />
          <Users className="bento-feature-icon h-5 w-5" strokeWidth={1.5} />
        </div>
        <h3 className="bento-feature-title mb-3 text-lg font-semibold">
          Make connections
        </h3>
        <p className="text-sm leading-relaxed text-brand-muted">
          Meet friends securely. Join a random session instantly.
        </p>
      </div>
    </div>
  );
}

function FaqAccordion({ items }: { items: readonly FaqItem[] }) {
  return (
    <Accordion
      type="single"
      collapsible
      className="faq-accordion"
    >
      {items.map((item, index) => (
        <AccordionItem
          key={item.question}
          value={`faq-${index}`}
          className="faq-accordion-item border-0"
        >
          <AccordionTrigger className="faq-accordion-trigger py-0 hover:no-underline">
            <span className="faq-accordion-row">
              <span className="faq-accordion-question">{item.question}</span>
              <span className="faq-accordion-plus" aria-hidden="true" />
            </span>
          </AccordionTrigger>
          <AccordionContent className="faq-accordion-content">
            <p className="faq-accordion-answer">{item.answer}</p>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
