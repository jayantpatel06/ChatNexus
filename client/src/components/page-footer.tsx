import "./page-footer.css";
import { Link } from "wouter";
import {
  FaGithub,
  FaInstagram,
  FaLinkedinIn,
  FaXTwitter,
} from "react-icons/fa6";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { label: "Features", href: "/features" },
  { label: "About", href: "/about" },
  { label: "Help Center", href: "/help-center" },
  { label: "Contact", href: "/contact" },
];

const LEGAL_LINKS = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
];

const SOCIALS = [
  { Icon: FaXTwitter, href: "#", label: "Twitter/X" },
  { Icon: FaInstagram, href: "#", label: "Instagram" },
  { Icon: FaGithub, href: "#", label: "GitHub" },
  { Icon: FaLinkedinIn, href: "#", label: "LinkedIn" },
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
      {/* ── Top row: brand + socials ── */}
      <div className="site-footer__top">
        <Link href="/">
          <div className="site-footer__brand">
            <img
              src="/assets/images/logo-48.png"
              alt=""
              className="site-footer__logo-img"
              width="48"
              height="48"
              loading="lazy"
              decoding="async"
            />
            <span className="site-footer__brand-name">ChatNexus</span>
          </div>
        </Link>

        <div className="site-footer__socials">
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

      {/* ── Divider ── */}
      <div className="site-footer__divider" />

      {/* ── Bottom row: copyright + links ── */}
      <div className="site-footer__bottom">
        <div className="site-footer__copy">
          <span>© {new Date().getFullYear()} ChatNexus</span>
          <span>All rights reserved</span>
        </div>

        <div className="site-footer__links-wrap">
          <div className="site-footer__links">
            {NAV_LINKS.map(({ label, href }) => (
              <FooterLink key={href} href={href}>
                {label}
              </FooterLink>
            ))}
          </div>
          <div className="site-footer__links">
            {LEGAL_LINKS.map(({ label, href }) => (
              <FooterLink key={href} href={href}>
                {label}
              </FooterLink>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
