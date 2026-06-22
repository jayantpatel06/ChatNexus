import "./features-page.css";
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Seo, getSiteUrl } from "@/components/seo";
import {
  ArrowRight,
  Eye,
  Lock,
  MessageSquare,
  Shield,
  UserPlus,
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
    Icon: Zap,
    title: "Instant Matching",
    desc: "Get paired with a stranger in under 10 seconds. No queues, no waiting rooms — just open ChatNexus and start chatting.",
  },
  {
    Icon: Shield,
    title: "Full Anonymity",
    desc: "Your identity stays hidden. Guest sessions are ephemeral and leave no permanent trace on our servers.",
  },
  {
    Icon: UserPlus,
    title: "No Signup Required",
    desc: "Enter as a guest instantly. No email, no phone number, no verification — just pick a username and go.",
  },
  {
    Icon: Lock,
    title: "Encrypted Connections",
    desc: "All stranger chat sessions use HTTPS/WSS encrypted connections. Your conversations are private by default.",
  },
  {
    Icon: MessageSquare,
    title: "Rich Messaging",
    desc: "Send text, images, and media in your stranger chat. Real-time delivery with typing indicators and read receipts.",
  },
  {
    Icon: Eye,
    title: "No Data Tracking",
    desc: "We don't harvest your data or serve ads. ChatNexus is free because we believe chat should be private, not profitable.",
  },
];

const FAQS = [
  {
    question: "How do I start a stranger chat on ChatNexus?",
    answer:
      "Open ChatNexus, click 'Get Started', enter as a guest or sign in, and you'll be matched with a stranger for an instant conversation. The entire process takes under 10 seconds.",
  },
  {
    question: "Is stranger chat on ChatNexus safe?",
    answer:
      "Yes. ChatNexus uses encrypted connections, rate limiting, user blocking tools, and ephemeral guest sessions. Registered direct-message history may be retained so conversations work across sessions.",
  },
  {
    question: "Can I talk to strangers without showing my face?",
    answer:
      "Absolutely. ChatNexus is text-based — no webcam or video is required. You can chat with strangers anonymously using just text and media messages.",
  },
  {
    question: "Is talking to strangers online free on ChatNexus?",
    answer:
      "Yes. ChatNexus is 100% free with no premium tiers, no hidden fees, and no ads. Every feature — including stranger chat, global rooms, and direct messaging — is available at no cost.",
  },
  {
    question: "Can I save conversations from stranger chat?",
    answer:
      "If you meet someone interesting, you can send them a friend request to continue chatting via direct messaging. Guest conversations are ephemeral by design for privacy.",
  },
];

export default function StrangerChatPage() {
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
        { "@type": "ListItem", position: 2, name: "Stranger Chat", item: `${siteUrl}/stranger-chat` },
      ],
    },
  ];

  return (
    <>
      <Seo
        title="Stranger Chat — Talk to Strangers Online Free | ChatNexus"
        description="Start a stranger chat instantly on ChatNexus. Talk to strangers online for free with no signup, no video, and full anonymity. Guest access available."
        path="/stranger-chat"
        keywords="stranger chat, talk to strangers, talk to strangers online, chat with strangers, stranger chat online free, anonymous stranger chat"
        structuredData={structuredData}
      />
      <div className="landing-root">
        <CustomCursor />
        <AmbientOrbs scrollY={scrollY} />
        <SiteNav />

        <section className="features-hero" ref={heroRef} style={{ opacity: 0 }}>
          <span className="section-tag">Stranger Chat</span>
          <h1 className="features-hero-title">
            <span className="hero-line">Talk to Strangers</span>
            <span className="hero-line hero-line--accent">Online Free.</span>
          </h1>
          <p className="features-hero-sub">
            Start a stranger chat in under 10 seconds on ChatNexus. No signup,
            no video, no data harvesting — just instant, anonymous conversations
            with real people from around the world. The fastest way to talk to
            strangers online in 2026.
          </p>
          <div className="hero-cta-row" style={{ justifyContent: "center", marginTop: "2rem" }}>
            <MagneticWrap>
              <Link href="/auth" className="hero-btn-primary">
                Start Stranger Chat
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </MagneticWrap>
          </div>
        </section>

        <section ref={contentRef} className="reveal-item features-section" style={{ paddingTop: "4rem" }}>
          <div className="section-header">
            <span className="section-tag">How It Works</span>
            <h2 className="section-title">Start Talking to Strangers in 3 Steps</h2>
          </div>
          <div className="mx-auto max-w-3xl px-4">
            <div className="space-y-6 mt-8">
              <div className="flex gap-4 items-start">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-primary/20 text-brand-primary font-bold">1</div>
                <div>
                  <h3 className="font-semibold text-brand-text mb-1">Open ChatNexus</h3>
                  <p className="text-brand-text text-sm leading-6">Visit ChatNexus on any device — desktop, phone, or tablet. No app download required thanks to our PWA technology.</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-primary/20 text-brand-primary font-bold">2</div>
                <div>
                  <h3 className="font-semibold text-brand-text mb-1">Enter as a Guest</h3>
                  <p className="text-brand-text text-sm leading-6">Pick any username and jump straight in. No email, no phone number, no verification. Your anonymity is guaranteed.</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-primary/20 text-brand-primary font-bold">3</div>
                <div>
                  <h3 className="font-semibold text-brand-text mb-1">Start Chatting</h3>
                  <p className="text-brand-text text-sm leading-6">You're instantly connected to a stranger chat. Send messages, share media, and if you click — send a friend request to keep talking.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="features-section" style={{ paddingTop: "2rem" }}>
          <div className="section-header">
            <span className="section-tag">Features</span>
            <h2 className="section-title">Stranger Chat Features</h2>
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
            <h2 className="section-title">Stranger Chat Questions</h2>
          </div>
          <div className="mx-auto mt-8 max-w-3xl space-y-6 px-4">
            {FAQS.map(({ question, answer }) => (
              <details key={question} className="group rounded-2xl border border-brand-border bg-brand-card/20 px-6 py-5 transition-colors hover:bg-brand-card/40">
                <summary className="cursor-pointer list-none text-base font-medium text-brand-text [&::-webkit-details-marker]:hidden">{question}</summary>
                <p className="mt-3 text-sm leading-6 text-brand-text">{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="features-section" style={{ paddingTop: "2rem", paddingBottom: "6rem" }}>
          <div className="section-header">
            <h2 className="section-title">Ready to Talk to Strangers?</h2>
            <p className="section-desc" style={{ marginBottom: "32px" }}>
              Free forever. No signup needed.
              <br />
              <Link href="/omegle-alternative" className="text-brand-primary hover:underline">Omegle alternative</Link>
              {" · "}
              <Link href="/random-chat" className="text-brand-primary hover:underline">Random chat</Link>
              {" · "}
              <Link href="/anonymous-chat" className="text-brand-primary hover:underline">Anonymous chat</Link>
            </p>
          </div>
          <div className="flex justify-center">
            <MagneticWrap>
              <Link href="/auth" className="hero-btn-primary">
                Start Chatting Free
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
