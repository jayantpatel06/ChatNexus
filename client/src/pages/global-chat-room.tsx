import "./features-page.css";
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Seo, getSiteUrl } from "@/components/seo";
import {
  ArrowRight,
  Globe2,
  MessageSquare,
  Users,
  Shield,
  Zap,
  Radio,
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
    Icon: Globe2,
    title: "Worldwide Audience",
    desc: "Connect instantly with thousands of users in a single global room. The world is chatting, and you're invited.",
  },
  {
    Icon: Zap,
    title: "Real-time Speed",
    desc: "Experience zero lag. Our optimized WebSocket infrastructure ensures that even massive global rooms feel lightning fast.",
  },
  {
    Icon: Shield,
    title: "Active Moderation",
    desc: "Enjoy a safer global chat environment with automated spam filters and community-driven moderation tools.",
  },
  {
    Icon: Users,
    title: "Guest Friendly",
    desc: "Join the global conversation immediately. No sign-up required, just enter as a guest and start chatting.",
  },
  {
    Icon: MessageSquare,
    title: "Direct Messaging",
    desc: "Find someone interesting in the global room? Send them a private message or a friend request to talk 1-on-1.",
  },
  {
    Icon: Radio,
    title: "Live Updates",
    desc: "Watch the room come alive with real-time online status indicators, typing indicators, and instant message delivery.",
  },
];

const FAQS = [
  {
    question: "What is a global chat room?",
    answer:
      "A global chat room is a massive, public chat interface where users from all over the world can talk together in real-time. It's the digital equivalent of a massive global town square.",
  },
  {
    question: "Do I need an account to join the global chat?",
    answer:
      "No! ChatNexus allows you to jump into the global room instantly using guest access. You don't need to provide an email or phone number.",
  },
  {
    question: "Can I privately message people I meet in the global room?",
    answer:
      "Yes. If you strike up a good conversation in the public global room, you can send that user a direct message or friend request to continue talking privately.",
  },
  {
    question: "Is the global chat room moderated?",
    answer:
      "Yes, the global room features automated spam protection and community moderation to keep the conversation flowing smoothly and safely.",
  },
  {
    question: "Is it free to use the global chat?",
    answer:
      "Absolutely. ChatNexus provides its global chat rooms completely free of charge, with no premium locks or hidden fees.",
  },
];

export default function GlobalChatRoomPage() {
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
        { "@type": "ListItem", position: 2, name: "Global Chat Room", item: `${siteUrl}/global-chat-room` },
      ],
    },
  ];

  return (
    <>
      <Seo
        title="Global Chat Room — Talk with the World Free | ChatNexus"
        description="Join the ChatNexus global chat room to talk with people from all over the world instantly. Free, real-time world chat with no registration required."
        path="/global-chat-room"
        keywords="global room, world chat, global chat room, international chat, chat with the world, free global chat"
        structuredData={structuredData}
      />
      <div className="landing-root">
        <CustomCursor />
        <AmbientOrbs scrollY={scrollY} />
        <SiteNav />

        <section className="features-hero" ref={heroRef} style={{ opacity: 0 }}>
          <span className="section-tag">Global Chat Room</span>
          <h1 className="features-hero-title">
            <span className="hero-line">Talk to the World</span>
            <span className="hero-line hero-line--accent">in Real-Time.</span>
          </h1>
          <p className="features-hero-sub">
            Jump into the ChatNexus global chat room and instantly connect with thousands of users worldwide. Experience a lightning-fast, moderation-friendly world chat with absolutely no sign-up required.
          </p>
          <div className="hero-cta-row" style={{ justifyContent: "center", marginTop: "2rem" }}>
            <MagneticWrap>
              <Link href="/auth?redirect=/global" className="hero-btn-primary">
                Join Global Chat
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </MagneticWrap>
          </div>
        </section>

        <section ref={contentRef} className="reveal-item features-section" style={{ paddingTop: "4rem" }}>
          <div className="section-header">
            <span className="section-tag">Why Global Chat</span>
            <h2 className="section-title">The Ultimate World Chat Experience</h2>
          </div>
          <div className="mx-auto max-w-3xl px-4">
            <p className="text-brand-text text-base leading-7 mb-4">
              A global chat room is the pulse of the internet. It's a place where diverse cultures, thoughts, and random encounters collide in a single, fast-paced stream of messages. Whether you want to share a thought, ask a question to a worldwide audience, or just observe the chaos, the global room is always active.
            </p>
            <p className="text-brand-text text-base leading-7 mb-4">
              Unlike outdated platforms that suffer from immense lag when hundreds of users talk at once, ChatNexus is built on a modern WebSocket architecture. This means our world chat handles high traffic gracefully, delivering messages in under 50 milliseconds.
            </p>
            <p className="text-brand-text text-base leading-7">
              The best part? You don't need to jump through hoops to join. With guest access, you are one click away from introducing yourself to the world. And if you connect with someone special in the crowd, you can easily pull them into a private 1-on-1 conversation.
            </p>
          </div>
        </section>

        <section className="features-section" style={{ paddingTop: "2rem" }}>
          <div className="section-header">
            <span className="section-tag">Features</span>
            <h2 className="section-title">Global Room Features</h2>
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
            <h2 className="section-title">Global Chat Questions</h2>
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
            <h2 className="section-title">Ready to Join the World?</h2>
            <p className="section-desc" style={{ marginBottom: "32px" }}>
              The global room is waiting. Jump in instantly.
              <br />
              <Link href="/stranger-chat" className="text-brand-primary hover:underline">Stranger chat</Link>
              {" · "}
              <Link href="/random-chat" className="text-brand-primary hover:underline">Random chat</Link>
              {" · "}
              <Link href="/anonymous-chat" className="text-brand-primary hover:underline">Anonymous chat</Link>
            </p>
          </div>
          <div className="flex justify-center">
            <MagneticWrap>
              <Link href="/auth?redirect=/global" className="hero-btn-primary">
                Join Global Chat
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
