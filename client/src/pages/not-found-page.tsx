import "@/pages/landing-page.css";
import { Link, useLocation } from "wouter";
import { Seo } from "@/components/seo";
import SiteNav from "@/components/site-nav";
import { MagneticWrap, CustomCursor, useReveal } from "@/components/effects";
import { useEffect, useState } from "react";
import { hasValidStoredAuthSession } from "@/lib/auth-storage";

const NOT_FOUND_PAGE = {
  title: "Page Not Found | ChatNexus",
  description: "The requested page could not be found.",
  robots: "noindex, nofollow",
  tag: "404 Not Found",
  heading: "Oops! Page Not Found",
  message: "The page you are looking for doesn't exist. Click button below to go to the homepage.",
} as const;

export default function NotFoundPage() {
  const [location] = useLocation();
  const [hasSession, setHasSession] = useState(hasValidStoredAuthSession());
  const revealRef = useReveal(0.1);

  useEffect(() => {
    const syncStoredSession = () => {
      setHasSession(hasValidStoredAuthSession());
    };

    window.addEventListener("storage", syncStoredSession);
    window.addEventListener("focus", syncStoredSession);
    return () => {
      window.removeEventListener("storage", syncStoredSession);
      window.removeEventListener("focus", syncStoredSession);
    };
  }, []);

  return (
    <>
      <Seo
        title={NOT_FOUND_PAGE.title}
        description={NOT_FOUND_PAGE.description}
        path={location}
        robots={NOT_FOUND_PAGE.robots}
      />
      <div className="landing-root min-h-screen flex flex-col">
        <CustomCursor />

        <div className="ambient-orbs" aria-hidden="true">
          <div className="orb orb-purple" />
          <div className="orb orb-cyan" />
          <div className="orb orb-small" />
        </div>

        <SiteNav isAuthenticated={hasSession} />

        <section className="hero flex flex-1 flex-col items-center justify-center -mt-10">
          <div ref={revealRef} className="reveal-item flex flex-col items-center justify-center text-center z-10 px-4">

            <span className="section-tag mb-4">
              {NOT_FOUND_PAGE.tag}
            </span>

            <h1 className="hero-title mb-6">
              <span className="hero-line">{NOT_FOUND_PAGE.heading}</span>
            </h1>

            <p className="hero-sub max-w-md mx-auto mb-10 text-lg">
              The page you are looking for doesn't exist. Click<br/>
              button below to go to the homepage.
            </p>

            <div className="hero-cta-row justify-center">
              <MagneticWrap>
                <Link href="/" className="hero-btn-primary !px-8">
                  <span>Back to Homepage</span>
                </Link>
              </MagneticWrap>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
