import { stat } from "fs/promises";
import path from "path";
import type { Request } from "express";

type SitemapChangefreq = "daily" | "weekly" | "monthly";
type StructuredDataRecord = Record<string, unknown>;
type StructuredDataValue =
  | StructuredDataRecord
  | Array<StructuredDataRecord>;

type RouteSeoConfig = {
  path: string;
  title: string;
  description: string;
  heading: string;
  summary: string[];
  keywords?: string;
  robots?: string;
  statusCode?: number;
  indexable?: boolean;
  changefreq?: SitemapChangefreq;
  priority?: string;
  image?: string;
  sourceFiles?: string[];
  structuredData?: (
    siteUrl: string,
    canonicalUrl: string,
  ) => StructuredDataValue;
};

export type SitemapEntry = {
  path: string;
  changefreq: SitemapChangefreq;
  priority: string;
  lastModified?: string;
};

export type ResolvedSeoPage = RouteSeoConfig & {
  indexable: boolean;
  robots: string;
  statusCode: number;
};

export const DEFAULT_SITE_NAME = "ChatNexus";
export const DEFAULT_OG_LOCALE = "en_US";
export const DEFAULT_LANGUAGE = "en-US";
export const DEFAULT_IMAGE_PATH = "/assets/images/logo-512.png";
export const DEFAULT_LOGO_WIDTH = 512;
export const DEFAULT_LOGO_HEIGHT = 512;
export const INDEXABLE_ROBOTS =
  "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";
export const NOINDEX_ROBOTS = "noindex, nofollow";
export const HOME_SEO_TITLE = "ChatNexus - Talk to strangers";
export const HOME_SEO_DESCRIPTION =
  "Talk to strangers, make friends, and jump into random chat on ChatNexus. Start anonymous conversations instantly and connect with people worldwide.";
export const AUTH_SEO_DESCRIPTION =
  "Log in, register, or continue as a guest to start chatting on ChatNexus.";

function buildOrganizationStructuredData(siteUrl: string) {
  const logoUrl = resolveAbsoluteUrl(siteUrl, DEFAULT_IMAGE_PATH);

  return {
    "@type": "Organization",
    name: DEFAULT_SITE_NAME,
    url: `${siteUrl}/`,
    description: HOME_SEO_DESCRIPTION,
    logo: {
      "@type": "ImageObject",
      url: logoUrl,
      width: DEFAULT_LOGO_WIDTH,
      height: DEFAULT_LOGO_HEIGHT,
    },
    image: logoUrl,
  };
}

const HOME_FAQS = [
  {
    question: "What makes ChatNexus a strong Omegle alternative?",
    answer:
      "ChatNexus focuses on fast anonymous chat, guest access, mobile-friendly messaging, and public conversations that help new users jump into live discussions quickly.",
  },
  {
    question: "Can I talk to strangers without a long signup flow?",
    answer:
      "Yes. New users can use guest access to start chatting quickly, then create an account later if they want a more persistent profile.",
  },
  {
    question: "Does ChatNexus work on phones and desktops?",
    answer:
      "Yes. The interface is responsive, installable as a PWA, and designed for real-time chatting across desktop and mobile devices.",
  },
] as const;

