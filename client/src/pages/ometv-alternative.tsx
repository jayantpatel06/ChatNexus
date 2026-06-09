import "./features-page.css";
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Seo, getSiteUrl } from "@/components/seo";
import {
  ArrowRight,
  Ban,
  Check,
  EyeOff,
  Globe,
  Lock,
  MessageSquare,
  ShieldAlert,
  UserX,
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
  { feature: "No Unfair Bans", chatNexus: true, competitor: false },
  { feature: "No Camera Required", chatNexus: true, competitor: false },
  { feature: "Text-First Anonymous Chat", chatNexus: true, competitor: false },
  { feature: "No Social Login Required", chatNexus: true, competitor: false },
  { feature: "Zero Pay-to-Unban Fees", chatNexus: true, competitor: false },
  { feature: "Guest Access Support", chatNexus: true, competitor: false },
  { feature: "Global Matching", chatNexus: true, competitor: true },
  { feature: "Mobile Support", chatNexus: true, competitor: true },
];

const FAQS = [
  {
    question: "Why do people get banned on Ome.tv for no reason?",
    answer:
      "Ome.tv relies heavily on automated moderation algorithms that frequently flag users for innocent behavior, such as covering the camera, having a blank screen, or simple connection issues. This leads to frustrating, unfair bans.",
  },
  {
    question: "Does ChatNexus have unfair bans?",
    answer:
      "No. Because ChatNexus is a text-based platform, you don't have to worry about automated algorithms banning you because your camera was covered or your lighting was bad. You can chat freely.",
  },
  {
    question: "Do I need a Facebook or VK account to use ChatNexus?",
    answer:
      "No. Unlike Ome.tv which requires a social media login to verify your identity, ChatNexus offers instant guest access. No social media accounts, no emails, no phone numbers required.",
  },
  {
    question: "Do I have to pay to get unbanned on ChatNexus?",
    answer:
      "No. We don't employ predatory 'pay-to-unban' monetization tactics. ChatNexus is completely free.",
  },
  {
    question: "Can I use ChatNexus without a webcam?",
    answer:
      "Yes. ChatNexus is completely text-based. You never need a webcam, making it the perfect platform for truly anonymous conversations.",
  },
];

const WHY_SWITCH_FEATURES = [
  {
    Icon: Ban,
    title: "No Unfair Bans",
    desc: "Stop getting banned by broken AI moderation just because your camera was covered or your room was too dark.",
  },
  {
    Icon: ShieldAlert,
    title: "Zero Pay-to-Unban Fees",
    desc: "We don't use predatory tactics. There are no fees or subscriptions required to regain access to the platform.",
  },
  {
    Icon: EyeOff,
    title: "No Camera Required",
    desc: "Protect your privacy. ChatNexus is a text-first platform, meaning you never have to show your face to meet new people.",
  },
  {
    Icon: UserX,
    title: "No Social Login",
    desc: "Keep your personal life separate. Enter as a guest instantly without linking a Facebook or VK account.",
  },
  {
    Icon: Lock,
    title: "End-to-End Encrypted",
    desc: "Your text conversations are secured with industry-standard WSS encryption, keeping your chats private.",
  },
  {
    Icon: Zap,
    title: "Sub-50ms Speed",
    desc: "Experience lightning-fast text delivery. No buffering video streams, just instant communication.",
  },
];

export default function OmetvAlternativePage() {
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
          name: "Ome.tv Alternative",
          item: `${siteUrl}/ometv-alternative`,
        },
      ],
    },
  ];

  return (
    <>
      <Seo
        title="Best Ome.tv Alternative — No Unfair Bans, Free Chat | ChatNexus"
        description="Frustrated by unfair bans on Ome.tv? Switch to ChatNexus, the best Ome.tv alternative offering text-based anonymous chat with no camera or social login required."
        path="/ometv-alternative"
        keywords="ometv alternative, ome.tv alternative, sites like ome.tv, better than ometv, random chat no bans, free text chat, anonymous chat no login"
        structuredData={structuredData}
      />
      <div className="landing-root">
        <CustomCursor />
        <AmbientOrbs scrollY={scrollY} />
        <SiteNav />

        <section className="features-hero" ref={heroRef} style={{ opacity: 0 }}>
          <span className="section-tag">Ome.tv Alternative</span>
          <h1 className="features-hero-title">
            <span className="hero-line">Tired of Unfair Bans?</span>
            <span className="hero-line hero-line--accent">Switch to ChatNexus.</span>
          </h1>
          <p className="features-hero-sub">
            Ome.tv is notorious for its strict automated bans, forced camera usage, and mandatory social media logins.
            ChatNexus is the privacy-first, text-based alternative where you can chat freely without unfair bans, paywalls, or exposing your identity.
          </p>

          <div className="hero-cta-row" style={{ justifyContent: "center", marginTop: "2rem" }}>
            <MagneticWrap>
              <Link href="/auth" className="hero-btn-primary">
                Chat Anonymously
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </MagneticWrap>
          </div>
        </section>

        <section ref={contentRef} className="reveal-item features-section" style={{ paddingTop: "4rem" }}>
          <div className="section-header">
            <span className="section-tag">Why Switch</span>
            <h2 className="section-title">The Problem with Ome.tv</h2>
          </div>

          <div className="mx-auto max-w-3xl px-4 mt-8">
            <p className="text-brand-text text-base leading-7 mb-4">
              If you've used Ome.tv, you probably know the frustration. You're having a good time, and suddenly you receive a ban screen because you looked away from the camera, the room was too dark, or the automated system made a mistake. Worse, you're then asked to pay a fee to lift the ban.
            </p>
            <p className="text-brand-text text-base leading-7 mb-4">
              <strong>ChatNexus doesn't do that.</strong> Because we are a text-first platform, there are no facial recognition algorithms analyzing your webcam. You don't even need a webcam to use our service.
            </p>
            <p className="text-brand-text text-base leading-7">
              We also respect your privacy. Ome.tv requires you to link a Facebook or VK account to verify your identity. On ChatNexus, you can enter instantly as a guest. No data harvesting, no social links, just pure, anonymous conversation.
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
            <h2 className="section-title">ChatNexus vs Ome.tv</h2>
          </div>

          <div className="mx-auto mt-8 max-w-2xl px-4">
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-white/70">
                    <th className="px-6 py-4 font-medium">Feature</th>
                    <th className="px-6 py-4 text-center font-medium">ChatNexus</th>
                    <th className="px-6 py-4 text-center font-medium">Ome.tv</th>
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
            <h2 className="section-title">Ready for Ban-Free Chatting?</h2>
            <p className="section-desc" style={{ marginBottom: "32px" }}>
              Experience true anonymity without the fear of unfair automated bans.
              <br />
              <Link href="/stranger-chat" className="text-brand-primary hover:underline">
                Stranger chat
              </Link>
              {" · "}
              <Link href="/anonymous-chat" className="text-brand-primary hover:underline">
                Anonymous chat
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
