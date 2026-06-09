import "./features-page.css";
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Seo, getSiteUrl } from "@/components/seo";
import {
  ArrowRight,
  Dice5,
  Globe,
  Heart,
  Shield,
  Shuffle,
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

const FEATURES = [
  {
    Icon: Shuffle,
    title: "Instant Random Matching",
    desc: "Get paired with a random stranger instantly. Every conversation is a fresh start with someone new from anywhere in the world.",
  },
  {
    Icon: Zap,
    title: "Sub-50ms Delivery",
    desc: "Messages arrive in under 50 milliseconds. Random chat on ChatNexus feels as fast as talking face-to-face.",
  },
  {
    Icon: Shield,
    title: "Anonymous & Private",
    desc: "Random chat sessions are private by default. Guest sessions are temporary, while registered direct-message history may be retained for continuity.",
  },
  {
    Icon: Globe,
    title: "Meet People Worldwide",
    desc: "ChatNexus connects you with random users from every continent. Break out of your social bubble and discover new perspectives.",
  },
  {
    Icon: Heart,
    title: "Keep Good Connections",
    desc: "Met someone great in random chat? Send a friend request and continue the conversation in direct messaging.",
  },
  {
    Icon: Dice5,
    title: "No Algorithms",
    desc: "Random means random. No engagement algorithms, no curated feeds — just genuine serendipity in every match.",
  },
];

const FAQS = [
  {
    question: "How does random chat work on ChatNexus?",
    answer:
      "Random chat on ChatNexus pairs you with a stranger from our active user base. The matching happens instantly — just open ChatNexus, enter as a guest, and you'll be connected to someone new for a conversation.",
  },
  {
    question: "Is random chat on ChatNexus free?",
    answer:
      "Yes. Random chat is 100% free on ChatNexus with no premium tiers, no hidden fees, and no ads. Every feature is available at zero cost.",
  },
  {
    question: "Do I need to sign up for random chat?",
    answer:
      "No. You can use guest access to start a random chat immediately without providing an email, phone number, or any personal information.",
  },
  {
    question: "Is random chat anonymous?",
    answer:
      "Yes. Guest sessions on ChatNexus are ephemeral and anonymous. You choose a display name, but no real identity information is required or stored.",
  },
  {
    question: "Can I use random chat on my phone?",
    answer:
      "Absolutely. ChatNexus is a Progressive Web App (PWA) that works on all mobile browsers. You can even install it to your home screen for a native app experience.",
  },
];

export default function RandomChatPage() {
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
        { "@type": "ListItem", position: 2, name: "Random Chat", item: `${siteUrl}/random-chat` },
      ],
    },
  ];

  return (
    <>
      <Seo
        title="Random Chat — Meet Random People Online Free | ChatNexus"
        description="Join random chat on ChatNexus and meet new people instantly. Free random chat with strangers — no signup, no video, just real conversations."
        path="/random-chat"
        keywords="random chat, random chat online, random chat with strangers, free random chat, random chat app, random video chat alternative"
        structuredData={structuredData}
      />
      <div className="landing-root">
        <CustomCursor />
        <AmbientOrbs scrollY={scrollY} />
        <SiteNav />

        <section className="features-hero" ref={heroRef} style={{ opacity: 0 }}>
          <span className="section-tag">Random Chat</span>
          <h1 className="features-hero-title">
            <span className="hero-line">Meet Random People</span>
            <span className="hero-line hero-line--accent">Online Free.</span>
          </h1>
          <p className="features-hero-sub">
            Join random chat on ChatNexus and meet strangers from around the
            world instantly. No signup, no video, no algorithms — just genuine,
            serendipitous conversations with real people. Free forever.
          </p>
          <div className="hero-cta-row" style={{ justifyContent: "center", marginTop: "2rem" }}>
            <MagneticWrap>
              <Link href="/auth?redirect=/random" className="hero-btn-primary">
                Start Random Chat
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </MagneticWrap>
          </div>
        </section>

        <section ref={contentRef} className="reveal-item features-section" style={{ paddingTop: "4rem" }}>
          <div className="section-header">
            <span className="section-tag">Why Random Chat</span>
            <h2 className="section-title">Why People Love Random Chat</h2>
          </div>
          <div className="mx-auto max-w-3xl px-4">
            <p className="text-brand-text text-base leading-7 mb-4">
              Random chat is the simplest way to meet new people online. Unlike
              social media where connections are curated by algorithms, random
              chat gives you the thrill of genuine serendipity — every
              conversation is a fresh start with someone you've never met.
            </p>
            <p className="text-brand-text text-base leading-7 mb-4">
              ChatNexus random chat is designed for people who want authentic
              conversations without the barriers of traditional social platforms.
              No profile setup, no swiping, no engagement metrics — just open
              the app, get matched, and start talking.
            </p>
            <p className="text-brand-text text-base leading-7">
              Whether you're looking to practice a language, meet people from
              other cultures, fight loneliness, or simply have fun — random chat
              on ChatNexus delivers. And if you find someone you click with, send
              a friend request to{" "}
              <Link href="/stranger-chat" className="text-brand-primary hover:underline">
                continue the stranger chat
              </Link>{" "}
              as a direct message.
            </p>
          </div>
        </section>

        <section className="features-section" style={{ paddingTop: "2rem" }}>
          <div className="section-header">
            <span className="section-tag">Features</span>
            <h2 className="section-title">Random Chat Features</h2>
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
            <h2 className="section-title">Random Chat Questions</h2>
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
            <h2 className="section-title">Ready for Random Chat?</h2>
            <p className="section-desc" style={{ marginBottom: "32px" }}>
              Free, anonymous, and instant.
              <br />
              <Link href="/omegle-alternative" className="text-brand-primary hover:underline">Omegle alternative</Link>
              {" · "}
              <Link href="/stranger-chat" className="text-brand-primary hover:underline">Stranger chat</Link>
              {" · "}
              <Link href="/anonymous-chat" className="text-brand-primary hover:underline">Anonymous chat</Link>
            </p>
          </div>
          <div className="flex justify-center">
            <MagneticWrap>
              <Link href="/auth?redirect=/random" className="hero-btn-primary">
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
