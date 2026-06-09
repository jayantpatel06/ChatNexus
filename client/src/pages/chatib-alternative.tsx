import "./features-page.css";
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Seo, getSiteUrl } from "@/components/seo";
import {
  ArrowRight,
  Ban,
  Check,
  Clock,
  EyeOff,
  Globe,
  MessageSquare,
  Shield,
  Smartphone,
  UserPlus,
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
  { feature: "Zero Ads", chatNexus: true, competitor: false },
  { feature: "Instant Online/Offline Status", chatNexus: true, competitor: false },
  { feature: "Sub-50ms Message Delivery", chatNexus: true, competitor: false },
  { feature: "Modern Dark/Light Themes", chatNexus: true, competitor: false },
  { feature: "Guest Access Without Registration", chatNexus: true, competitor: true },
  { feature: "Mobile-Optimized PWA", chatNexus: true, competitor: false },
  { feature: "Global Chat Rooms", chatNexus: true, competitor: true },
  { feature: "End-to-End Encrypted Connections", chatNexus: true, competitor: false },
];

const FAQS = [
  {
    question: "Is ChatNexus a better alternative to Chatib?",
    answer:
      "Yes. ChatNexus offers a significantly faster, modern, and ad-free experience compared to Chatib. With instant online/offline status updates, sub-50ms message delivery, and no intrusive pop-ups, it's designed for 2026.",
  },
  {
    question: "Does ChatNexus have ads like Chatib?",
    answer:
      "No. ChatNexus is 100% ad-free. We believe chatting should be an uninterrupted experience, completely free from banner ads, pop-ups, and trackers.",
  },
  {
    question: "Do I need to register to use ChatNexus?",
    answer:
      "No registration is required. Just like Chatib, you can enter ChatNexus as a guest instantly. No email or phone number needed.",
  },
  {
    question: "How fast is message delivery on ChatNexus?",
    answer:
      "Messages on ChatNexus are delivered in under 50 milliseconds using WebSocket technology. You'll never experience the lag or dropped messages common on older chat platforms.",
  },
  {
    question: "Can I use ChatNexus on my phone?",
    answer:
      "Absolutely. ChatNexus is a Progressive Web App (PWA), meaning it feels and performs like a native mobile app without requiring an App Store download.",
  },
];

const WHY_SWITCH_FEATURES = [
  {
    Icon: Ban,
    title: "100% Ad-Free Experience",
    desc: "No banner ads, no pop-ups, no video ads. Enjoy an uninterrupted, clean interface focused entirely on your conversations.",
  },
  {
    Icon: Zap,
    title: "Instant Status & Delivery",
    desc: "See who is online instantly. Real-time presence updates and sub-50ms message delivery so you're never waiting for a reply to load.",
  },
  {
    Icon: Smartphone,
    title: "Modern, Responsive UI",
    desc: "Leave the 2010s behind. ChatNexus features a beautiful, glassmorphic design that works flawlessly on desktop and mobile.",
  },
  {
    Icon: Shield,
    title: "Encrypted & Private",
    desc: "Your conversations are secured with industry-standard WSS encryption. We don't store your private guest chats permanently.",
  },
  {
    Icon: Globe,
    title: "Active Global Rooms",
    desc: "Jump into fast-paced global chat rooms to meet people from all over the world instantly.",
  },
  {
    Icon: UserPlus,
    title: "Instant Guest Access",
    desc: "Start chatting in 10 seconds. No forced registrations or email verifications required.",
  },
];

export default function ChatibAlternativePage() {
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
          name: "Chatib Alternative",
          item: `${siteUrl}/chatib-alternative`,
        },
      ],
    },
  ];

  return (
    <>
      <Seo
        title="Best Chatib Alternative — Ad-Free, Fast Random Chat | ChatNexus"
        description="Looking for a Chatib alternative? ChatNexus is a modern, 100% ad-free random chat platform with instant message delivery and real-time online status updates."
        path="/chatib-alternative"
        keywords="chatib alternative, sites like chatib, better than chatib, free chat rooms without ads, fast random chat, modern chatib replacement"
        structuredData={structuredData}
      />
      <div className="landing-root">
        <CustomCursor />
        <AmbientOrbs scrollY={scrollY} />
        <SiteNav />

        {/* ═══════ Hero ═══════ */}
        <section className="features-hero" ref={heroRef} style={{ opacity: 0 }}>
          <span className="section-tag">Chatib Alternative</span>
          <h1 className="features-hero-title">
            <span className="hero-line">The Ad-Free, Fast</span>
            <span className="hero-line hero-line--accent">Chatib Alternative.</span>
          </h1>
          <p className="features-hero-sub">
            Tired of outdated chat interfaces, slow message delivery, and screens cluttered with ads?
            ChatNexus is the modern alternative to Chatib. Experience sub-50ms messaging, zero ads, and instant online status updates — all completely free.
          </p>

          <div className="hero-cta-row" style={{ justifyContent: "center", marginTop: "2rem" }}>
            <MagneticWrap>
              <Link href="/auth" className="hero-btn-primary">
                Chat Free Without Ads
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </MagneticWrap>
          </div>
        </section>

        {/* ═══════ Why Switch ═══════ */}
        <section ref={contentRef} className="reveal-item features-section" style={{ paddingTop: "4rem" }}>
          <div className="section-header">
            <span className="section-tag">Why Switch</span>
            <h2 className="section-title">Upgrade Your Chat Experience</h2>
          </div>

          <div className="mx-auto max-w-3xl px-4 mt-8">
            <p className="text-brand-text text-base leading-7 mb-4">
              While older platforms like Chatib helped pioneer anonymous online chatting, they haven't kept up with modern web standards. Users frequently complain about excessive banner ads, delayed messages, and inaccurate online/offline user lists.
            </p>
            <p className="text-brand-text text-base leading-7 mb-4">
              <strong>ChatNexus fixes all of this.</strong> We built our platform on cutting-edge WebSocket technology to ensure that message delivery and user status updates happen in milliseconds. When someone goes offline, you know instantly.
            </p>
            <p className="text-brand-text text-base leading-7">
              Most importantly, ChatNexus is <span className="text-white font-semibold">100% free of advertisements</span>. No pop-ups, no tracking scripts, no cluttered interfaces. Just you and your conversations in a sleek, modern environment.
            </p>
          </div>

          <div className="mx-auto mt-12 grid max-w-[1100px] gap-6 px-4 sm:grid-cols-2 lg:grid-cols-3">
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
            <h2 className="section-title">ChatNexus vs Chatib</h2>
          </div>

          <div className="mx-auto mt-8 max-w-2xl px-4">
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-white/70">
                    <th className="px-6 py-4 font-medium">Feature</th>
                    <th className="px-6 py-4 text-center font-medium">ChatNexus</th>
                    <th className="px-6 py-4 text-center font-medium">Chatib</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_FEATURES.map(({ feature, chatNexus, competitor }, i) => (
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
                        {competitor ? (
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
                className="group rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-5 transition-colors hover:bg-white/[0.05]"
              >
                <summary className="cursor-pointer list-none text-base font-medium text-white [&::-webkit-details-marker]:hidden">
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
            <h2 className="section-title">Ready for a Better Chat Experience?</h2>
            <p className="section-desc" style={{ marginBottom: "32px" }}>
              Join thousands of users enjoying fast, ad-free conversations.
              <br />
              <Link href="/features" className="text-brand-primary hover:underline">
                See all features
              </Link>
              {" · "}
              <Link href="/stranger-chat" className="text-brand-primary hover:underline">
                Stranger chat
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
