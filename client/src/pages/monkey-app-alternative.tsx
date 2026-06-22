import "./features-page.css";
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Seo, getSiteUrl } from "@/components/seo";
import {
  ArrowRight,
  Check,
  CreditCard,
  EyeOff,
  Globe,
  MessageSquare,
  Shield,
  Smartphone,
  VideoOff,
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
  { feature: "Text-First Chat", chatNexus: true, competitor: false },
  { feature: "No Face/Video Required", chatNexus: true, competitor: false },
  { feature: "No App Download Needed", chatNexus: true, competitor: false },
  { feature: "Zero Microtransactions", chatNexus: true, competitor: false },
  { feature: "No Phone Number Required", chatNexus: true, competitor: false },
  { feature: "Instant Guest Access", chatNexus: true, competitor: false },
  { feature: "Random Global Matching", chatNexus: true, competitor: true },
  { feature: "Mobile Optimized", chatNexus: true, competitor: true },
];

const FAQS = [
  {
    question: "How is ChatNexus different from Monkey App?",
    answer:
      "Unlike Monkey App, which forces you into random video calls and requires app downloads, ChatNexus is a text-first platform that works directly in your browser. You don't need a webcam, and you don't need to show your face.",
  },
  {
    question: "Do I need to download an app from the App Store?",
    answer:
      "No. ChatNexus is a Progressive Web App (PWA). You can use it directly in your mobile browser, or install it to your home screen instantly without going through the App Store or Google Play.",
  },
  {
    question: "Is ChatNexus really free?",
    answer:
      "Yes, ChatNexus is 100% free. There are no coins, no premium subscriptions, and no microtransactions to unlock features. Everything is available to all users.",
  },
  {
    question: "Do I have to verify my phone number?",
    answer:
      "No. We respect your privacy. You can start chatting instantly using guest access without providing a phone number, email, or any personal details.",
  },
  {
    question: "Can I still meet random people?",
    answer:
      "Absolutely. ChatNexus features instant random matching that pairs you with strangers from around the world in under 10 seconds for anonymous text conversations.",
  },
];

const WHY_SWITCH_FEATURES = [
  {
    Icon: VideoOff,
    title: "No Video Pressure",
    desc: "Not everyone wants to be on camera. ChatNexus is text-first, letting you have genuine conversations without the anxiety of video chat.",
  },
  {
    Icon: EyeOff,
    title: "True Anonymity",
    desc: "No phone number verification required. Enter as a guest and keep your real identity completely hidden.",
  },
  {
    Icon: CreditCard,
    title: "Zero Microtransactions",
    desc: "Forget about buying 'coins' to talk to people. ChatNexus is completely free with no hidden paywalls or premium tiers.",
  },
  {
    Icon: Smartphone,
    title: "No App Store Required",
    desc: "Works perfectly in Safari or Chrome. You don't need to download a heavy app that tracks your device data.",
  },
  {
    Icon: Zap,
    title: "Instant Matching",
    desc: "Get paired with a stranger in under 10 seconds. No endless waiting, just fast, real-time connections.",
  },
  {
    Icon: MessageSquare,
    title: "Rich Text Chat",
    desc: "Share messages, media, and expressions in a modern interface designed purely for seamless text communication.",
  },
];

export default function MonkeyAppAlternativePage() {
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
          name: "Monkey App Alternative",
          item: `${siteUrl}/monkey-app-alternative`,
        },
      ],
    },
  ];

  return (
    <>
      <Seo
        title="Best Monkey App Alternative — Text-First Anonymous Chat"
        description="Looking for an alternative to Monkey App? ChatNexus offers text-first anonymous chat with no video pressure, no app downloads, and no phone number required."
        path="/monkey-app-alternative"
        keywords="monkey app alternative, apps like monkey, monkey chat alternative, text random chat, stranger chat without video"
        structuredData={structuredData}
      />
      <div className="landing-root">
        <CustomCursor />
        <AmbientOrbs scrollY={scrollY} />
        <SiteNav />

        <section className="features-hero" ref={heroRef} style={{ opacity: 0 }}>
          <span className="section-tag">Monkey App Alternative</span>
          <h1 className="features-hero-title">
            <span className="hero-line">Chat Freely Without</span>
            <span className="hero-line hero-line--accent">Video Pressure.</span>
          </h1>
          <p className="features-hero-sub">
            Tired of forced video chats, expensive in-app coins, and mandatory phone number verifications?
            ChatNexus is the text-first Monkey App alternative. Talk to strangers anonymously, right from your browser, completely free.
          </p>

          <div className="hero-cta-row" style={{ justifyContent: "center", marginTop: "2rem" }}>
            <MagneticWrap>
              <Link href="/auth" className="hero-btn-primary">
                Start Text Chat
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </MagneticWrap>
          </div>
        </section>

        <section ref={contentRef} className="reveal-item features-section" style={{ paddingTop: "4rem" }}>
          <div className="section-header">
            <span className="section-tag">Why Switch</span>
            <h2 className="section-title">A Better Way to Meet Strangers</h2>
          </div>

          <div className="mx-auto max-w-3xl px-4 mt-8">
            <p className="text-brand-text text-base leading-7 mb-4">
              While apps like Monkey focus entirely on random video calls, many users find the experience stressful, heavily moderated, or packed with inappropriate behavior. Not to mention the aggressive monetization strategies that ask you to buy "coins" just to keep a conversation going.
            </p>
            <p className="text-brand-text text-base leading-7 mb-4">
              <strong>ChatNexus takes a different approach.</strong> We are a text-first platform. You can meet fascinating people from all over the world without ever turning on your camera or sharing your real identity.
            </p>
            <p className="text-brand-text text-base leading-7">
              Plus, there are no app store downloads or phone number verifications required. ChatNexus runs directly in your mobile or desktop browser as a high-speed Progressive Web App.
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

        <section className="features-section" style={{ paddingTop: "2rem" }}>
          <div className="section-header">
            <span className="section-tag">Comparison</span>
            <h2 className="section-title">ChatNexus vs Monkey App</h2>
          </div>

          <div className="mx-auto mt-8 max-w-2xl px-4">
            <div className="overflow-hidden rounded-2xl border border-brand-border bg-brand-card/20">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-brand-border text-brand-text/70">
                    <th className="px-6 py-4 font-medium">Feature</th>
                    <th className="px-6 py-4 text-center font-medium">ChatNexus</th>
                    <th className="px-6 py-4 text-center font-medium">Monkey App</th>
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

        <section className="features-section" style={{ paddingTop: "2rem", paddingBottom: "6rem" }}>
          <div className="section-header">
            <h2 className="section-title">Ready for Text-Based Chat?</h2>
            <p className="section-desc" style={{ marginBottom: "32px" }}>
              Skip the video pressure. Start chatting securely today.
              <br />
              <Link href="/anonymous-chat" className="text-brand-primary hover:underline">
                Anonymous chat
              </Link>
              {" · "}
              <Link href="/random-chat" className="text-brand-primary hover:underline">
                Random chat
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