const PUBLIC_ROUTE_DEFINITIONS: readonly RouteSeoConfig[] = [
  {
    path: "/",
    title: HOME_SEO_TITLE,
    description: HOME_SEO_DESCRIPTION,
    heading: "Talk to Strangers and Start Conversations Instantly",
    summary: [
      "ChatNexus lets you talk to strangers, meet new people, and jump into live conversations without a long signup flow.",
      "Use guest access for instant anonymous chat, explore global messaging, and create an account when you want a more persistent profile.",
    ],
    keywords:
      "Omegle alternative, stranger chat, anonymous chat, random chat, talk to strangers, global chat, guest chat, ChatNexus",
    indexable: true,
    changefreq: "daily",
    priority: "1.0",
    sourceFiles: ["client/src/pages/landing-page.tsx"],
    structuredData: (siteUrl, canonicalUrl) => [
      {
        "@context": "https://schema.org",
        ...buildOrganizationStructuredData(siteUrl),
      },
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: DEFAULT_SITE_NAME,
        url: `${siteUrl}/`,
        description: HOME_SEO_DESCRIPTION,
        inLanguage: "en",
        publisher: buildOrganizationStructuredData(siteUrl),
      },
      {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        name: DEFAULT_SITE_NAME,
        applicationCategory: "CommunicationApplication",
        operatingSystem: "Web",
        url: canonicalUrl,
        description: HOME_SEO_DESCRIPTION,
        image: resolveAbsoluteUrl(siteUrl, DEFAULT_IMAGE_PATH),
        publisher: buildOrganizationStructuredData(siteUrl),
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: HOME_FAQS.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.answer,
          },
        })),
      },
    ],
  },
  {
    path: "/features",
    title: "Features | ChatNexus",
    description:
      "Explore all the features that make ChatNexus the fastest, most private way to chat with strangers online.",
    heading: "Chat Features for Fast, Private Conversations",
    summary: [
      "ChatNexus combines real-time messaging, guest access, global chat rooms, privacy-first design, and mobile-friendly PWA support.",
      "The platform is designed for low-friction stranger chat, media sharing, and responsive performance across phone and desktop browsers.",
    ],
    keywords:
      "ChatNexus features, anonymous chat features, real-time messaging, global chat rooms, guest access, PWA chat app",
    indexable: true,
    changefreq: "weekly",
    priority: "0.9",
    sourceFiles: ["client/src/pages/features-page.tsx"],
  },
  {
    path: "/about",
    title: "About | ChatNexus",
    description:
      "Learn about ChatNexus and our mission to make anonymous stranger chat safe, fast, and accessible for everyone.",
    heading: "About ChatNexus",
    summary: [
      "ChatNexus was created to make meeting strangers online feel fast, safe, and accessible without the friction of legacy chat platforms.",
      "The product focuses on privacy-first messaging, guest access, responsive performance, and a more transparent communication experience.",
    ],
    keywords:
      "about ChatNexus, ChatNexus team, anonymous chat platform mission, stranger chat story",
    indexable: true,
    changefreq: "monthly",
    priority: "0.8",
    sourceFiles: ["client/src/pages/about-page.tsx"],
  },
  {
    path: "/contact",
    title: "Contact Us | ChatNexus",
    description:
      "Get in touch with the ChatNexus team for questions, feedback, partnerships, or support-related follow-up.",
    heading: "Contact the ChatNexus Team",
    summary: [
      "Use the ChatNexus contact page for general questions, feedback, partnership requests, and support escalations.",
      "The page provides direct contact paths, help-center routing, and expected response timing for common inquiries.",
    ],
    keywords:
      "contact ChatNexus, ChatNexus support, reach ChatNexus team",
    indexable: true,
    changefreq: "monthly",
    priority: "0.8",
    sourceFiles: ["client/src/pages/contact-page.tsx"],
  },
  {
    path: "/help-center",
    title: "Help Center | ChatNexus",
    description:
      "Get help with your ChatNexus account, privacy requests, login issues, and support questions from one dedicated help center.",
    heading: "ChatNexus Help Center",
    summary: [
      "The help center covers account deletion, login issues, privacy concerns, guest usage questions, and general support requests.",
      "Users can review common questions and submit a request directly to the support inbox when they need account help.",
    ],
    indexable: true,
    changefreq: "weekly",
    priority: "0.8",
    sourceFiles: ["client/src/pages/help-center-page.tsx"],
  },
  {
    path: "/privacy",
    title: "Privacy Policy | ChatNexus",
    description:
      "Read the ChatNexus privacy policy to understand how account data, messages, device information, and support requests are handled.",
    heading: "ChatNexus Privacy Policy",
    summary: [
      "This page explains what information ChatNexus collects, how the service uses that information, and how users can request deletion or correction.",
      "It also covers cookies and local storage, data retention, security practices, children's privacy, and how to contact the team about privacy rights.",
    ],
    indexable: true,
    changefreq: "monthly",
    priority: "0.6",
    sourceFiles: ["client/src/pages/privacy-policy-page.tsx"],
  },
  {
    path: "/terms",
    title: "Terms of Service | ChatNexus",
    description:
      "Read the ChatNexus Terms of Service covering eligibility, acceptable use, user content, guest access, and platform rules.",
    heading: "ChatNexus Terms of Service",
    summary: [
      "The terms page defines eligibility, acceptable use, user content rules, guest access conditions, account responsibilities, and service limitations.",
      "It also explains termination rights, intellectual property, legal disclaimers, and how future updates to the terms are communicated.",
    ],
    indexable: true,
    changefreq: "monthly",
    priority: "0.6",
    sourceFiles: ["client/src/pages/terms-of-service-page.tsx"],
  },
  {
    path: "/auth",
    title: "Login | ChatNexus",
    description: AUTH_SEO_DESCRIPTION,
    heading: "Access ChatNexus",
    summary: [
      "Use this page to log in, create an account, or continue as a guest to start chatting on ChatNexus.",
    ],
    indexable: true,
    changefreq: "monthly",
    priority: "0.7",
    sourceFiles: ["client/src/pages/auth-page.tsx"],
  },
  {
    path: "/dashboard",
    title: "Dashboard | ChatNexus",
    description: "Protected chat dashboard inside ChatNexus.",
    heading: "ChatNexus Dashboard",
    summary: [
      "This area is part of the protected ChatNexus application experience.",
    ],
    robots: NOINDEX_ROBOTS,
    indexable: false,
    sourceFiles: ["client/src/pages/chat-dashboard-page.tsx"],
  },
  {
    path: "/global-chat",
    title: "Global Chat | ChatNexus",
    description: "Protected global chat inside ChatNexus.",
    heading: "Global Chat",
    summary: [
      "This area is part of the protected ChatNexus application experience.",
    ],
    robots: NOINDEX_ROBOTS,
    indexable: false,
    sourceFiles: ["client/src/pages/global-chat-page.tsx"],
  },
] as const;

