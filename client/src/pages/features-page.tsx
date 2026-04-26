import "./features-page.css";
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Seo } from "@/components/seo";
import {
  ArrowRight,
  Check,
  Globe,
  Lock,
  MessageSquare,
  ShieldCheck,
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

const FEATURES = [
  {
    Icon: Zap,
    title: "Lightning Fast",
    desc: "Real-time message delivery with zero latency. Stay connected in the exact moment.",
  },
  {
    Icon: ShieldCheck,
    title: "Secure & Private",
    desc: "End-to-end encrypted conversations. Your privacy is our number one priority.",
  },
  {
    Icon: Users,
    title: "Global Communities",
    desc: "Join chat rooms world-wide, meet people with shared interests, and grow your network.",
  },
  {
    Icon: MessageSquare,
    title: "Rich Messaging",
    desc: "Share images, files, and express yourself with a state-of-the-art rich text editor.",
  },
  {
    Icon: Globe,
    title: "Access Anywhere",
    desc: "A responsive experience that works flawlessly on desktop, tablet, and mobile.",
  },
  {
    Icon: Lock,
    title: "Complete Control",
    desc: "Manage presence, message permissions, and fully customise your notifications.",
  },
] as const;

const DETAILED_FEATURES = [
  {
    ...FEATURES[0],
    longDesc:
      "Messages are delivered through WebSocket connections with sub-50ms latency. Our infrastructure uses in-memory caching and optimized serialization so every keystroke, emoji, and file arrives the instant it's sent — whether you're chatting one-on-one or in a room of hundreds.",
  },
  {
    ...FEATURES[1],
    longDesc:
      "Your conversations are protected with industry-standard encryption. We never store plaintext messages on disk, and our privacy-first architecture means minimal data retention. Guest users leave zero permanent footprint when their session ends.",
  },
  {
    ...FEATURES[2],
    longDesc:
      "Jump into the Global Chat room to meet people from every corner of the world, or start a private conversation with someone new. ChatNexus makes it easy to discover communities that share your interests and grow your social circle organically.",
  },
  {
    ...FEATURES[3],
    longDesc:
      "Go beyond plain text. Share images, send files up to 10 MB, and express yourself with emoji reactions. Our rich messaging engine renders media inline, so conversations stay fluid and visually engaging without breaking the flow.",
  },
  {
    ...FEATURES[4],
    longDesc:
      "ChatNexus is built as a progressive web app that works flawlessly on desktop browsers, tablets, and mobile phones. Install it to your home screen for a native-like experience with offline support and push notifications.",
  },
  {
    ...FEATURES[5],
    longDesc:
      "Fine-tune your experience with granular controls. Set your online status, manage who can message you, customize notification preferences, and personalize your chat theme — all from a single, intuitive settings panel.",
  },
];

const HOW_STEPS = [
  {
    num: 1,
    title: "Create or Join as Guest",
    desc: "Sign up in seconds with just an email, or skip the process entirely and join as a guest with a temporary username.",
  },
  {
    num: 2,
    title: "Find Your Conversation",
    desc: "Browse the global chat room, get matched with a random stranger for a private chat, or search for a specific user to connect with.",
  },
  {
    num: 3,
    title: "Start Chatting Instantly",
    desc: "Send messages, share media, and enjoy real-time conversations with zero latency. It's that simple — no barriers, no waiting.",
  },
];

const COMPARE_ROWS = [
  { feature: "No signup required", nexus: true, others: false },
  { feature: "Real-time messaging", nexus: true, others: true },
  { feature: "Guest access", nexus: true, others: false },
  { feature: "Global chat rooms", nexus: true, others: false },
  { feature: "Mobile-optimized PWA", nexus: true, others: false },
  { feature: "Custom chat themes", nexus: true, others: false },
  { feature: "Privacy-first design", nexus: true, others: false },
  { feature: "File & image sharing", nexus: true, others: true },
];

export default function FeaturesPage() {
  const scrollY = useParallax();
  const [loaded, setLoaded] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const gridRef = useReveal(0.15);
  const howRef = useReveal(0.15);
  const compareRef = useReveal(0.12);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setLoaded(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!loaded || !heroRef.current) return;
    const animation = heroRef.current.animate(
      [
        { opacity: 0, transform: "translateY(50px)", filter: "blur(6px)" },
        { opacity: 1, transform: "translateY(0)", filter: "blur(0)" },
      ],
      {
        duration: 900,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        fill: "forwards",
      },
    );

    return () => animation.cancel();
  }, [loaded]);

  return (
    <>
      <Seo
        title="Features | ChatNexus"
        description="Explore all the features that make ChatNexus the fastest, most private way to chat with strangers online."
        path="/features"
        keywords="ChatNexus features, anonymous chat features, real-time messaging, global chat rooms, guest access, PWA chat app"
      />
      <div className="landing-root">
        <CustomCursor />
        <AmbientOrbs scrollY={scrollY} />

        {/* Nav */}
        <SiteNav />

        {/* Hero */}
        <section className="features-hero" ref={heroRef} style={{ opacity: 0 }}>
          <span className="section-tag">Features</span>
          <h1 className="features-hero-title">
            <span className="hero-line">Everything You Need</span>
            <span className="hero-line hero-line--accent">to Chat Freely.</span>
          </h1>
          <p className="features-hero-sub">
            From lightning-fast delivery to granular privacy controls, ChatNexus
            is engineered for the modern conversationalist.
          </p>
        </section>

        {/* Feature Grid */}
        <section className="features-detail-section">
          <div ref={gridRef} className="reveal-item features-detail-grid">
            {DETAILED_FEATURES.map((f) => (
              <article key={f.title} className="feature-detail-card">
                <div className="feature-detail-icon">
                  <f.Icon className="w-7 h-7" />
                </div>
                <h3 className="feature-detail-title">{f.title}</h3>
                <p className="feature-detail-desc">{f.longDesc}</p>
              </article>
            ))}
          </div>
        </section>

        {/* How It Works */}
        <section className="how-section">
          <div ref={howRef} className="reveal-item">
            <div className="section-header">
              <span className="section-tag">How It Works</span>
              <h2 className="section-title">Three Steps. Zero Friction.</h2>
              <p className="section-desc">
                Getting started with ChatNexus takes less than 30 seconds.
              </p>
            </div>
            <div className="how-steps">
              {HOW_STEPS.map((step) => (
                <div key={step.num} className="how-step">
                  <div className="how-step-number">{step.num}</div>
                  <h3 className="how-step-title">{step.title}</h3>
                  <p className="how-step-desc">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Comparison */}
        <section className="compare-section">
          <div ref={compareRef} className="reveal-item">
            <div className="section-header">
              <span className="section-tag">Comparison</span>
              <h2 className="section-title">ChatNexus vs. The Rest</h2>
              <p className="section-desc">
                See why thousands choose ChatNexus over traditional stranger
                chat platforms.
              </p>
            </div>
            <div className="compare-table-wrap">
              <table className="compare-table">
                <thead>
                  <tr>
                    <th>Feature</th>
                    <th>ChatNexus</th>
                    <th>Others</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARE_ROWS.map((row) => (
                    <tr key={row.feature}>
                      <td>{row.feature}</td>
                      <td>
                        {row.nexus ? (
                          <Check className="w-5 h-5 compare-check" />
                        ) : (
                          <X className="w-5 h-5 compare-cross" />
                        )}
                      </td>
                      <td>
                        {row.others ? (
                          <Check className="w-5 h-5 compare-check" />
                        ) : (
                          <X className="w-5 h-5 compare-cross" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="features-hero" style={{ minHeight: "40vh", paddingTop: "40px" }}>
          <h2 className="section-title">Ready to Start Chatting?</h2>
          <p className="section-desc" style={{ marginBottom: "32px" }}>
            Join thousands of users already connecting on ChatNexus.
          </p>
          <MagneticWrap>
            <Link href="/auth" className="hero-btn-primary">
              <span>Get Started Free</span>
              <ArrowRight className="w-5 h-5" />
            </Link>
          </MagneticWrap>
        </section>

        {/* Footer */}
        <PageFooter />
      </div>
    </>
  );
}
