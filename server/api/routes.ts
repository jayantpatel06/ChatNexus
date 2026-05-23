import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { apiRateLimiter } from "../middleware/rate-limit";
import {
  escapeXml,
  getSiteUrl,
  getSitemapEntries,
  resolveAbsoluteUrl,
} from "../seo";
import {
  createSocketServer,
  setupSocketAuth,
  setupSocketHandlers,
} from "../socket";
import { registerChatRoutes } from "./chat";
import { registerUserRoutes } from "./users";
import { registerUploadRoutes } from "./upload";
import { registerSupportRoutes } from "./support";

function registerSystemRoutes(app: Express) {
  app.get("/favicon.ico", (_req, res) => {
    res.redirect(301, "/assets/images/logo-48.png");
  });

  app.get("/robots.txt", (req, res) => {
    const siteUrl = getSiteUrl(req);

    res.set("Cache-Control", "public, max-age=3600").type("text/plain").send(
      ["User-agent: *", "Allow: /", `Sitemap: ${siteUrl}/sitemap.xml`].join(
        "\n",
      ),
    );
  });

  app.get("/sitemap.xml", async (req, res, next) => {
    const siteUrl = getSiteUrl(req);
    try {
      const sitemapEntries = await getSitemapEntries();
      const sitemapXml = sitemapEntries
        .map((entry) => {
          const absoluteUrl = resolveAbsoluteUrl(siteUrl, entry.path);
          const lastModifiedTag = entry.lastModified
            ? `\n    <lastmod>${entry.lastModified}</lastmod>`
            : "";

          return `  <url>
    <loc>${escapeXml(absoluteUrl)}</loc>${lastModifiedTag}
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`;
        })
        .join("\n");

      res
        .set("Cache-Control", "public, max-age=3600")
        .type("application/xml")
        .send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapXml}
</urlset>`);
    } catch (error) {
      next(error);
    }
  });
}

export function registerRoutes(app: Express): Server {
  setupAuth(app);
  app.use("/api", apiRateLimiter);
  registerSystemRoutes(app);
  registerSupportRoutes(app);
  registerUploadRoutes(app);

  const httpServer = createServer(app);
  const io = createSocketServer(httpServer);

  registerChatRoutes(app, io);
  registerUserRoutes(app, io);

  setupSocketAuth(io);
  setupSocketHandlers(io);

  return httpServer;
}
