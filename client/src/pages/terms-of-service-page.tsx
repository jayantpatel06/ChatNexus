import "./legal-pages.css";
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import PageFooter from "@/components/page-footer";
import SiteNav from "@/components/site-nav";
import { Seo } from "@/components/seo";
import { ArrowRight } from "lucide-react";
import {
  CustomCursor,
  PagePreloader,
  AmbientOrbs,
  useParallax,
  useReveal,
  MagneticWrap,
} from "@/components/effects";
import gsap from "gsap";

const SECTIONS = [
  {
    id: "acceptance",
    title: "Acceptance of Terms",
    content: [
      "By accessing or using ChatNexus, you agree to be bound by these Terms of Service and our Privacy Policy. If you do not agree with any part of these terms, you must not use the platform.",
      "These terms apply to all users of ChatNexus, including registered users, guest users, and visitors browsing the site.",
    ],
  },
  {
    id: "eligibility",
    title: "Eligibility",
    content: [
      "You must be at least 13 years of age to use ChatNexus. By creating an account or using guest access, you represent that you meet this age requirement.",
      "If you are between 13 and 18, you may use ChatNexus only with the involvement and consent of a parent or legal guardian.",
    ],
  },
  {
    id: "accounts",
    title: "User Accounts",
    content: [
      "You may use ChatNexus as a guest (with limited features) or create a registered account. When creating an account:",
    ],
    list: [
      "You must provide accurate and complete registration information",
      "You are responsible for maintaining the confidentiality of your password",
      "You are responsible for all activity that occurs under your account",
      "You must notify us immediately of any unauthorized use of your account",
      "You may not create multiple accounts to circumvent bans or restrictions",
    ],
    after: [
      "ChatNexus reserves the right to suspend or terminate accounts that violate these terms.",
    ],
  },
  {
    id: "acceptable-use",
    title: "Acceptable Use",
    content: [
      "ChatNexus is designed for respectful, constructive conversations. You agree not to:",
    ],
    list: [
      "Send messages that are harassing, threatening, abusive, or hateful",
      "Share illegal content, including but not limited to child exploitation material",
      "Impersonate other users, ChatNexus staff, or public figures",
      "Spam, flood, or disrupt conversations with automated scripts or bots",
      "Attempt to access other users' accounts or private data",
      "Use ChatNexus for commercial solicitation, advertising, or phishing",
      "Upload malware, viruses, or other harmful files",
      "Circumvent any security features, rate limits, or content filters",
      "Engage in any activity that violates applicable laws or regulations",
    ],
  },
  {
    id: "content",
    title: "User Content",
    content: [
      "You retain ownership of the content you create and share on ChatNexus. However, by using the platform, you grant ChatNexus a limited, non-exclusive license to transmit, process, and temporarily store your content as necessary to operate the service.",
      "We do not claim ownership of your messages, images, or files. Private messages are processed in real-time and are not permanently stored on our servers after delivery.",
      "ChatNexus reserves the right to remove content that violates these terms without prior notice.",
    ],
  },
  {
    id: "guest-access",
    title: "Guest Access",
    content: [
      "ChatNexus offers guest access that allows users to participate in conversations without creating a permanent account. Guest sessions are temporary and subject to the following conditions:",
    ],
    list: [
      "Guest usernames are not reserved and may be reused by other guests",
      "Guest message history is not preserved between sessions",
      "Guest accounts may have limited access to certain features",
      "ChatNexus may terminate guest sessions at any time",
    ],
  },
  {
    id: "intellectual-property",
    title: "Intellectual Property",
    content: [
      "The ChatNexus platform, including its design, code, branding, logos, and documentation, is the intellectual property of ChatNexus and is protected by copyright and trademark laws.",
      "You may not copy, modify, distribute, or create derivative works based on the ChatNexus platform without explicit written permission.",
    ],
  },
  {
    id: "disclaimers",
    title: "Disclaimers & Limitation of Liability",
    content: [
      'ChatNexus is provided on an "as is" and "as available" basis without warranties of any kind, either express or implied. We do not guarantee that the service will be uninterrupted, secure, or error-free.',
      "ChatNexus is not responsible for the content, accuracy, or behavior of its users. You interact with other users at your own risk.",
      "To the maximum extent permitted by law, ChatNexus shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the platform.",
    ],
  },
  {
    id: "termination",
    title: "Termination",
    content: [
      "We reserve the right to suspend or terminate your access to ChatNexus at any time, with or without cause, and with or without notice. Reasons for termination may include, but are not limited to, violation of these terms, abusive behavior, or extended inactivity.",
      "Upon termination, your right to use ChatNexus will immediately cease. Data associated with terminated accounts may be deleted in accordance with our Privacy Policy.",
    ],
  },
  {
    id: "modifications",
    title: "Modifications to Terms",
    content: [
      "ChatNexus reserves the right to modify these Terms of Service at any time. When we make material changes, we will provide notice through the platform.",
      "Your continued use of ChatNexus after modifications constitutes acceptance of the updated terms. If you do not agree with the changes, you should stop using the platform.",
      "Last updated: March 2026",
    ],
  },
];

export default function TermsOfServicePage() {
  const scrollY = useParallax();
  const [loaded, setLoaded] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const contentRef = useReveal(0.1);

  useEffect(() => {
    if (!loaded || !heroRef.current) return;
    gsap.fromTo(
      heroRef.current,
      { y: 40, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.8, ease: "power3.out" },
    );
  }, [loaded]);

  return (
    <>
      <Seo
        title="Terms of Service | ChatNexus"
        description="Read the ChatNexus Terms of Service governing the use of our anonymous chat platform."
        path="/terms"
        robots="index, follow"
      />
      <PagePreloader onComplete={() => setLoaded(true)} />

      <div className="landing-root" style={{ scrollBehavior: "smooth" }}>
        <CustomCursor />
        <AmbientOrbs scrollY={scrollY} />

        {/* Nav */}
        <SiteNav />

        {/* Hero */}
        <section className="legal-hero" ref={heroRef} style={{ opacity: 0 }}>
          <span className="section-tag">Legal</span>
          <h1 className="legal-hero-title">
            <span className="hero-line">Terms of Service</span>
          </h1>
          <p className="legal-hero-sub">
            Please read these terms carefully before using ChatNexus. They
            govern your use of our platform and services.
          </p>
        </section>

        {/* Table of Contents */}
        <div className="legal-toc">
          <div className="legal-toc-card">
            <h2 className="legal-toc-title">Table of Contents</h2>
            <ol className="legal-toc-list">
              {SECTIONS.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="legal-toc-link">
                    {i + 1}. {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Content */}
        <div ref={contentRef} className="reveal-item legal-content">
          {SECTIONS.map((s, i) => (
            <section key={s.id} id={s.id} className="legal-section">
              <h2 className="legal-section-title">
                <span className="legal-section-num">{i + 1}</span>
                {s.title}
              </h2>
              {s.content.map((p, pi) => (
                <p key={pi} className="legal-text">
                  {p}
                </p>
              ))}
              {(s as any).list && (
                <ul className="legal-list">
                  {(s as any).list.map((item: string, li: number) => (
                    <li key={li}>{item}</li>
                  ))}
                </ul>
              )}
              {(s as any).after?.map((p: string, ai: number) => (
                <p key={ai} className="legal-text">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>

        {/* Footer */}
        <PageFooter />
      </div>
    </>
  );
}
