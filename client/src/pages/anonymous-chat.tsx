import "./features-page.css";
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Seo, getSiteUrl } from "@/components/seo";
import {
  ArrowRight,
  EyeOff,
  Ghost,
  Lock,
  MessageCircle,
  Shield,
  UserX,
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

const FEATURES = [
  {
    Icon: Ghost,
    title: "True Anonymity",
    desc: "Chat without revealing your real name, email, or any personal information. Guest sessions are ephemeral by design.",
  },
  {
    Icon: UserX,
    title: "No Registration",
    desc: "Skip the signup form entirely. Enter a display name, pick your age, and you're chatting anonymously in under 10 seconds.",
  },
  {
    Icon: EyeOff,
    title: "No Data Tracking",
    desc: "We don't use analytics trackers, sell user data, or serve targeted ads. Your anonymous chat stays anonymous.",
  },
  {
    Icon: Lock,
    title: "Encrypted by Default",
    desc: "All connections use HTTPS and WSS encryption. Your messages travel through secure channels every time.",
  },
  {
    Icon: Shield,
    title: "Temporary Guest Sessions",
    desc: "Guest data is designed to be temporary. Registered direct-message history may be retained when needed for conversation continuity.",
  },
  {
    Icon: MessageCircle,
    title: "Full Chat Features",
    desc: "Anonymous doesn't mean limited. You get real-time messaging, media sharing, typing indicators, and friend requests.",
  },
];

const FAQS = [
  {
    question: "Can I chat anonymously without creating an account?",
    answer:
      "Yes. ChatNexus offers guest access that lets you start chatting anonymously in under 10 seconds. No email, no phone number, no verification required.",
  },
  {
    question: "Does ChatNexus store my anonymous chat messages?",
    answer:
      "Guest sessions are ephemeral and designed to be cleaned up when you leave. Registered direct-message history may be retained so conversations can continue across sessions.",
  },
  {
    question: "Can other users see my real identity?",
    answer:
      "No. As a guest, you only share a display name that you choose. No real name, email, or personal information is visible to other users.",
  },
  {
    question: "What's the difference between anonymous chat and regular chat?",
    answer:
      "Anonymous chat on ChatNexus uses guest access — no account creation needed. Regular accounts store your profile and conversation history, while guest sessions are completely ephemeral.",
  },
  {
    question: "Is anonymous chat safe?",
    answer:
      "ChatNexus uses encrypted connections, rate limiting, and user blocking tools to keep anonymous chat safe. We never sell data or serve ads based on your conversations.",
  },
];

export default function AnonymousChatPage() {
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
        acceptedAnswer: { "@type": "Answer", text: faq.answer },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
        { "@type": "ListItem", position: 2, name: "Anonymous Chat", item: `${siteUrl}/anonymous-chat` },
      ],
    },
  ];

  return (
    <>
      <Seo
        title="Anonymous Chat — Chat Without Registration | ChatNexus"
        description="Chat anonymously on ChatNexus with no registration required. Free anonymous chat rooms with guest access, private messaging, and zero data tracking."
        path="/anonymous-chat"
        keywords="anonymous chat, anonymous chat rooms, chat without registration, no signup chat, free anonymous chat, private chat online"
        structuredData={structuredData}
      />
      <div className="landing-root">
        <CustomCursor />
        <AmbientOrbs scrollY={scrollY} />
        <SiteNav />

        <section className="features-hero" ref={heroRef} style={{ opacity: 0 }}>
          <span className="section-tag">Anonymous Chat</span>
          <h1 className="features-hero-title">
            <span className="hero-line">Chat Without</span>
            <span className="hero-line hero-line--accent">Registration.</span>
          </h1>
          <p className="features-hero-sub">
            Anonymous chat on ChatNexus means zero registration, zero data
            tracking, and zero personal information required. Enter as a guest,
            pick a display name, and start talking to strangers in seconds.
            Your identity stays yours.
          </p>
          <div className="hero-cta-row" style={{ justifyContent: "center", marginTop: "2rem" }}>
            <MagneticWrap>
              <Link href="/auth?mode=guest" className="hero-btn-primary">
                Chat Anonymously
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </MagneticWrap>
          </div>
        </section>

        <section ref={contentRef} className="reveal-item features-section" style={{ paddingTop: "4rem" }}>
          <div className="section-header">
            <span className="section-tag">Why Anonymous</span>
            <h2 className="section-title">Why Choose Anonymous Chat?</h2>
          </div>
          <div className="mx-auto max-w-3xl px-4">
            <p className="text-brand-text text-base leading-7 mb-4">
              Not every conversation needs a permanent digital footprint. Anonymous
              chat gives you the freedom to express yourself, meet new people, and
              have real conversations without the pressure of a social media
              profile attached to everything you say.
            </p>
            <p className="text-brand-text text-base leading-7 mb-4">
              On ChatNexus, anonymous chat isn't a limited mode — it's a
              first-class experience. Guest users get the same real-time
              messaging, media sharing, and global chat room access as registered
              users. The only difference is that your session is ephemeral.
            </p>
            <p className="text-brand-text text-base leading-7">
              Whether you're exploring{" "}
              <Link href="/stranger-chat" className="text-brand-primary hover:underline">
                stranger chat
              </Link>
              , joining{" "}
              <Link href="/random-chat" className="text-brand-primary hover:underline">
                random conversations
              </Link>
              , or just want a private space to talk — anonymous chat on ChatNexus
              has you covered. And it's a perfect fit if you're looking for an{" "}
              <Link href="/omegle-alternative" className="text-brand-primary hover:underline">
                Omegle alternative
              </Link>{" "}
              that respects your privacy.
            </p>
          </div>
        </section>

        <section className="features-section" style={{ paddingTop: "2rem" }}>
          <div className="section-header">
            <span className="section-tag">Features</span>
            <h2 className="section-title">Anonymous Chat Features</h2>
          </div>
          <div className="mx-auto mt-8 grid max-w-[1100px] gap-6 px-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ Icon, title, desc }) => (
              <div key={title} className="bento-feature-card group relative flex flex-col items-center overflow-hidden rounded-3xl p-8 text-center">
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
            <span className="section-tag">FAQ</span>
            <h2 className="section-title">Anonymous Chat Questions</h2>
          </div>
          <div className="mx-auto mt-8 max-w-3xl space-y-6 px-4">
            {FAQS.map(({ question, answer }) => (
              <details key={question} className="group rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-5 transition-colors hover:bg-white/[0.05]">
                <summary className="cursor-pointer list-none text-base font-medium text-white [&::-webkit-details-marker]:hidden">{question}</summary>
                <p className="mt-3 text-sm leading-6 text-brand-text">{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="features-section" style={{ paddingTop: "2rem", paddingBottom: "6rem" }}>
          <div className="section-header">
            <h2 className="section-title">Start Chatting Anonymously</h2>
            <p className="section-desc" style={{ marginBottom: "32px" }}>
              No registration. No tracking. No compromise.
              <br />
              <Link href="/features" className="text-brand-primary hover:underline">All features</Link>
              {" · "}
              <Link href="/stranger-chat" className="text-brand-primary hover:underline">Stranger chat</Link>
              {" · "}
              <Link href="/random-chat" className="text-brand-primary hover:underline">Random chat</Link>
            </p>
          </div>
          <div className="flex justify-center">
            <MagneticWrap>
              <Link href="/auth?mode=guest" className="hero-btn-primary">
                Enter as Guest
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
