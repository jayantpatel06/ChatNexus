import "./about-page.css";
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import PageFooter from "@/components/page-footer";
import SiteNav from "@/components/site-nav";
import { Seo } from "@/components/seo";
import {
  ArrowRight,
  Shield,
  Heart,
  Zap,
  Eye,
  Globe,
  Users,
} from "lucide-react";
import {
  CustomCursor,
  PagePreloader,
  AmbientOrbs,
  useParallax,
  useReveal,
  MagneticWrap,
} from "@/components/effects";
import gsap from "gsap";

const VALUES = [
  {
    Icon: Shield,
    title: "Privacy First",
    desc: "We believe every conversation deserves protection. Your data is yours — we collect only what's necessary and delete what we don't need.",
  },
  {
    Icon: Zap,
    title: "Speed Matters",
    desc: "Every millisecond counts in a conversation. We obsess over performance to deliver messages faster than you can blink.",
  },
  {
    Icon: Heart,
    title: "Inclusivity",
    desc: "ChatNexus is for everyone. We design for accessibility, support guest access without barriers, and welcome users from every background.",
  },
  {
    Icon: Eye,
    title: "Transparency",
    desc: "No hidden agendas, no data selling, no dark patterns. We're upfront about how ChatNexus works and how your data is handled.",
  },
  {
    Icon: Globe,
    title: "Global by Design",
    desc: "Built for a borderless world. Our infrastructure spans multiple regions to keep latency low, no matter where you are.",
  },
  {
    Icon: Users,
    title: "Community Driven",
    desc: "Our roadmap is shaped by our users. Feature requests, bug reports, and feedback directly influence what we build next.",
  },
];

const STATS = [
  { num: "10K+", label: "Active Users" },
  { num: "1M+", label: "Messages Sent" },
  { num: "99.9%", label: "Uptime" },
  { num: "<50ms", label: "Avg. Latency" },
];

const TIMELINE = [
  {
    year: "2024",
    title: "The Idea",
    desc: "ChatNexus started as a weekend project — a simple wish to recreate the magic of meeting strangers online, without the baggage of legacy platforms.",
  },
  {
    year: "2025",
    title: "First Public Launch",
    desc: "We shipped the MVP with guest access, real-time 1:1 chat, and a global chat room. The response was immediate — over 1,000 signups in the first week.",
  },
  {
    year: "2025",
    title: "Major Upgrades",
    desc: "Rich messaging, file sharing, PWA support, custom chat themes, and a complete redesign with glassmorphism aesthetics went live.",
  },
  {
    year: "2026",
    title: "Growing Fast",
    desc: "With 10,000+ active users, an optimized backend with Redis caching, and a fully mobile-responsive experience, ChatNexus is becoming the go-to stranger chat platform.",
  },
];

export default function AboutPage() {
  const scrollY = useParallax();
  const [loaded, setLoaded] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const missionRef = useReveal(0.15);
  const valuesRef = useReveal(0.12);
  const statsRef = useReveal(0.15);
  const timelineRef = useReveal(0.12);

  useEffect(() => {
    if (!loaded || !heroRef.current) return;
    gsap.fromTo(
      heroRef.current,
      { y: 50, opacity: 0, filter: "blur(6px)" },
      {
        y: 0,
        opacity: 1,
        filter: "blur(0px)",
        duration: 0.9,
        ease: "power3.out",
      },
    );
  }, [loaded]);

  return (
    <>
      <Seo
        title="About | ChatNexus"
        description="Learn about ChatNexus — our mission to make anonymous stranger chat safe, fast, and accessible for everyone."
        path="/about"
        keywords="about ChatNexus, ChatNexus team, anonymous chat platform mission, stranger chat story"
      />
      <PagePreloader onComplete={() => setLoaded(true)} />

      <div className="landing-root">
        <CustomCursor />
        <AmbientOrbs scrollY={scrollY} />

        {/* Nav */}
        <SiteNav />

        {/* Hero */}
        <section className="about-hero" ref={heroRef} style={{ opacity: 0 }}>
          <span className="section-tag">About</span>
          <h1 className="about-hero-title">
            <span className="hero-line">Built for Humans</span>
            <span className="hero-line hero-line--accent">
              Who Love to Talk.
            </span>
          </h1>
          <p className="about-hero-sub">
            ChatNexus was born from a simple belief: meeting strangers online
            should be fast, safe, and fun — without the friction of legacy
            platforms.
          </p>
        </section>

        {/* Mission */}
        <section className="mission-section">
          <div ref={missionRef} className="reveal-item mission-card">
            <p className="mission-quote">
              We're building the fastest, most private way to connect with
              strangers online — no signup walls, no data harvesting, no
              compromise.
            </p>
            <p className="mission-body">
              In a world of over-engineered social platforms that monetize your
              attention, ChatNexus takes a different approach. We strip away the
              noise and focus on what matters: real conversations between real
              people. Whether you're looking for a quick chat with a stranger, a
              global discussion room, or just a space to be yourself
              anonymously, ChatNexus delivers that experience in under 30
              seconds.
            </p>
          </div>
        </section>

        {/* Stats */}
        <section className="stats-section">
          <div ref={statsRef} className="reveal-item stats-bar">
            {STATS.map((s) => (
              <div key={s.label} className="stat-item">
                <div className="stat-num">{s.num}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Values */}
        <section className="values-section">
          <div ref={valuesRef} className="reveal-item">
            <div className="section-header">
              <span className="section-tag">Our Values</span>
              <h2 className="section-title">What We Stand For</h2>
              <p className="section-desc">
                The principles that guide every decision we make.
              </p>
            </div>
            <div className="values-grid">
              {VALUES.map((v) => (
                <div key={v.title} className="value-card">
                  <div className="value-icon">
                    <v.Icon className="w-7 h-7" />
                  </div>
                  <h3 className="value-title">{v.title}</h3>
                  <p className="value-desc">{v.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Timeline */}
        <section className="timeline-section">
          <div ref={timelineRef} className="reveal-item">
            <div className="section-header">
              <span className="section-tag">Our Journey</span>
              <h2 className="section-title">From Idea to Platform</h2>
            </div>
            <div className="timeline">
              {TIMELINE.map((item, i) => (
                <div key={i} className="timeline-item">
                  <div className="timeline-dot" />
                  <span className="timeline-year">{item.year}</span>
                  <h3 className="timeline-title">{item.title}</h3>
                  <p className="timeline-desc">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section
          className="about-hero"
          style={{ minHeight: "35vh", paddingTop: "40px" }}
        >
          <h2 className="section-title">Want to Be Part of the Story?</h2>
          <p className="section-desc" style={{ marginBottom: "32px" }}>
            Join ChatNexus today and start connecting with people worldwide.
          </p>
          <MagneticWrap>
            <Link href="/auth">
              <button className="hero-btn-primary">
                <span>Join ChatNexus</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </Link>
          </MagneticWrap>
        </section>

        {/* Footer */}
        <PageFooter />
      </div>
    </>
  );
}
