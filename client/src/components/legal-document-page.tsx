import "@/pages/legal-pages.css";
import { useEffect, useRef, useState } from "react";
import PageFooter from "@/components/page-footer";
import SiteNav from "@/components/site-nav";
import { Seo } from "@/components/seo";
import {
  AmbientOrbs,
  CustomCursor,
  useParallax,
  useReveal,
} from "@/components/effects";

export type LegalSection = {
  id: string;
  title: string;
  content: string[];
  contentList?: boolean;
  list?: string[];
  after?: string[];
};

type LegalDocumentPageProps = {
  heading: string;
  seoTitle: string;
  seoDescription: string;
  path: string;
  sections: LegalSection[];
};

export default function LegalDocumentPage({
  heading,
  seoTitle,
  seoDescription,
  path,
  sections,
}: LegalDocumentPageProps) {
  const scrollY = useParallax();
  const [loaded, setLoaded] = useState(false);
  const [activeSection, setActiveSection] = useState(sections[0]?.id ?? "");
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

  useEffect(() => {
    const sectionElements = sections
      .map((section) => document.getElementById(section.id))
      .filter((section): section is HTMLElement => section !== null);

    if (!sectionElements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (visibleEntry?.target.id) {
          setActiveSection(visibleEntry.target.id);
        }
      },
      {
        rootMargin: "-20% 0px -55% 0px",
        threshold: [0.2, 0.4, 0.6],
      },
    );

    sectionElements.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, [sections]);

  return (
    <>
      <Seo
        title={seoTitle}
        description={seoDescription}
        path={path}
        robots="index, follow"
      />
      <div className="landing-root legal-page-root" style={{ scrollBehavior: "smooth" }}>
        <CustomCursor />
        <AmbientOrbs scrollY={scrollY} />

        <SiteNav />

        <section className="legal-hero" ref={heroRef} style={{ opacity: 0 }}>
          <h1 className="legal-hero-title">
            <span className="hero-line">{heading}</span>
          </h1>
        </section>

        <section className="legal-layout">
          <aside className="legal-sidebar">
            <ol className="legal-toc-list">
              {sections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className={`legal-toc-link${
                      activeSection === section.id ? " is-active" : ""
                    }`}
                    aria-current={activeSection === section.id ? "true" : undefined}
                  >
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </aside>

          <div ref={contentRef} className="reveal-item legal-content">
            {sections.map((section) => (
              <section key={section.id} id={section.id} className="legal-section">
                <h2 className="legal-section-title">{section.title}</h2>
                {section.contentList ? (
                  <ul className="legal-list legal-list-content">
                    {section.content.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  section.content.map((paragraph, index) => (
                    <p key={index} className="legal-text">
                      {paragraph}
                    </p>
                  ))
                )}
                {section.list && (
                  <ul className="legal-list">
                    {section.list.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                )}
                {section.after?.map((paragraph, index) => (
                  <p key={index} className="legal-text">
                    {paragraph}
                  </p>
                ))}
              </section>
            ))}
          </div>
        </section>

        <PageFooter />
      </div>
    </>
  );
}
