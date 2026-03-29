import type { Request } from "express";

function stripTrailingSlash(url: string) {
  return url.replace(/\/+$/, "");
}

export function getSiteUrl(req?: Request) {
  const configuredUrl = (
    process.env.SITE_URL ||
    process.env.VITE_SITE_URL ||
    ""
  ).trim();

  if (configuredUrl) {
    return stripTrailingSlash(configuredUrl);
  }

  if (req) {
    const forwardedProto = req.headers["x-forwarded-proto"];
    const protocol =
      typeof forwardedProto === "string"
        ? forwardedProto.split(",")[0].trim()
        : req.protocol;
    const host = req.get("host");

    if (host) {
      return `${protocol}://${host}`;
    }
  }

  return "";
}
