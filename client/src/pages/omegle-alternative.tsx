import "./features-page.css";
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Seo, getSiteUrl } from "@/components/seo";
import {
  ArrowRight,
  Check,
  Globe,
  Lock,
  MessageSquare,
  Shield,
  Smartphone,
  UserPlus,
  Users,
  X,
  Zap,
} from "lucide-react";
import PageFooter from "@/components/page-footer";
import SiteNav from "@/components/site-nav";
import {
  CustomCursor,
  AmbientOrbs,
  useParallax,
  useReveal,
  MagneticWrap,
} from "@/components/effects";

const COMPARISON_FEATURES = [
  { feature: "Text Chat", chatNexus: true, omegle: true },
  { feature: "No Signup Required", chatNexus: true, omegle: true },
  { feature: "Guest Access", chatNexus: true, omegle: false },
  { feature: "Global Chat Rooms", chatNexus: true, omegle: false },
  { feature: "Friend Requests", chatNexus: true, omegle: false },
  { feature: "Mobile PWA App", chatNexus: true, omegle: false },
  { feature: "Theme Customization", chatNexus: true, omegle: false },
  { feature: "Message History", chatNexus: true, omegle: false },
  { feature: "Video Chat Required", chatNexus: false, omegle: true },
  { feature: "Still Active in 2026", chatNexus: true, omegle: false },
];

const FAQS = [
  {
    question: "Is there a site like Omegle that still works in 2026?",
    answer:
      "Yes. ChatNexus is a fully functional Omegle alternative that's actively maintained in 2026. It offers instant stranger chat, global rooms, and guest access — all without requiring video or a webcam.",
  },
  {
    question: "What is the best free alternative to Omegle?",
    answer:
      "ChatNexus is widely considered the best free Omegle alternative. It provides anonymous text chat, random stranger matching, global chat rooms, and a mobile-friendly PWA — all completely free with no premium tiers.",
  },
  {
    question: "Why did Omegle shut down?",
    answer:
      "Omegle shut down in November 2023 after 14 years of operation. The founder cited ongoing misuse concerns and the unsustainability of fighting abuse on the platform. ChatNexus was built to fill this gap with modern safety features and responsible design.",
  },
  {
    question: "Is ChatNexus safe to use?",
    answer:
      "ChatNexus uses encrypted connections, rate limiting, and user blocking tools. Guest sessions are ephemeral, registered message history may be retained for direct chats, and we never sell user data.",
  },
  {
    question: "Do I need a webcam to use ChatNexus?",
    answer:
      "No. ChatNexus is a text-based chat platform. Unlike Omegle which emphasized video chat, ChatNexus focuses on real-time text messaging, making it accessible on any device without a camera.",
  },
  {
    question: "Can I use ChatNexus on my phone?",
    answer:
      "Yes. ChatNexus is a Progressive Web App (PWA) that works on all mobile browsers and can be installed to your home screen like a native app. No app store download required.",
  },
];

const WHY_SWITCH_FEATURES = [
  {
    Icon: Zap,
    title: "Sub-50ms Message Delivery",
    desc: "Messages arrive faster than you can blink. WebSocket-powered real-time chat with in-memory caching.",
  },
  {
    Icon: Shield,
    title: "Privacy by Default",
    desc: "No data harvesting, no ad tracking. Guest sessions are ephemeral and conversations belong to you.",
  },
  {
    Icon: Globe,
    title: "Global Chat Rooms",
    desc: "Join live global chat rooms with users from around the world. Not just 1-on-1 — join the conversation.",
  },
  {
    Icon: UserPlus,
    title: "Instant Guest Access",
    desc: "Start chatting in under 10 seconds as a guest. No email, no phone number, no signup friction.",
  },
  {
    Icon: Smartphone,
    title: "Mobile-First PWA",
    desc: "Install ChatNexus on any device. Works offline-capable, feels native, and updates automatically.",
  },
  {
    Icon: Users,
    title: "Friend Requests & DMs",
    desc: "Met someone interesting? Send a friend request and keep the conversation going with direct messaging.",
  },
];

