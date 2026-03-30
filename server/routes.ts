import express, { type Express, type Request } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { setupAuth } from "./auth";
import { apiRateLimiter } from "./middleware/rate-limit";
import {
  createSocketServer,
  setupSocketAuth,
  setupSocketHandlers,
} from "./socket";
import { registerChatRoutes } from "./chat";
import { jwtAuth } from "./middleware/jwt-auth";
import { registerUserRoutes } from "./users";

const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

const ALLOWED_SUPPORT_ISSUE_TYPES = new Set([
  "account_deletion",
  "deletion_follow_up",
  "login_problem",
  "privacy_report",
  "other",
]);

function stripTrailingSlash(url: string) {
  return url.replace(/\/+$/, "");
}

function getSiteUrl(req?: Request) {
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

function validateSupportPayload(body: unknown) {
  const issueType =
    typeof (body as any)?.issueType === "string" ? (body as any).issueType.trim() : "";
  const message =
    typeof (body as any)?.message === "string" ? (body as any).message.trim() : "";

  if (!ALLOWED_SUPPORT_ISSUE_TYPES.has(issueType)) {
    return { error: "Invalid issue type selected" };
  }

  if (message.length < 20) {
    return { error: "Message must be at least 20 characters long" };
  }

  if (message.length > 5000) {
    return { error: "Message must be less than 5000 characters" };
  }

  return { issueType, message };
}

function registerSystemRoutes(app: Express) {
  app.get("/robots.txt", (req, res) => {
    const siteUrl = getSiteUrl(req);

    res.type("text/plain").send(
      ["User-agent: *", "Allow: /", `Sitemap: ${siteUrl}/sitemap.xml`].join(
        "\n",
      ),
    );
  });

  app.get("/sitemap.xml", (req, res) => {
    const siteUrl = getSiteUrl(req);
    const lastModified = new Date().toISOString().slice(0, 10);

    res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/</loc>
    <lastmod>${lastModified}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`);
  });
}

function registerSupportRoutes(app: Express) {
  app.post("/api/help-center", (req, res) => {
    const validation = validateSupportPayload(req.body);

    if ("error" in validation) {
      return res.status(400).json({ message: validation.error });
    }

    const payload = {
      issueType: validation.issueType,
      message: validation.message,
      submittedAt: new Date().toISOString(),
      ip: req.ip,
      userAgent: req.get("user-agent") ?? "",
    };

    console.log("[HELP_CENTER_REQUEST]", JSON.stringify(payload));

    return res.status(201).json({
      message: "Support request received",
    });
  });
}

function registerUploadRoutes(app: Express) {
  app.use("/uploads", express.static("uploads"));
  app.post("/api/upload", jwtAuth, upload.single("file"), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    res.json({
      url: `/uploads/${req.file.filename}`,
      filename: req.file.originalname,
      fileType: req.file.mimetype,
    });
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
