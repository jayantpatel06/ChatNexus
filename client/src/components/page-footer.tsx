import "./page-footer.css";
import { Link } from "wouter";
import {
  FaGithub,
  FaInstagram,
  FaLinkedinIn,
  FaXTwitter,
} from "react-icons/fa6";
import { cn } from "@/lib/utils";

const NAVIGATE_LINKS = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  { label: "Blog", href: "/blog" },
  { label: "Contact", href: "/contact" },
  { label: "Help Center", href: "/help-center" },
];

const FEATURES_LINKS = [
  { label: "Anonymous Chat", href: "/anonymous-chat" },
  { label: "Random Chat", href: "/random-chat" },
  { label: "Stranger Chat", href: "/stranger-chat" },
  { label: "Global Chat Room", href: "/global-chat-room" },
  { label: "Features", href: "/features" },
];

const ALTERNATIVE_LINKS = [
  { label: "Omegle Alternative", href: "/omegle-alternative" },
  { label: "Ome.tv Alternative", href: "/ometv-alternative" },
  { label: "Chatib Alternative", href: "/chatib-alternative" },
  { label: "Monkey App Alternative", href: "/monkey-app-alternative" },
  { label: "ChitChat Alternative", href: "/chitchat-alternative" },
];

const LEGAL_LINKS = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
];

const LINKEDIN_URL = "https://linkedin.com/in/jayantpatel06";

const SOCIALS = [
  { Icon: FaXTwitter, href: LINKEDIN_URL, label: "Twitter/X" },
  { Icon: FaInstagram, href: LINKEDIN_URL, label: "Instagram" },
  { Icon: FaGithub, href: LINKEDIN_URL, label: "GitHub" },
  { Icon: FaLinkedinIn, href: LINKEDIN_URL, label: "LinkedIn" },
];

function FooterLink({
  children,
  href,
  className,
}: {
  children: string;
  href: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "site-footer__link group relative inline-flex items-center",
        "before:pointer-events-none before:absolute before:left-0 before:top-[1.5em] before:h-[0.05em] before:w-full before:bg-current before:content-['']",
        "before:origin-center before:scale-x-0 before:transition-transform before:duration-300 before:[transition-timing-function:cubic-bezier(0.4,0,0.2,1)]",
        "hover:before:scale-x-100",
        className,
      )}
    >
      <span>{children}</span>
      <svg
        className="ml-[0.3em] mt-[0em] size-[0.55em] translate-y-1 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 motion-reduce:transition-none"
        fill="none"
        viewBox="0 0 10 10"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M1.004 9.166 9.337.833m0 0v8.333m0-8.333H1.004"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
}

export default function PageFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__main">
        {/* ── Left Info Column ── */}
        <div className="site-footer__info">
          <Link href="/">
            <div className="site-footer__brand">
              <img
                src="/assets/images/logo-48.webp"
                alt="ChatNexus"
                className="site-footer__logo-img"
                width="36"
                height="36"
                loading="lazy"
                decoding="async"
              />
              <span className="site-footer__brand-name">ChatNexus</span>
            </div>
          </Link>
          <p className="site-footer__desc">
            Anonymous chat platform built for privacy, safety, and real human connections worldwide.
          </p>
          <Link href="/auth?redirect=/random" className="site-footer__cta">
            Start Chatting
          </Link>
        </div>

        {/* ── Right Links Area ── */}
        <div className="site-footer__links-area">
          <div className="site-footer__link-column">
            <h4 className="site-footer__col-title">Navigate</h4>
            <div className="site-footer__links">
              {NAVIGATE_LINKS.map(({ label, href }) => (
                <FooterLink key={href} href={href}>
                  {label}
                </FooterLink>
              ))}
            </div>
          </div>

          <div className="site-footer__link-column">
            <h4 className="site-footer__col-title">Features</h4>
            <div className="site-footer__links">
              {FEATURES_LINKS.map(({ label, href }) => (
                <FooterLink key={href} href={href}>
                  {label}
                </FooterLink>
              ))}
            </div>
          </div>

          <div className="site-footer__link-column">
            <h4 className="site-footer__col-title">Alternatives</h4>
            <div className="site-footer__links">
              {ALTERNATIVE_LINKS.map(({ label, href }) => (
                <FooterLink key={href} href={href}>
                  {label}
                </FooterLink>
              ))}
            </div>
          </div>

          <div className="site-footer__link-column">
            <h4 className="site-footer__col-title">Legal</h4>
            <div className="site-footer__links">
              {LEGAL_LINKS.map(({ label, href }) => (
                <FooterLink key={href} href={href}>
                  {label}
                </FooterLink>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="site-footer__divider" />

      {/* ── Bottom row: copyright and socials ── */}
      <div className="site-footer__bottom">
        <div className="site-footer__copy-left">
          <span>© {new Date().getFullYear()} ChatNexus. All rights reserved.</span>
        </div>

        <div className="site-footer__socials-bottom">
          {SOCIALS.map(({ Icon, href, label }) => (
            <a
              key={label}
              href={href}
              className="site-footer__social-icon"
              aria-label={label}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon className="w-[16px] h-[16px]" />
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
