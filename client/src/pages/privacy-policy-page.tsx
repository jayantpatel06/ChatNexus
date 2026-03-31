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
    id: "information-we-collect",
    title: "Information We Collect",
    content: [
      "ChatNexus collects minimal information to provide and improve our service. The data we collect depends on how you use the platform:",
    ],
    list: [
      "Account Data: When you register, we collect your email address, username, age, and gender. Guest users provide only a temporary username that is not permanently stored.",
      "Message Data: Messages sent through ChatNexus are processed in real-time for delivery. We do not permanently store the content of private messages after they have been delivered.",
      "Usage Data: We collect anonymized analytics such as page views, session duration, and feature usage to improve performance and user experience.",
      "Device Data: Basic device information including browser type, operating system, and screen resolution may be collected for compatibility purposes.",
      "Uploaded Media: Files and images shared in conversations are stored temporarily on our servers to facilitate delivery and are subject to automatic cleanup policies.",
    ],
  },
  {
    id: "how-we-use-information",
    title: "How We Use Your Information",
    content: [
      "We use the information we collect for the following purposes:",
    ],
    list: [
      "To provide, operate, and maintain the ChatNexus platform",
      "To authenticate your identity and manage your account",
      "To deliver messages and media in real-time conversations",
      "To respond to your support requests and help center submissions",
      "To detect and prevent abuse, spam, and violations of our Terms of Service",
      "To analyze aggregate usage patterns and improve platform performance",
      "To send important service-related notifications (not marketing spam)",
    ],
  },
  {
    id: "cookies",
    title: "Cookies & Local Storage",
    content: [
      "ChatNexus uses cookies and browser local storage to maintain your session, remember your theme preference (light/dark mode), and keep you logged in across visits. We do not use third-party advertising cookies.",
      "You can clear cookies and local storage at any time through your browser settings, though this may require you to log in again.",
    ],
  },
  {
    id: "data-sharing",
    title: "Data Sharing & Third Parties",
    content: [
      "ChatNexus does not sell, rent, or trade your personal information to third parties. Period.",
      "We may share data only in the following limited circumstances:",
    ],
    list: [
      "Infrastructure Providers: We use hosting and database services to operate the platform. These providers process data on our behalf under strict contractual obligations.",
      "Legal Requirements: We may disclose information if required by law, court order, or governmental regulation.",
      "Safety: If we believe disclosure is necessary to protect the safety of our users or the public.",
    ],
  },
  {
    id: "data-retention",
    title: "Data Retention",
    content: [
      "We retain your account data for as long as your account is active. If you request account deletion through our Help Center, we will permanently delete your account data within 30 days.",
      "Guest session data is ephemeral and is automatically purged when the session ends or after a short expiration window.",
      "Anonymized analytics data may be retained indefinitely as it cannot be linked back to individual users.",
    ],
  },
  {
    id: "your-rights",
    title: "Your Rights",
    content: ["As a ChatNexus user, you have the right to:"],
    list: [
      "Access the personal data we hold about you",
      "Request correction of inaccurate data",
      "Request deletion of your account and associated data",
      "Export your data in a portable format",
      "Opt out of non-essential data collection",
    ],
    after: [
      "To exercise any of these rights, please contact us through the Help Center or email us at support@chatnexus.app.",
    ],
  },
  {
    id: "security",
    title: "Security",
    content: [
      "We take the security of your data seriously. ChatNexus implements industry-standard security measures including encrypted connections (HTTPS/WSS), secure password hashing, token-based authentication, and regular security audits.",
      "However, no method of transmission over the internet is 100% secure. While we strive to protect your data, we cannot guarantee absolute security.",
    ],
  },
  {
    id: "childrens-privacy",
    title: "Children's Privacy",
    content: [
      "ChatNexus is not intended for users under the age of 13. We do not knowingly collect personal information from children under 13. If we learn that we have collected data from a child under 13, we will delete it promptly.",
    ],
  },
  {
    id: "changes",
    title: "Changes to This Policy",
    content: [
      "We may update this Privacy Policy from time to time. When we make significant changes, we will notify users through the platform. Your continued use of ChatNexus after changes constitutes acceptance of the updated policy.",
      "Last updated: March 2026",
    ],
  },
];

export default function PrivacyPolicyPage() {
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
        title="Privacy Policy | ChatNexus"
        description="Read ChatNexus's privacy policy to understand how we collect, use, and protect your data."
        path="/privacy"
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
            <span className="hero-line">Privacy Policy</span>
          </h1>
          <p className="legal-hero-sub">
            Your privacy matters to us. This policy explains what data we
            collect, how we use it, and the choices you have.
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
              {s.list && (
                <ul className="legal-list">
                  {s.list.map((item, li) => (
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