const NOT_FOUND_ROUTE: RouteSeoConfig = {
  path: "/404",
  title: "Page Not Found | ChatNexus",
  description: "The requested ChatNexus page could not be found.",
  heading: "Page Not Found",
  summary: [
    "The page you requested does not exist, may have moved, or is no longer available.",
  ],
  robots: NOINDEX_ROBOTS,
  statusCode: 404,
  indexable: false,
};

const ROUTE_MAP = new Map(
  PUBLIC_ROUTE_DEFINITIONS.map((route) => [route.path, route]),
);

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeJsonForHtml(value: StructuredDataValue) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function replaceTagContent(
  html: string,
  pattern: RegExp,
  replacement: string,
) {
  return html.replace(pattern, replacement);
}

function replaceMetaContent(html: string, id: string, content: string) {
  const escapedContent = escapeHtml(content);
  const pattern = new RegExp(
    `(<meta[^>]*id="${id}"[^>]*content=")[^"]*(".*?>)`,
    "i",
  );
  return replaceTagContent(html, pattern, `$1${escapedContent}$2`);
}

function replaceLinkHref(html: string, id: string, href: string) {
  const escapedHref = escapeHtml(href);
  const pattern = new RegExp(
    `(<link[^>]*id="${id}"[^>]*href=")[^"]*(".*?>)`,
    "i",
  );
  return replaceTagContent(html, pattern, `$1${escapedHref}$2`);
}

function replaceScriptContent(html: string, id: string, content: string) {
  const pattern = new RegExp(
    `(<script[^>]*id="${id}"[^>]*>)[\\s\\S]*?(</script>)`,
    "i",
  );
  return replaceTagContent(html, pattern, `$1${content}$2`);
}

function removeScriptById(html: string, id: string) {
  const pattern = new RegExp(
    `<script[^>]*id="${id}"[^>]*>[\\s\\S]*?</script>\\s*`,
    "i",
  );
  return replaceTagContent(html, pattern, "");
}