export default function OmegleAlternativePage() {
  const scrollY = useParallax();
  const [loaded, setLoaded] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const contentRef = useReveal(0.1);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setLoaded(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!loaded || !heroRef.current) return;
    const animation = heroRef.current.animate(
      [
        { opacity: 0, transform: "translateY(40px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      {
        duration: 800,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        fill: "forwards",
      },
    );
    return () => animation.cancel();
  }, [loaded]);

  const siteUrl = getSiteUrl();
  const structuredData = [
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
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
        {
          "@type": "ListItem",
          position: 2,
          name: "Omegle Alternative",
          item: `${siteUrl}/omegle-alternative`,
        },
      ],
    },
  ];

  return (
    <>
      <Seo
        title="Best Omegle Alternative in 2026 — ChatNexus Free Random Chat"
        description="Looking for a site like Omegle? ChatNexus is the best free Omegle alternative with instant stranger chat, global rooms, guest access, and no video required."
        path="/omegle-alternative"
        keywords="omegle alternative, sites like omegle, omegle replacement, best omegle alternative 2026, free omegle alternative, omegle shut down, chat like omegle"
        structuredData={structuredData}
      />
      <div className="landing-root">
        <CustomCursor />
        <AmbientOrbs scrollY={scrollY} />
        <SiteNav />

        {/* ═══════ Hero ═══════ */}
        <section className="features-hero" ref={heroRef} style={{ opacity: 0 }}>
          <span className="section-tag">Omegle Alternative</span>
          <h1 className="features-hero-title">
            <span className="hero-line">The Best Omegle Alternative</span>
            <span className="hero-line hero-line--accent">in 2026.</span>
          </h1>
          <p className="features-hero-sub">
            Omegle shut down in November 2023. ChatNexus picked up where it left
            off — faster, safer, and completely free. Instant stranger chat,
            global rooms, guest access, and zero video requirements. Start
            talking to strangers in seconds.
          </p>

          <div className="hero-cta-row" style={{ justifyContent: "center", marginTop: "2rem" }}>
            <MagneticWrap>
              <Link href="/auth" className="hero-btn-primary">
                Start Chatting Free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </MagneticWrap>
          </div>
        </section>

        {/* ═══════ What Happened to Omegle ═══════ */}
        <section ref={contentRef} className="reveal-item features-section" style={{ paddingTop: "4rem" }}>
          <div className="section-header">
            <span className="section-tag">Background</span>
            <h2 className="section-title">What Happened to Omegle?</h2>
          </div>
          <div className="mx-auto max-w-3xl px-4">
            <p className="text-brand-text text-base leading-7 mb-4">
              Omegle was one of the most popular random chat platforms on the
              internet, connecting millions of strangers for text and video
              conversations since 2009. In November 2023, founder Leif K-Brooks
              announced the permanent shutdown of Omegle, citing the
              unsustainability of fighting platform misuse and the emotional toll
              of operating the service.
            </p>
            <p className="text-brand-text text-base leading-7 mb-4">
              Since Omegle's closure, millions of users have searched for
              alternatives that offer the same spontaneous stranger chat
              experience with better safety features and modern technology.
              ChatNexus was built to fill this gap.
            </p>
            <p className="text-brand-text text-base leading-7">
              Unlike Omegle, ChatNexus doesn't require video or a webcam. It
              focuses on{" "}
              <Link href="/stranger-chat" className="text-brand-primary hover:underline">
                text-based stranger chat
              </Link>
              , offering{" "}
              <Link href="/anonymous-chat" className="text-brand-primary hover:underline">
                anonymous conversations
              </Link>
              , global chat rooms, guest access, and a privacy-first design that
              respects user data.
            </p>
          </div>
        </section>

        {/* ═══════ Why Switch ═══════ */}
        <section className="features-section" style={{ paddingTop: "2rem" }}>
          <div className="section-header">
            <span className="section-tag">Why Switch</span>
            <h2 className="section-title">Why ChatNexus Is a Better Omegle Alternative</h2>
          </div>

          <div className="mx-auto mt-8 grid max-w-[1100px] gap-6 px-4 sm:grid-cols-2 lg:grid-cols-3">
            {WHY_SWITCH_FEATURES.map(({ Icon, title, desc }) => (
              <div
                key={title}
                className="bento-feature-card group relative flex flex-col items-center overflow-hidden rounded-3xl p-8 text-center"
              >
                <div className="bento-feature-icon-shell relative mb-6 rounded-full p-4">
                  <Icon className="bento-feature-icon h-8 w-8" strokeWidth={1.5} />
                </div>
                <h3 className="bento-feature-title mb-3">{title}</h3>
                <p className="landing-card-copy">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ═══════ Comparison Table ═══════ */}
        <section className="features-section" style={{ paddingTop: "2rem" }}>
          <div className="section-header">
            <span className="section-tag">Comparison</span>
            <h2 className="section-title">ChatNexus vs Omegle</h2>
          </div>

          <div className="mx-auto mt-8 max-w-2xl px-4">
            <div className="overflow-hidden rounded-2xl border border-brand-border bg-brand-card/20">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-brand-border text-brand-text/70">
                    <th className="px-6 py-4 font-medium">Feature</th>
                    <th className="px-6 py-4 text-center font-medium">ChatNexus</th>
                    <th className="px-6 py-4 text-center font-medium">Omegle</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_FEATURES.map(({ feature, chatNexus, omegle }, i) => (
                    <tr
                      key={feature}
                      className={
                        i < COMPARISON_FEATURES.length - 1
                          ? "border-b border-white/5"
                          : ""
                      }
                    >
                      <td className="px-6 py-3 text-brand-text">{feature}</td>
                      <td className="px-6 py-3 text-center">
                        {chatNexus ? (
                          <Check className="mx-auto h-5 w-5 text-green-400" />
                        ) : (
                          <X className="mx-auto h-5 w-5 text-red-400/60" />
                        )}
                      </td>
                      <td className="px-6 py-3 text-center">
                        {omegle ? (
                          <Check className="mx-auto h-5 w-5 text-green-400" />
                        ) : (
                          <X className="mx-auto h-5 w-5 text-red-400/60" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ═══════ FAQ ═══════ */}
        <section className="features-section" style={{ paddingTop: "2rem" }}>
          <div className="section-header">
            <span className="section-tag">FAQ</span>
            <h2 className="section-title">Frequently Asked Questions</h2>
          </div>

          <div className="mx-auto mt-8 max-w-3xl space-y-6 px-4">
            {FAQS.map(({ question, answer }) => (
              <details
                key={question}
                className="group rounded-2xl border border-brand-border bg-brand-card/20 px-6 py-5 transition-colors hover:bg-brand-card/40"
              >
                <summary className="cursor-pointer list-none text-base font-medium text-brand-text [&::-webkit-details-marker]:hidden">
                  {question}
                </summary>
                <p className="mt-3 text-sm leading-6 text-brand-text">{answer}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ═══════ CTA ═══════ */}
        <section className="features-section" style={{ paddingTop: "2rem", paddingBottom: "6rem" }}>
          <div className="section-header">
            <h2 className="section-title">Ready to Try the Best Omegle Alternative?</h2>
            <p className="section-desc" style={{ marginBottom: "32px" }}>
              Join thousands of users already chatting on ChatNexus — free forever.
              <br />
              <Link href="/features" className="text-brand-primary hover:underline">
                See all features
              </Link>
              {" · "}
              <Link href="/random-chat" className="text-brand-primary hover:underline">
                Try random chat
              </Link>
              {" · "}
              <Link href="/stranger-chat" className="text-brand-primary hover:underline">
                Start stranger chat
              </Link>
            </p>
          </div>
          <div className="flex justify-center">
            <MagneticWrap>
              <Link href="/auth" className="hero-btn-primary">
                Get Started Free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </MagneticWrap>
          </div>
        </section>

        <PageFooter />
      </div>
    </>
  );
}
