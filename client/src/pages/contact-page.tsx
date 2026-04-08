import "./contact-page.css";
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import PageFooter from "@/components/page-footer";
import SiteNav from "@/components/site-nav";
import { Seo } from "@/components/seo";
import {
  ArrowRight,
  Mail,
  MessageCircle,
  Clock,
  Send,
  Twitter,
  Github,
  Instagram,
  Linkedin,
  Loader2,
} from "lucide-react";
import {
  CustomCursor,
  PagePreloader,
  AmbientOrbs,
  useParallax,
  useReveal,
  MagneticWrap,
} from "@/components/effects";
import { useToast } from "@/hooks/use-toast";
import { fetchWithTimeout } from "@/lib/queryClient";
import gsap from "gsap";

export default function ContactPage() {
  const scrollY = useParallax();
  const [loaded, setLoaded] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const formRef = useReveal(0.15);
  const { toast } = useToast();

  const [form, setForm] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      toast({
        title: "Missing fields",
        description: "Please fill in your name, email, and message.",
        variant: "destructive",
      });
      return;
    }

    if (form.message.trim().length < 20) {
      toast({
        title: "Message too short",
        description: "Please provide at least 20 characters.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetchWithTimeout("/api/help-center", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueType: "other",
          message: `[Contact Form]\nName: ${form.name}\nEmail: ${form.email}\nSubject: ${form.subject || "N/A"}\n\n${form.message}`,
        }),
      });
      if (!res.ok) throw new Error("Failed to submit");

      setForm({ name: "", email: "", subject: "", message: "" });
      toast({
        title: "Message sent!",
        description:
          "Thanks for reaching out. We'll get back to you as soon as possible.",
      });
    } catch {
      toast({
        title: "Couldn't send message",
        description: "Please try again in a few minutes.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Seo
        title="Contact Us | ChatNexus"
        description="Get in touch with the ChatNexus team. We're here to help with questions, feedback, or partnership inquiries."
        path="/contact"
        keywords="contact ChatNexus, ChatNexus support, reach ChatNexus team"
      />
      <PagePreloader onComplete={() => setLoaded(true)} />

      <div className="landing-root">
        <CustomCursor />
        <AmbientOrbs scrollY={scrollY} />

        {/* Nav */}
        <SiteNav />

        {/* Hero */}
        <section
          className="contact-hero"
          ref={heroRef}
          style={{ opacity: 0 }}
        >
          <span className="section-tag">Contact</span>
          <h1 className="contact-hero-title">
            <span className="hero-line">Let's Talk.</span>
          </h1>
          <p className="contact-hero-sub">
            Have a question, feedback, or just want to say hello? We'd love to
            hear from you. Fill out the form below and our team will respond
            within 24 hours.
          </p>
        </section>

        {/* Contact Grid */}
        <section className="contact-section">
          <div ref={formRef} className="reveal-item contact-grid">
            {/* Form */}
            <div className="contact-form-card">
              <h2
                style={{
                  fontSize: "1.4rem",
                  fontWeight: 800,
                  marginBottom: "24px",
                }}
              >
                Send a Message
              </h2>
              <form className="contact-form" onSubmit={handleSubmit}>
                <div className="contact-field">
                  <label className="contact-label" htmlFor="contact-name">
                    Your Name
                  </label>
                  <input
                    id="contact-name"
                    name="name"
                    type="text"
                    className="contact-input"
                    placeholder="John Doe"
                    value={form.name}
                    onChange={handleChange}
                  />
                </div>
                <div className="contact-field">
                  <label className="contact-label" htmlFor="contact-email">
                    Email Address
                  </label>
                  <input
                    id="contact-email"
                    name="email"
                    type="email"
                    className="contact-input"
                    placeholder="you@example.com"
                    value={form.email}
                    onChange={handleChange}
                  />
                </div>
                <div className="contact-field">
                  <label className="contact-label" htmlFor="contact-subject">
                    Subject (optional)
                  </label>
                  <input
                    id="contact-subject"
                    name="subject"
                    type="text"
                    className="contact-input"
                    placeholder="What's this about?"
                    value={form.subject}
                    onChange={handleChange}
                  />
                </div>
                <div className="contact-field">
                  <label className="contact-label" htmlFor="contact-message">
                    Message
                  </label>
                  <textarea
                    id="contact-message"
                    name="message"
                    className="contact-textarea"
                    placeholder="Tell us what's on your mind..."
                    value={form.message}
                    onChange={handleChange}
                  />
                </div>
                <button
                  type="submit"
                  className="contact-submit"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  {isSubmitting ? "Sending..." : "Send Message"}
                </button>
              </form>
            </div>

            {/* Info */}
            <div className="contact-info">
              <div className="contact-info-card">
                <div className="contact-info-icon">
                  <Mail className="w-5 h-5" />
                </div>
                <h3 className="contact-info-title">Email Us</h3>
                <p className="contact-info-text">
                  For general inquiries or partnership opportunities:
                </p>
                <a
                  href="mailto:support@chatnexus.app"
                  className="contact-info-link"
                >
                  support@chatnexus.app
                </a>
              </div>

              <div className="contact-info-card">
                <div className="contact-info-icon">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <h3 className="contact-info-title">Help Center</h3>
                <p className="contact-info-text">
                  Need help with your account? Visit our dedicated support page
                  for faster resolution.
                </p>
                <Link href="/help-center" className="contact-info-link">
                  Go to Help Center →
                </Link>
              </div>

              <div className="contact-info-card">
                <div className="contact-info-icon">
                  <Clock className="w-5 h-5" />
                </div>
                <h3 className="contact-info-title">Response Time</h3>
                <p className="contact-info-text">
                  We typically respond within 24 hours on business days. For
                  urgent account issues, use the Help Center form.
                </p>
              </div>

              {/* Socials */}
              <div>
                <h3
                  style={{
                    fontSize: "0.95rem",
                    fontWeight: 700,
                    marginBottom: "12px",
                    color: "var(--ln-muted)",
                  }}
                >
                  Follow Us
                </h3>
                <div className="contact-socials">
                  <a href="#" className="contact-social-icon" aria-label="Twitter">
                    <Twitter className="w-[18px] h-[18px]" />
                  </a>
                  <a href="#" className="contact-social-icon" aria-label="GitHub">
                    <Github className="w-[18px] h-[18px]" />
                  </a>
                  <a href="#" className="contact-social-icon" aria-label="Instagram">
                    <Instagram className="w-[18px] h-[18px]" />
                  </a>
                  <a href="#" className="contact-social-icon" aria-label="LinkedIn">
                    <Linkedin className="w-[18px] h-[18px]" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <PageFooter />
      </div>
    </>
  );
}