function buildDefaultStructuredData(
  page: ResolvedSeoPage,
  siteUrl: string,
  canonicalUrl: string,
): StructuredDataValue | undefined {
  if (!page.indexable || page.robots.includes("noindex")) {
    return undefined;
  }

  if (page.structuredData) {
    return page.structuredData(siteUrl, canonicalUrl);
  }

  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: page.title,
    description: page.description,
    url: canonicalUrl,
    inLanguage: DEFAULT_LANGUAGE,
    isPartOf: {
      "@type": "WebSite",
      name: DEFAULT_SITE_NAME,
      url: `${siteUrl}/`,
    },
    publisher: {
      ...buildOrganizationStructuredData(siteUrl),
    },
    primaryImageOfPage: resolveAbsoluteUrl(
      siteUrl,
      page.image ?? DEFAULT_IMAGE_PATH,
    ),
  };
}

function buildNoscriptFallback(page: ResolvedSeoPage, siteUrl: string) {
  const links = page.indexable
    ? [
        { href: "/", label: "Home" },
        { href: "/auth", label: "Login" },
        { href: "/features", label: "Features" },
        { href: "/about", label: "About" },
        { href: "/help-center", label: "Help Center" },
        { href: "/contact", label: "Contact" },
        { href: "/privacy", label: "Privacy" },
        { href: "/terms", label: "Terms" },
      ]
    : [{ href: "/", label: "Return Home" }];

  const listItems = links
    .map(
      (link) =>
        `<li style="margin:0 0 8px;"><a href="${escapeHtml(
          resolveAbsoluteUrl(siteUrl, link.href),
        )}" style="color:#0f4b91;">${escapeHtml(link.label)}</a></li>`,
    )
    .join("");

  const paragraphs = page.summary
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;line-height:1.65;">${escapeHtml(
          paragraph,
        )}</p>`,
    )
    .join("");

  return `<noscript id="seo-noscript-fallback">
  <main style="margin:0 auto;max-width:760px;padding:32px 20px 48px;color:#111827;font:16px/1.6 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <h1 style="margin:0 0 16px;font-size:32px;line-height:1.2;">${escapeHtml(
      page.heading,
    )}</h1>
    ${paragraphs}
    <h2 style="margin:24px 0 12px;font-size:20px;">Useful links</h2>
    <ul style="margin:0;padding-left:20px;">
      ${listItems}
    </ul>
  </main>
</noscript>`;
}

async function resolveLastModified(
  route: RouteSeoConfig,
): Promise<string | undefined> {
  if (!route.sourceFiles?.length) {
    return undefined;
  }

  let latestTimestamp = 0;

  for (const sourceFile of route.sourceFiles) {
    try {
      const fileStats = await stat(path.resolve(process.cwd(), sourceFile));
      latestTimestamp = Math.max(latestTimestamp, fileStats.mtimeMs);
    } catch {
      // Ignore missing files in deployments that don't ship sources.
    }
  }

  if (!latestTimestamp) {
    return undefined;
  }

  return new Date(latestTimestamp).toISOString().slice(0, 10);
}

export function stripTrailingSlash(url: string) {
  return url.replace(/\/+$/, "");
}

export function normalizePathname(pathname: string) {
  const cleanPath = pathname.split("?")[0].split("#")[0].trim();
  if (!cleanPath || cleanPath === "/") {
    return "/";
  }

  return cleanPath.replace(/\/+$/, "") || "/";
}

export function isAssetLikePath(pathname: string) {
  const normalizedPath = normalizePathname(pathname);
  if (
    normalizedPath.startsWith("/api/") ||
    normalizedPath.startsWith("/assets/") ||
    normalizedPath.startsWith("/uploads/") ||
    normalizedPath.startsWith("/@vite/") ||
    normalizedPath.startsWith("/@fs/") ||
    normalizedPath.startsWith("/node_modules/") ||
    normalizedPath.startsWith("/src/")
  ) {
    return true;
  }

  return /\.[a-z0-9]+$/i.test(path.posix.basename(normalizedPath));
}

export function getSiteUrl(req?: Request) {
  const configuredUrl = (
    process.env.SITE_URL ||
    process.env.VITE_SITE_URL ||
    process.env.FRONTEND_URL ||
    ""
  ).trim();

  if (configuredUrl) {
    return stripTrailingSlash(configuredUrl);
  }

  if (!req) {
    return "";
  }

  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol =
    typeof forwardedProto === "string"
      ? forwardedProto.split(",")[0].trim()
      : req.protocol;
  const host = req.get("host");

  if (!host) {
    return "";
  }

  return `${protocol}://${host}`;
}

