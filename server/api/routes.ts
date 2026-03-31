import { appendFile, mkdir } from "fs/promises";
import express, { type Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
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
import { jwtAuth } from "../middleware/jwt-auth";
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
const DEFAULT_SUPPORT_REQUESTS_PATH = "runtime/support-requests.ndjson";

type SupportPayload = {
  issueType: string;
  message: string;
};

type SupportRequestRecord = SupportPayload & {
  submittedAt: string;
  ip: string | undefined;
  userAgent: string;
};

function getSupportPayloadValue(body: unknown, key: keyof SupportPayload): string {
  if (!body || typeof body !== "object") {
    return "";
  }

  const value = (body as Partial<Record<keyof SupportPayload, unknown>>)[key];
  return typeof value === "string" ? value.trim() : "";
}

function validateSupportPayload(body: unknown) {
  const issueType = getSupportPayloadValue(body, "issueType");
  const message = getSupportPayloadValue(body, "message");

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

function resolveSupportRequestsPath() {
  const configuredPath =
    process.env.SUPPORT_REQUESTS_PATH?.trim() || DEFAULT_SUPPORT_REQUESTS_PATH;

  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.join(process.cwd(), configuredPath);
}

async function persistSupportRequest(request: SupportRequestRecord): Promise<void> {
  const supportRequestsPath = resolveSupportRequestsPath();
  await mkdir(path.dirname(supportRequestsPath), { recursive: true });
  await appendFile(supportRequestsPath, `${JSON.stringify(request)}\n`, "utf8");
}

function registerSystemRoutes(app: Express) {
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

function registerSupportRoutes(app: Express) {
  app.post("/api/help-center", async (req, res, next) => {
    const validation = validateSupportPayload(req.body);

    if ("error" in validation) {
      return res.status(400).json({ message: validation.error });
    }

    const payload: SupportRequestRecord = {
      issueType: validation.issueType,
      message: validation.message,
      submittedAt: new Date().toISOString(),
      ip: req.ip,
      userAgent: req.get("user-agent") ?? "",
    };

    try {
      await persistSupportRequest(payload);
      return res.status(201).json({
        message: "Support request received",
      });
    } catch (error) {
      next(error);
      return;
    }
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
