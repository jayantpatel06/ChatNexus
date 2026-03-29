import { useEffect } from "react";

type SeoProps = {
  title: string;
  description: string;
  path?: string;
  image?: string;
  /** Open Graph default image width in px (logo-512 is 512×512). */
  imageWidth?: number;
  /** Open Graph default image height in px. */
  imageHeight?: number;
  /** og:site_name and Organization-style branding. */
  siteName?: string;
  /** og:locale (e.g. en_US). */
  locale?: string;
  keywords?: string;
  robots?: string;
  structuredData?: Record<string, unknown> | Array<Record<string, unknown>>;
};

const DEFAULT_IMAGE = "/assets/images/logo-512.png";
const DEFAULT_SITE_NAME = "ChatNexus";
const DEFAULT_LOCALE = "en_US";
const DEFAULT_OG_IMAGE_SIZE = 512;

function upsertMeta(
  selector: string,
  attributes: Record<string, string>,
  content: string,
) {
  let element = document.head.querySelector(selector) as HTMLMetaElement | null;

  if (!element) {
    element = document.createElement("meta");
    Object.entries(attributes).forEach(([key, value]) =>
      element!.setAttribute(key, value),
    );
    document.head.appendChild(element);
  }

  element.setAttribute("content", content);
}

function upsertLink(
  selector: string,
  attributes: Record<string, string>,
  href: string,
) {
  let element = document.head.querySelector(selector) as HTMLLinkElement | null;

  if (!element) {
    element = document.createElement("link");
    Object.entries(attributes).forEach(([key, value]) =>
      element!.setAttribute(key, value),
    );
    document.head.appendChild(element);
  }

  element.setAttribute("href", href);
}

function resolveSiteUrl() {
  const envUrl = import.meta.env.VITE_SITE_URL?.trim();
  if (envUrl) {
    return envUrl.replace(/\/+$/, "");
  }

  if (typeof window !== "undefined" && window.location.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }

  return "";
}

function resolveUrl(siteUrl: string, path = "/") {
  return new URL(path, `${siteUrl}/`).toString();
}

export function Seo({
  title,
  description,
  path = "/",
  image = DEFAULT_IMAGE,
  imageWidth = DEFAULT_OG_IMAGE_SIZE,
  imageHeight = DEFAULT_OG_IMAGE_SIZE,
  siteName = DEFAULT_SITE_NAME,
  locale = DEFAULT_LOCALE,
  keywords,
  robots = "index, follow",
  structuredData,
}: SeoProps) {
  useEffect(() => {
    const siteUrl = resolveSiteUrl();
    const canonicalUrl = resolveUrl(siteUrl, path);
    const imageUrl = resolveUrl(siteUrl, image);
    const imageAlt =
      title.includes(siteName) ? title : `${title} | ${siteName}`;

    document.title = title;

    upsertMeta(
      'meta[name="description"]',
      { name: "description" },
      description,
    );
    upsertMeta('meta[name="keywords"]', { name: "keywords" }, keywords ?? "");
    upsertMeta('meta[name="robots"]', { name: "robots" }, robots);

    upsertMeta('meta[property="og:title"]', { property: "og:title" }, title);
    upsertMeta(
      'meta[property="og:description"]',
      { property: "og:description" },
      description,
    );
    upsertMeta('meta[property="og:type"]', { property: "og:type" }, "website");
    upsertMeta('meta[property="og:url"]', { property: "og:url" }, canonicalUrl);
    upsertMeta('meta[property="og:image"]', { property: "og:image" }, imageUrl);
    upsertMeta(
      'meta[property="og:image:width"]',
      { property: "og:image:width" },
      String(imageWidth),
    );
    upsertMeta(
      'meta[property="og:image:height"]',
      { property: "og:image:height" },
      String(imageHeight),
    );
    upsertMeta(
      'meta[property="og:image:alt"]',
      { property: "og:image:alt" },
      imageAlt,
    );
    upsertMeta(
      'meta[property="og:site_name"]',
      { property: "og:site_name" },
      siteName,
    );
    upsertMeta(
      'meta[property="og:locale"]',
      { property: "og:locale" },
      locale,
    );

    upsertMeta(
      'meta[name="twitter:card"]',
      { name: "twitter:card" },
      "summary_large_image",
    );
    upsertMeta('meta[name="twitter:title"]', { name: "twitter:title" }, title);
    upsertMeta(
      'meta[name="twitter:description"]',
      { name: "twitter:description" },
      description,
    );
    upsertMeta(
      'meta[name="twitter:image"]',
      { name: "twitter:image" },
      imageUrl,
    );

    upsertLink('link[rel="canonical"]', { rel: "canonical" }, canonicalUrl);

    const bingVerify = import.meta.env.VITE_BING_SITE_VERIFICATION?.trim();
    if (bingVerify) {
      upsertMeta(
        'meta[name="msvalidate.01"]',
        { name: "msvalidate.01" },
        bingVerify,
      );
    }

    let script = document.getElementById(
      "structured-data",
    ) as HTMLScriptElement | null;

    if (structuredData) {
      if (!script) {
        script = document.createElement("script");
        script.id = "structured-data";
        script.type = "application/ld+json";
        document.head.appendChild(script);
      }

      script.textContent = JSON.stringify(structuredData);
    } else if (script) {
      script.remove();
    }
  }, [
    description,
    image,
    imageHeight,
    imageWidth,
    keywords,
    locale,
    path,
    robots,
    siteName,
    structuredData,
    title,
  ]);

  return null;
}

export function getSiteUrl() {
  return resolveSiteUrl();
}