export function resolveAbsoluteUrl(siteUrl: string, routePath: string) {
  if (routePath === "/") {
    return `${siteUrl}/`;
  }

  return `${siteUrl}${routePath}`;
}

export function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function resolveSeoPage(pathname: string): ResolvedSeoPage {
  const normalizedPath = normalizePathname(pathname);
  const route = ROUTE_MAP.get(normalizedPath);

  if (route) {
    return {
      ...route,
      indexable: route.indexable ?? true,
      robots: route.robots ?? INDEXABLE_ROBOTS,
      statusCode: route.statusCode ?? 200,
    };
  }

  return {
    ...NOT_FOUND_ROUTE,
    path: normalizedPath,
    indexable: false,
    robots: NOT_FOUND_ROUTE.robots ?? NOINDEX_ROBOTS,
    statusCode: NOT_FOUND_ROUTE.statusCode ?? 404,
  };
}

export async function getSitemapEntries(): Promise<SitemapEntry[]> {
  const publicRoutes = PUBLIC_ROUTE_DEFINITIONS.filter(
    (route) => route.indexable && route.changefreq && route.priority,
  );

  return Promise.all(
    publicRoutes.map(async (route) => ({
      path: route.path,
      changefreq: route.changefreq!,
      priority: route.priority!,
      lastModified: await resolveLastModified(route),
    })),
  );
}

export function applySeoToHtml(
  html: string,
  page: ResolvedSeoPage,
  siteUrl: string,
) {
  const canonicalUrl = resolveAbsoluteUrl(siteUrl, page.path);
  const imageUrl = resolveAbsoluteUrl(
    siteUrl,
    page.image ?? DEFAULT_IMAGE_PATH,
  );
  const imageAlt = page.title.includes(DEFAULT_SITE_NAME)
    ? page.title
    : `${page.title} | ${DEFAULT_SITE_NAME}`;
  const structuredData = buildDefaultStructuredData(page, siteUrl, canonicalUrl);

  let nextHtml = html;

  nextHtml = replaceTagContent(
    nextHtml,
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeHtml(page.title)}</title>`,
  );
  nextHtml = replaceMetaContent(nextHtml, "seo-description", page.description);
  nextHtml = replaceMetaContent(nextHtml, "seo-keywords", page.keywords ?? "");
  nextHtml = replaceMetaContent(nextHtml, "seo-robots", page.robots);
  nextHtml = replaceMetaContent(nextHtml, "seo-og-title", page.title);
  nextHtml = replaceMetaContent(nextHtml, "seo-og-description", page.description);
  nextHtml = replaceMetaContent(nextHtml, "seo-og-url", canonicalUrl);
  nextHtml = replaceMetaContent(nextHtml, "seo-og-image", imageUrl);
  nextHtml = replaceMetaContent(nextHtml, "seo-og-image-alt", imageAlt);
  nextHtml = replaceMetaContent(nextHtml, "seo-twitter-title", page.title);
  nextHtml = replaceMetaContent(
    nextHtml,
    "seo-twitter-description",
    page.description,
  );
  nextHtml = replaceMetaContent(nextHtml, "seo-twitter-image", imageUrl);
  nextHtml = replaceLinkHref(nextHtml, "seo-canonical", canonicalUrl);
  nextHtml = replaceLinkHref(nextHtml, "seo-alt-en", canonicalUrl);
  nextHtml = replaceLinkHref(nextHtml, "seo-alt-default", canonicalUrl);

  if (structuredData) {
    nextHtml = replaceScriptContent(
      nextHtml,
      "seo-structured-data",
      escapeJsonForHtml(structuredData),
    );
  } else {
    nextHtml = removeScriptById(nextHtml, "seo-structured-data");
  }

  nextHtml = replaceTagContent(
    nextHtml,
    /<noscript id="seo-noscript-fallback">[\s\S]*?<\/noscript>\s*/i,
    "",
  );

  return replaceTagContent(
    nextHtml,
    /<\/body>/i,
    `${buildNoscriptFallback(page, siteUrl)}\n  </body>`,
  );
}
