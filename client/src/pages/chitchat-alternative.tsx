import "./features-page.css";
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Seo, getSiteUrl } from "@/components/seo";
import {
  ArrowRight,
  Check,
  Globe,
  Layout,
  MessageCircle,
  MessageSquare,
  Shield,
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
  { feature: "Sub-50ms Message Delivery", chatNexus: true, competitor: false },
  { feature: "Friend Requests & Persistent DMs", chatNexus: true, competitor: false },
  { feature: "Modern UI / Glassmorphism", chatNexus: true, competitor: false },
  { feature: "Global Chat Rooms", chatNexus: true, competitor: true },
  { feature: "Guest Access Support", chatNexus: true, competitor: true },
  { feature: "Media Sharing Capabilities", chatNexus: true, competitor: false },
  { feature: "Zero Tracking", chatNexus: true, competitor: false },
  { feature: "Progressive Web App (PWA)", chatNexus: true, competitor: false },
];

const FAQS = [
  {
    question: "Is ChatNexus faster than ChitChat.gg?",
    answer:
      "Yes. ChatNexus is built on a highly optimized WebSocket architecture with in-memory caching, guaranteeing message delivery in under 50 milliseconds. You won't experience the lag or dropped connections common on other platforms.",
  },
  {
    question: "Can I add friends on ChatNexus?",
    answer:
      "Absolutely. While guest sessions are ephemeral, if you create a free account, you can send friend requests and maintain a persistent direct messaging inbox with people you meet in random or global chat.",
  },
  {
    question: "Does ChatNexus have global chat rooms?",
    answer:
      "Yes. ChatNexus features high-capacity global chat rooms where you can jump into live, fast-paced conversations with users from all around the world.",
  },
  {
    question: "Is the interface mobile-friendly?",
    answer:
      "ChatNexus is a fully responsive Progressive Web App (PWA) with a modern glassmorphic design. It feels exactly like a native app on your phone, complete with smooth animations and intuitive navigation.",
  },
  {
    question: "Do I need an account to use the global rooms?",
    answer:
      "No. You can join the global chat rooms and start random stranger chats instantly using guest access without any registration.",
  },
];

const WHY_SWITCH_FEATURES = [
  {
    Icon: Zap,
    title: "Zero Message Lag",
    desc: "Experience sub-50ms message delivery. ChatNexus handles high-traffic global rooms without slowing down or dropping your connection.",
  },
  {
    Icon: Users,
    title: "Friend Requests & DMs",
    desc: "Met someone interesting in the global room? Send a friend request and seamlessly transition into a private direct message.",
  },
  {
    Icon: Layout,
    title: "Premium Modern Design",
    desc: "Enjoy chatting in a beautiful, responsive interface featuring dynamic themes, custom cursors, and smooth animations.",
  },
  {
    Icon: Shield,
    title: "Enhanced Privacy",
    desc: "We don't sell your data to ad networks. Guest sessions are strictly ephemeral and private conversations remain private.",
  },
  {
    Icon: MessageCircle,
    title: "Rich Media Support",
    desc: "Share more than just text. ChatNexus supports emojis, rich media, and modern chat features you'd expect in 2026.",
  },
  {
    Icon: Globe,
    title: "Global Communities",
    desc: "Join massive, active public chat rooms without rate limit crashes or clunky scrolling issues.",
  },
];

export default function ChitChatAlternativePage() {
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
          name: "ChitChat.gg Alternative",
          item: `${siteUrl}/chitchat-alternative`,
        },
      ],
    },
  ];

  return (
    <>
      <Seo
        title="Best ChitChat.gg Alternative — Fast Global Rooms | ChatNexus"
        description="Looking for an alternative to ChitChat? ChatNexus offers sub-50ms message delivery, global rooms, persistent DMs, and a premium modern design."
        path="/chitchat-alternative"
        keywords="chitchat.gg alternative, chitchat alternative, sites like chitchat, fast global chat, anonymous chat rooms, modern text chat"
        structuredData={structuredData}
      />
      <div className="landing-root">
        <CustomCursor />
        <AmbientOrbs scrollY={scrollY} />
        <SiteNav />

        <section className="features-hero" ref={heroRef} style={{ opacity: 0 }}>
          <span className="section-tag">ChitChat Alternative</span>
          <h1 className="features-hero-title">
            <span className="hero-line">A Faster, Modern</span>
            <span className="hero-line hero-line--accent">ChitChat Alternative.</span>
          </h1>
          <p className="features-hero-sub">
            Say goodbye to message lag and outdated interfaces. ChatNexus is the premium alternative to ChitChat.gg,
            offering lightning-fast global rooms, robust friend requests, and a stunning design.
          </p>

          <div className="hero-cta-row" style={{ justifyContent: "center", marginTop: "2rem" }}>
            <MagneticWrap>
              <Link href="/auth" className="hero-btn-primary">
                Join Global Chat
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </MagneticWrap>
          </div>
        </section>

        <section ref={contentRef} className="reveal-item features-section" style={{ paddingTop: "4rem" }}>
          <div className="section-header">
            <span className="section-tag">Why Switch</span>
            <h2 className="section-title">Elevate Your Chat Experience</h2>
          </div>

          <div className="mx-auto max-w-3xl px-4 mt-8">
            <p className="text-brand-text text-base leading-7 mb-4">
              While platforms like ChitChat provide a basic way to talk to strangers, they often suffer from performance bottlenecks. Users frequently encounter message delays, clunky scrolling in busy global rooms, and a lack of modern features.
            </p>
            <p className="text-brand-text text-base leading-7 mb-4">
              <strong>ChatNexus is engineered for speed and aesthetics.</strong> Our WebSocket infrastructure guarantees that even in the busiest global rooms, your messages are delivered in under 50 milliseconds. The UI is built using modern frameworks, providing a smooth, app-like experience in your browser.
            </p>
            <p className="text-brand-text text-base leading-7">
              Furthermore, ChatNexus allows you to turn random encounters into lasting connections. Send friend requests and move to a persistent Direct Messaging inbox, a feature sorely lacking in many ephemeral-only chat apps.
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
            <h2 className="section-title">ChatNexus vs ChitChat</h2>
          </div>

          <div className="mx-auto mt-8 max-w-2xl px-4">
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-white/70">
                    <th className="px-6 py-4 font-medium">Feature</th>
                    <th className="px-6 py-4 text-center font-medium">ChatNexus</th>
                    <th className="px-6 py-4 text-center font-medium">ChitChat</th>
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

        <section className="features-section" style={{ paddingTop: "2rem", paddingBottom: "6rem" }}>
          <div className="section-header">
            <h2 className="section-title">Ready for a Premium Chat App?</h2>
            <p className="section-desc" style={{ marginBottom: "32px" }}>
              Experience lightning-fast global rooms and a modern UI today.
              <br />
              <Link href="/random-chat" className="text-brand-primary hover:underline">
                Random chat
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
                Join ChatNexus
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
